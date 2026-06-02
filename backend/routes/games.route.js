const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireActive, requireAdmin } = require('../middleware/auth');
const { STARTING_FEN, completeGame, getGameWithMoves } = require('../lib/game');
const { BOT_LEVELS, botName, isBotGame, normalizeBotLevel } = require('../lib/bot');
const { evaluateFen, stockfishAvailable } = require('../lib/stockfish');
const { logActivity } = require('../lib/activity');

const router = express.Router();

router.use(authenticate);

async function currentOpenGame(userId) {
  const games = await query(
    `SELECT id, status
     FROM games
     WHERE status = 'open'
       AND created_by = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId],
  );
  return games[0] || null;
}

async function requireNoOpenGame(userId) {
  const game = await currentOpenGame(userId);
  if (game) {
    const error = new Error(`You already have open game #${game.id}. Close it or wait for another player before opening a new game.`);
    error.status = 409;
    throw error;
  }
}

async function closeDuplicateOpenGames() {
  await query(
    `UPDATE games g
     JOIN (
       SELECT created_by, MAX(id) AS keep_id
       FROM games
       WHERE status = 'open' AND black_player_id IS NULL
       GROUP BY created_by
       HAVING COUNT(*) > 1
     ) keepers ON keepers.created_by = g.created_by
     SET g.status = 'cancelled',
         g.result = 'abandoned',
         g.result_reason = 'duplicate_open_auto_closed',
         g.completed_at = COALESCE(g.completed_at, NOW())
     WHERE g.status = 'open'
       AND g.black_player_id IS NULL
       AND g.id <> keepers.keep_id`,
  );
}

