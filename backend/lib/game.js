const { Chess } = require('chess.js');
const { pool, query } = require('../config/database');
const { logActivity } = require('./activity');
const { botName, isBotGame } = require('./bot');

const STARTING_FEN = new Chess().fen();
const RATING_STEP = 16;
const MIN_RATING = 100;

async function updateStatsForResult(connection, game) {
  if (isBotGame(game)) {
    await updateStatsForBotResult(connection, game);
    return;
  }

  if (game.result === 'draw') {
    await connection.execute(
      'UPDATE users SET games_played = games_played + 1, draws = draws + 1 WHERE id IN (?, ?)',
      [game.white_player_id, game.black_player_id],
    );
    return;
  }

  if (!game.winner_id || !game.loser_id) return;

  await connection.execute(
    'UPDATE users SET games_played = games_played + 1, wins = wins + 1, rating = rating + ? WHERE id = ?',
    [RATING_STEP, game.winner_id],
  );
  await connection.execute(
    'UPDATE users SET games_played = games_played + 1, losses = losses + 1, rating = GREATEST(?, rating - ?) WHERE id = ?',
    [MIN_RATING, RATING_STEP, game.loser_id],
  );
}

async function updateStatsForBotResult(connection, game) {
  if (!game.white_player_id) return;

  if (game.result === 'draw') {
    await connection.execute(
      'UPDATE users SET games_played = games_played + 1, draws = draws + 1 WHERE id = ?',
      [game.white_player_id],
    );
    return;
  }

  if (game.result === 'white_win') {
    await connection.execute(
      'UPDATE users SET games_played = games_played + 1, wins = wins + 1, rating = rating + ? WHERE id = ?',
      [RATING_STEP, game.white_player_id],
    );
    return;
  }

  if (game.result === 'black_win') {
    await connection.execute(
      'UPDATE users SET games_played = games_played + 1, losses = losses + 1, rating = GREATEST(?, rating - ?) WHERE id = ?',
      [MIN_RATING, RATING_STEP, game.white_player_id],
    );
  }
}

async function completeGame(gameId, result, reason, actorId = null) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[game]] = await connection.execute('SELECT * FROM games WHERE id = ? FOR UPDATE', [gameId]);
    if (!game || game.status === 'completed') {
      await connection.rollback();
      return game;
    }

    let winnerId = null;
    let loserId = null;
    if (result === 'white_win') {
      winnerId = game.white_player_id;
      loserId = game.black_player_id;
    }
    if (result === 'black_win') {
      winnerId = game.black_player_id;
      loserId = game.white_player_id;
    }

    await connection.execute(
      `UPDATE games
       SET status = 'completed', result = ?, result_reason = ?, winner_id = ?, loser_id = ?, completed_at = NOW()
       WHERE id = ?`,
      [result, reason, winnerId, loserId, gameId],
    );

    await updateStatsForResult(connection, { ...game, result, winner_id: winnerId, loser_id: loserId });
    await connection.commit();
    await logActivity(actorId, 'game_completed', 'game', gameId, { result, reason });
    return { ...game, status: 'completed', result, result_reason: reason, winner_id: winnerId, loser_id: loserId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function applyPlayerMove(gameId, user, moveInput) {
  const connection = await pool.getConnection();
  let game = null;
  let move = null;
  let chess = null;

  try {
    await connection.beginTransaction();
    const [[lockedGame]] = await connection.execute('SELECT * FROM games WHERE id = ? FOR UPDATE', [gameId]);
    if (!lockedGame) throw new Error('Game not found.');
    if (lockedGame.status !== 'active') throw new Error('Game is not active.');

    game = lockedGame;
    chess = new Chess(game.current_fen);
    const expectedPlayerId = chess.turn() === 'w' ? game.white_player_id : game.black_player_id;
    if (user.id !== expectedPlayerId) throw new Error('It is not your turn.');

    move = chess.move({
      from: moveInput.from,
      to: moveInput.to,
      promotion: moveInput.promotion || undefined,
    });
    if (!move) throw new Error('Illegal move.');

    const fen = chess.fen();
    const pgn = chess.pgn();
    const [[countRow]] = await connection.execute('SELECT COUNT(*) AS move_count FROM game_moves WHERE game_id = ?', [gameId]);
    const moveNumber = Number(countRow.move_count) + 1;

    await connection.execute(
      `INSERT INTO game_moves
       (game_id, player_id, move_number, from_square, to_square, promotion, san, fen_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [gameId, user.id, moveNumber, move.from, move.to, move.promotion || null, move.san, fen],
    );
    await connection.execute('UPDATE games SET current_fen = ?, pgn = ? WHERE id = ?', [fen, pgn, gameId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  let finished = null;
  if (chess.isCheckmate()) {
    finished = await completeGame(gameId, chess.turn() === 'w' ? 'black_win' : 'white_win', 'checkmate', user.id);
  } else if (chess.isDraw() || chess.isStalemate()) {
    finished = await completeGame(gameId, 'draw', chess.isStalemate() ? 'stalemate' : 'draw', user.id);
  }

  const updated = await getGameWithMoves(gameId);
  return {
    game: updated,
    lastMove: move,
    movedBy: user.id,
    movedByName: user.name,
    san: move.san,
    finished,
    pendingBotMove: !finished && isBotGame(game),
  };
}

async function getGameWithMoves(gameId) {
  const games = await query(
    `SELECT g.*, white.name AS white_name, black.name AS black_name
     FROM games g
     LEFT JOIN users white ON white.id = g.white_player_id
     LEFT JOIN users black ON black.id = g.black_player_id
     WHERE g.id = ?`,
    [gameId],
  );
  if (!games.length) return null;

  const moves = await query(
    `SELECT gm.*, u.name AS player_name
     FROM game_moves gm
     JOIN users u ON u.id = gm.player_id
     WHERE gm.game_id = ?
     ORDER BY gm.move_number ASC, gm.id ASC`,
    [gameId],
  );

  const game = games[0];
  return { ...game, black_name: botName(game) || game.black_name, moves };
}

module.exports = {
  STARTING_FEN,
  applyPlayerMove,
  completeGame,
  getGameWithMoves,
};
