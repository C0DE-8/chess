const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate, signToken } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

function publicUser(user) {
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ message: 'Name, email, and an 8 character password are required.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length) return res.status(409).json({ message: 'Email is already registered.' });

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash, 'player', 'pending'],
    );

    const users = await query(
      `SELECT id, name, email, role, status, rating, games_played, wins, losses, draws, created_at
       FROM users WHERE id = ?`,
      [result.insertId],
    );
    await logActivity(result.insertId, 'player_registered', 'user', result.insertId);
    res.status(201).json({ user: users[0], token: signToken(users[0]) });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const users = await query('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
    if (!users.length) return res.status(401).json({ message: 'Invalid email or password.' });

    const user = users[0];
    const isValid = await bcrypt.compare(password || '', user.password_hash);
    if (!isValid) return res.status(401).json({ message: 'Invalid email or password.' });
    if (user.status === 'suspended') return res.status(403).json({ message: 'Account is suspended.' });

    await logActivity(user.id, 'user_logged_in', 'user', user.id);
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
