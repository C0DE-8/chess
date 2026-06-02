const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getAppSettings } = require('../lib/settings');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const announcements = await query(
      `SELECT a.id, a.title, a.body, a.created_at, u.name AS author_name
       FROM announcements a
       JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC
       LIMIT 5`,
    );
    const leaderboard = await query(
      `SELECT id, name, rating, wins, losses, draws, games_played
       FROM users
       WHERE role = 'player' AND status = 'active'
       ORDER BY rating DESC, wins DESC
       LIMIT 8`,
    );

    if (req.user.role === 'player') {
      const activeGames = await query(
        `SELECT g.id, g.status, g.result, g.white_player_id, g.black_player_id,
                white.name AS white_name, black.name AS black_name
         FROM games g
         LEFT JOIN users white ON white.id = g.white_player_id
         LEFT JOIN users black ON black.id = g.black_player_id
         WHERE (g.white_player_id = ? OR g.black_player_id = ?) AND g.status IN ('open', 'active')
         ORDER BY g.updated_at DESC`,
        [req.user.id, req.user.id],
      );
      return res.json({ user: req.user, announcements, leaderboard, activeGames });
    }

    const pendingPlayers = await query(
      `SELECT id, name, email, created_at FROM users
       WHERE role = 'player' AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 20`,
    );
    const activeGames = await query(
      `SELECT g.id, g.status, white.name AS white_name, black.name AS black_name, g.updated_at
       FROM games g
       LEFT JOIN users white ON white.id = g.white_player_id
       LEFT JOIN users black ON black.id = g.black_player_id
       WHERE g.status IN ('open', 'active')
       ORDER BY g.updated_at DESC
       LIMIT 20`,
    );
    const tournaments = await query('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 8');
    const activity = await query(
      `SELECT al.*, u.name AS actor_name
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ORDER BY al.created_at DESC
       LIMIT 20`,
    );
    const counts = await query(
      `SELECT
         SUM(role = 'admin') AS admins,
         SUM(role = 'player') AS players,
         SUM(status = 'pending') AS pending,
         (SELECT COUNT(*) FROM games) AS games
       FROM users`,
    );

    const settings = await getAppSettings();
    res.json({ user: req.user, announcements, leaderboard, pendingPlayers, activeGames, tournaments, activity, counts: counts[0], settings });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
