const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireActive } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const tournaments = await query(
      `SELECT t.*, u.name AS created_by_name, COUNT(tp.user_id) AS player_count
       FROM tournaments t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN tournament_players tp ON tp.tournament_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
    );
    res.json({ tournaments });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/join', requireActive, async (req, res, next) => {
  try {
    const tournaments = await query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournaments.length) return res.status(404).json({ message: 'Tournament not found.' });
    if (tournaments[0].status !== 'open') return res.status(409).json({ message: 'Tournament is not open.' });

    await query(
      'INSERT IGNORE INTO tournament_players (tournament_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id],
    );
    await logActivity(req.user.id, 'tournament_joined', 'tournament', Number(req.params.id));
    res.json({ message: 'Tournament joined.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
