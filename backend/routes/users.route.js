const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/me/profile', async (req, res, next) => {
  try {
    const users = await query(
      `SELECT id, name, email, role, status, rating, games_played, wins, losses, draws, created_at
       FROM users WHERE id = ?`,
      [req.user.id],
    );
    res.json({ user: users[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
