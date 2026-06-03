const jwt = require('jsonwebtoken');
const { Chess } = require('chess.js');
const { pool, query } = require('../config/database');
const { applyBotMoveIfNeeded, isBotGame } = require('../lib/bot');
const { completeGame, getGameWithMoves } = require('../lib/game');

const botJobs = new Set();

function gameRoom(gameId) {
  return `game:${gameId}`;
}

function socketTransport(socket) {
  return socket.conn?.transport?.name || 'unknown';
}

function logSocket(event, socket, extra = {}) {
  const parts = [
    `[socket:${event}]`,
    `user=${socket.user?.id || 'unknown'}`,
    `socket=${socket.id}`,
    `transport=${socketTransport(socket)}`,
  ];

  if (extra.gameId) parts.push(`game=${extra.gameId}`);
  if (extra.room) parts.push(`room=${extra.room}`);
  if (extra.reason) parts.push(`reason=${extra.reason}`);
  if (extra.roomSize !== undefined) parts.push(`roomSize=${extra.roomSize}`);
  if (extra.recovered !== undefined) parts.push(`recovered=${extra.recovered}`);

  console.log(parts.join(' '));
}

async function socketUser(token) {
  if (!token) return null;
  const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-me');
  const users = await query(
    'SELECT id, name, role, status FROM users WHERE id = ?',
    [payload.id],
  );
  return users[0] || null;
}

function wireGameSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = await socketUser(token);
      if (!user || user.status !== 'active') return next(new Error('Active account required.'));
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid session.'));
    }
  });

  socketEvents(io);
}

function socketEvents(io) {
  io.on('connection', (socket) => {
    logSocket(socket.recovered ? 'reconnect' : 'connect', socket, { recovered: socket.recovered });

    socket.conn.on('upgrade', () => {
      logSocket('transport-upgrade', socket);
    });

    socket.on('disconnecting', (reason) => {
      const rooms = [...socket.rooms].filter((room) => room !== socket.id);
      logSocket('disconnecting', socket, { reason, room: rooms.join(',') || 'none' });
    });

    socket.on('disconnect', (reason) => {
      logSocket('disconnect', socket, { reason });
    });

    socket.on('socket:client-reconnect', ({ gameId, attempt } = {}) => {
      logSocket('client-reconnect', socket, { gameId, reason: `attempt=${attempt || 'unknown'}` });
    });

    socket.on('game:join', async ({ gameId }, callback) => {
      try {
        const game = await getGameWithMoves(gameId);
        if (!game) return callback?.({ ok: false, message: 'Game not found.' });
        const canView = socket.user.role !== 'player' || [game.white_player_id, game.black_player_id].includes(socket.user.id);
        if (!canView) return callback?.({ ok: false, message: 'You cannot view this game.' });
        const room = gameRoom(gameId);
        socket.join(room);
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        logSocket('room-join', socket, { gameId, room, roomSize });
        callback?.({ ok: true, game });
        io.to(room).emit('game:state', { game });
      } catch (error) {
        callback?.({ ok: false, message: 'Could not join game.' });
      }
    });

    socket.on('game:move', async ({ gameId, from, to, promotion }, callback) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [[game]] = await connection.execute('SELECT * FROM games WHERE id = ? FOR UPDATE', [gameId]);
        if (!game) throw new Error('Game not found.');
        if (game.status !== 'active') throw new Error('Game is not active.');

        const chess = new Chess(game.current_fen);
        const expectedPlayerId = chess.turn() === 'w' ? game.white_player_id : game.black_player_id;
        if (socket.user.id !== expectedPlayerId) throw new Error('It is not your turn.');

        const move = chess.move({ from, to, promotion: promotion || undefined });
        if (!move) throw new Error('Illegal move.');

        const fen = chess.fen();
        const pgn = chess.pgn();
        const [[countRow]] = await connection.execute('SELECT COUNT(*) AS move_count FROM game_moves WHERE game_id = ?', [gameId]);
        const moveNumber = Number(countRow.move_count) + 1;

        await connection.execute(
          `INSERT INTO game_moves
           (game_id, player_id, move_number, from_square, to_square, promotion, san, fen_after)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [gameId, socket.user.id, moveNumber, from, to, promotion || null, move.san, fen],
        );
        await connection.execute('UPDATE games SET current_fen = ?, pgn = ? WHERE id = ?', [fen, pgn, gameId]);
        await connection.commit();

        let finished = null;
        if (chess.isCheckmate()) {
          finished = await completeGame(gameId, chess.turn() === 'w' ? 'black_win' : 'white_win', 'checkmate', socket.user.id);
        } else if (chess.isDraw() || chess.isStalemate()) {
          finished = await completeGame(gameId, 'draw', chess.isStalemate() ? 'stalemate' : 'draw', socket.user.id);
        }

        const pendingBotMove = !finished && isBotGame(game);
        const updated = await getGameWithMoves(gameId);
        const payload = {
          game: updated,
          lastMove: move,
          movedBy: socket.user.id,
          movedByName: socket.user.name,
          san: move.san,
          finished,
          pendingBotMove,
        };
        const room = gameRoom(gameId);
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        logSocket('move-broadcast', socket, { gameId, room, roomSize });
        io.to(room).emit('game:move-applied', payload);
        io.to(room).emit('game:updated', payload);
        callback?.({ ok: true, game: updated });

        if (pendingBotMove) {
          scheduleBotMove(io, gameId);
        }
      } catch (error) {
        await connection.rollback();
        callback?.({ ok: false, message: error.message || 'Move failed.' });
      } finally {
        connection.release();
      }
    });
  });
}

function scheduleBotMove(io, gameId) {
  if (botJobs.has(gameId)) return;
  botJobs.add(gameId);

  setTimeout(async () => {
    try {
      const botResult = await applyBotMoveIfNeeded(gameId);
      if (!botResult) return;

      let finished = null;
      if (botResult.chess.isCheckmate()) {
        finished = await completeGame(gameId, botResult.chess.turn() === 'w' ? 'black_win' : 'white_win', 'checkmate');
      } else if (botResult.chess.isDraw() || botResult.chess.isStalemate()) {
        finished = await completeGame(gameId, 'draw', botResult.chess.isStalemate() ? 'stalemate' : 'draw');
      }

      const updated = await getGameWithMoves(gameId);
      const room = gameRoom(gameId);
      const payload = {
        game: updated,
        lastMove: botResult.move,
        movedBy: null,
        movedByName: 'Stockfish',
        san: botResult.move.san,
        finished,
        pendingBotMove: false,
      };
      console.log(`[socket:move-broadcast] user=bot socket=bot transport=server game=${gameId} room=${room} roomSize=${io.sockets.adapter.rooms.get(room)?.size || 0}`);
      io.to(room).emit('game:move-applied', payload);
      io.to(room).emit('game:updated', payload);
    } catch (error) {
      io.to(gameRoom(gameId)).emit('game:bot-error', { message: error.message || 'Bot move failed.' });
    } finally {
      botJobs.delete(gameId);
    }
  }, 150);
}

module.exports = { wireGameSockets };
