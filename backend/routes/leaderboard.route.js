const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (_req, res, next) => {
  try {
    const players = await query(
      `SELECT id, name, rating, wins, losses, draws, games_played
       FROM users
       WHERE role = 'player' AND status = 'active'
       ORDER BY rating DESC, wins DESC, games_played ASC, name ASC
       LIMIT 50`,
    );
    res.json({ players });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