router.get('/', async (req, res, next) => {
  try {
    await closeDuplicateOpenGames();
    const params = [];
    let where = "WHERE g.status IN ('open', 'active')";
    if (req.user.role === 'player') {
      where += ' AND (g.white_player_id = ? OR g.black_player_id = ? OR g.status = "open")';
      params.push(req.user.id, req.user.id);
    }

    const games = await query(
      `SELECT g.id, g.status, g.result, g.result_reason, g.white_player_id, g.black_player_id, g.created_by,
              g.current_fen, g.created_at, g.completed_at,
              white.name AS white_name, black.name AS black_name
       FROM games g
       LEFT JOIN users white ON white.id = g.white_player_id
       LEFT JOIN users black ON black.id = g.black_player_id
       ${where}
       ORDER BY g.updated_at DESC
       LIMIT 80`,
      params,
    );
    res.json({ games: games.map((game) => ({ ...game, black_name: botName(game) || game.black_name })) });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const params = [];
    let where = "WHERE g.status NOT IN ('open', 'active')";
    if (req.user.role === 'player') {
      where += ' AND (g.white_player_id = ? OR g.black_player_id = ? OR g.created_by = ?)';
      params.push(req.user.id, req.user.id, req.user.id);
    }

    const games = await query(
      `SELECT g.id, g.status, g.result, g.result_reason, g.white_player_id, g.black_player_id, g.created_by,
              g.current_fen, g.created_at, g.completed_at,
              white.name AS white_name, black.name AS black_name
       FROM games g
       LEFT JOIN users white ON white.id = g.white_player_id
       LEFT JOIN users black ON black.id = g.black_player_id
       ${where}
       ORDER BY COALESCE(g.completed_at, g.updated_at, g.created_at) DESC
       LIMIT 120`,
      params,
    );
    res.json({ games: games.map((game) => ({ ...game, black_name: botName(game) || game.black_name })) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireActive, async (req, res, next) => {
  try {
    await closeDuplicateOpenGames();
    await requireNoOpenGame(req.user.id);
    const result = await query(
      'INSERT INTO games (white_player_id, created_by, current_fen) VALUES (?, ?, ?)',
      [req.user.id, req.user.id, STARTING_FEN],
    );
    await logActivity(req.user.id, 'game_created', 'game', result.insertId);
    res.status(201).json({ id: result.insertId, message: 'Game created.' });
  } catch (error) {
    next(error);
  }
});

router.post('/bot', requireActive, async (req, res, next) => {
  try {
    const level = normalizeBotLevel(req.body.level);
    const result = await query(
      `INSERT INTO games (white_player_id, black_player_id, created_by, status, current_fen, result_reason)
       VALUES (?, NULL, ?, 'active', ?, ?)`,
      [req.user.id, req.user.id, STARTING_FEN, `bot:${level}`],
    );
    await logActivity(req.user.id, 'bot_game_created', 'game', result.insertId, { level });
    res.status(201).json({ id: result.insertId, level, levels: BOT_LEVELS, message: 'Bot game created.' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/join', requireActive, async (req, res, next) => {
  try {
    const games = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!games.length) return res.status(404).json({ message: 'Game not found.' });
    const game = games[0];
    if (game.status !== 'open') return res.status(409).json({ message: 'Game is not open.' });
    if (game.white_player_id === req.user.id) return res.status(400).json({ message: 'You already created this game.' });

    await query('UPDATE games SET black_player_id = ?, status = ? WHERE id = ?', [req.user.id, 'active', game.id]);
    await logActivity(req.user.id, 'game_joined', 'game', game.id);
    res.json({ message: 'Game joined.' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/close', requireActive, async (req, res, next) => {
  try {
    const games = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!games.length) return res.status(404).json({ message: 'Game not found.' });
    const game = games[0];
    if (game.created_by !== req.user.id) return res.status(403).json({ message: 'Only the creator can close this game.' });
    if (game.status !== 'open' || game.black_player_id) {
      return res.status(409).json({ message: 'Only open games with no joined player can be closed.' });
    }

    await query(
      "UPDATE games SET status = 'cancelled', result = 'abandoned', result_reason = 'closed_by_creator', completed_at = NOW() WHERE id = ?",
      [game.id],
    );
    await logActivity(req.user.id, 'game_closed', 'game', game.id);
    res.json({ message: 'Game closed.' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resign', requireActive, async (req, res, next) => {
  try {
    const games = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!games.length) return res.status(404).json({ message: 'Game not found.' });
    const game = games[0];
    if (![game.white_player_id, game.black_player_id].includes(req.user.id)) {
      return res.status(403).json({ message: 'You are not a player in this game.' });
    }
    if (game.status !== 'active') return res.status(409).json({ message: 'Only active games can be resigned.' });

    const result = game.white_player_id === req.user.id ? 'black_win' : 'white_win';
    const updated = await completeGame(game.id, result, 'resignation', req.user.id);
    res.json({ game: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/abort', requireActive, async (req, res, next) => {
  try {
    const games = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!games.length) return res.status(404).json({ message: 'Game not found.' });
    const game = games[0];
    if (game.white_player_id !== req.user.id) return res.status(403).json({ message: 'Only the bot game player can abort this game.' });
    if (!isBotGame(game)) return res.status(409).json({ message: 'Only bot games can be aborted.' });
    if (game.status !== 'active') return res.status(409).json({ message: 'Only active bot games can be aborted.' });

    await query(
      "UPDATE games SET status = 'cancelled', result = 'abandoned', result_reason = 'bot_aborted', completed_at = NOW() WHERE id = ?",
      [game.id],
    );
    await logActivity(req.user.id, 'bot_game_aborted', 'game', game.id);
    res.json({ message: 'Bot game aborted.' });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try {
    const games = await query(
      `SELECT g.*, white.name AS white_name, black.name AS black_name
       FROM games g
       LEFT JOIN users white ON white.id = g.white_player_id
       LEFT JOIN users black ON black.id = g.black_player_id
       ORDER BY g.created_at DESC`,
    );
    res.json({ games: games.map((game) => ({ ...game, black_name: botName(game) || game.black_name })) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analyze', async (req, res, next) => {
  try {
    const game = await getGameWithMoves(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found.' });

    const isParticipant = [game.white_player_id, game.black_player_id].includes(req.user.id);
    if (req.user.role === 'player' && !isParticipant) {
      return res.status(403).json({ message: 'You can only analyze your own games.' });
    }

    if (!stockfishAvailable()) {
      return res.status(503).json({ message: 'Stockfish is not configured on this server.' });
    }

    const depth = Math.min(Math.max(Number(req.query.depth) || 8, 1), 14);
    const moves = game.moves.slice(0, 80);
    const analysis = [];

    for (const move of moves) {
      const evaluation = await evaluateFen(move.fen_after, depth);
      analysis.push({
        moveId: move.id,
        moveNumber: move.move_number,
        san: move.san,
        fen: move.fen_after,
        evaluation,
      });
    }

    return res.json({ gameId: game.id, depth, analysis });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const game = await getGameWithMoves(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    const isParticipant = [game.white_player_id, game.black_player_id].includes(req.user.id);
    if (req.user.role === 'player' && !isParticipant) {
      return res.status(403).json({ message: 'You can only view your own games.' });
    }
    res.json({ game });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
