const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireActive, requireAdmin } = require('../middleware/auth');
const { STARTING_FEN, completeGame, getGameWithMoves } = require('../lib/game');
const { logActivity } = require('../lib/activity');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'player') {
      where = 'WHERE g.white_player_id = ? OR g.black_player_id = ? OR g.status = "open"';
      params.push(req.user.id, req.user.id);
    }

    const games = await query(
      `SELECT g.id, g.status, g.result, g.result_reason, g.white_player_id, g.black_player_id,
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
    res.json({ games });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireActive, async (req, res, next) => {
  try {
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

router.get('/admin/all', requireAdmin, async (_req, res, next) => {
  try {
    const games = await query(
      `SELECT g.*, white.name AS white_name, black.name AS black_name
       FROM games g
       LEFT JOIN users white ON white.id = g.white_player_id
       LEFT JOIN users black ON black.id = g.black_player_id
       ORDER BY g.created_at DESC`,
    );
    res.json({ games });
  } catch (error) {
    next(error);
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
