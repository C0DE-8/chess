const jwt = require('jsonwebtoken');
const { Chess } = require('chess.js');
const { pool, query } = require('../config/database');
const { applyBotMoveIfNeeded } = require('../lib/bot');
const { completeGame, getGameWithMoves } = require('../lib/game');

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
    socket.on('game:join', async ({ gameId }, callback) => {
      try {
        const game = await getGameWithMoves(gameId);
        if (!game) return callback?.({ ok: false, message: 'Game not found.' });
        const canView = socket.user.role !== 'player' || [game.white_player_id, game.black_player_id].includes(socket.user.id);
        if (!canView) return callback?.({ ok: false, message: 'You cannot view this game.' });
        socket.join(`game:${gameId}`);
        callback?.({ ok: true, game });
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

        let botMove = null;
        if (!finished) {
          const botResult = await applyBotMoveIfNeeded(gameId);
          botMove = botResult?.move || null;

          if (botResult?.chess?.isCheckmate()) {
            finished = await completeGame(gameId, botResult.chess.turn() === 'w' ? 'black_win' : 'white_win', 'checkmate');
          } else if (botResult?.chess && (botResult.chess.isDraw() || botResult.chess.isStalemate())) {
            finished = await completeGame(gameId, 'draw', botResult.chess.isStalemate() ? 'stalemate' : 'draw');
          }
        }

        const updated = await getGameWithMoves(gameId);
        io.to(`game:${gameId}`).emit('game:updated', { game: updated, lastMove: botMove || move, finished });
        callback?.({ ok: true, game: updated });
      } catch (error) {
        await connection.rollback();
        callback?.({ ok: false, message: error.message || 'Move failed.' });
      } finally {
        connection.release();
      }
    });
  });
}

module.exports = { wireGameSockets };
