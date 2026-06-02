const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate, requireAdmin, requireRole } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');
const { getAppSettings, setStockfishEnabled } = require('../lib/settings');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/settings', async (_req, res, next) => {
  try {
    const settings = await getAppSettings();
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

router.patch('/settings/stockfish', async (req, res, next) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const stockfishEnabled = await setStockfishEnabled(enabled);
    await logActivity(req.user.id, 'stockfish_setting_updated', 'setting', null, { enabled: stockfishEnabled });
    const settings = await getAppSettings();
    res.json({ settings, message: `Stockfish ${stockfishEnabled ? 'enabled' : 'disabled'}.` });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { status, role } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }
    if (req.user.role !== 'super_admin') {
      conditions.push("role = 'player'");
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const users = await query(
      `SELECT id, name, email, role, status, rating, games_played, wins, losses, draws, created_at
       FROM users ${where}
       ORDER BY created_at DESC`,
      params,
    );
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const { status } = req.body;
    if (!['pending', 'active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid account status.' });
    }

    const users = await query('SELECT id, role FROM users WHERE id = ?', [targetId]);
    if (!users.length) return res.status(404).json({ message: 'User not found.' });
    if (req.user.role !== 'super_admin' && users[0].role !== 'player') {
      return res.status(403).json({ message: 'Only super admins can manage admin users.' });
    }

    await query('UPDATE users SET status = ? WHERE id = ?', [status, targetId]);
    await logActivity(req.user.id, `user_${status}`, 'user', targetId);
    res.json({ message: 'User status updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/admins', requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ message: 'Name, email, and a 6 character password are required.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash, 'admin', 'active'],
    );
    await logActivity(req.user.id, 'admin_created', 'user', result.insertId);
    res.status(201).json({ id: result.insertId, message: 'Admin created.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email is already registered.' });
    next(error);
  }
});

router.patch('/users/:id/role', requireRole('super_admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['super_admin', 'admin', 'player'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }
    await query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    await logActivity(req.user.id, 'user_role_updated', 'user', Number(req.params.id), { role });
    res.json({ message: 'Role updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/tournaments', async (req, res, next) => {
  try {
    const { name, description, status = 'draft', starts_at } = req.body;
    if (!name) return res.status(400).json({ message: 'Tournament name is required.' });
    if (!['draft', 'open', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid tournament status.' });
    }

    const result = await query(
      'INSERT INTO tournaments (name, description, status, starts_at, created_by) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), description || null, status, starts_at || null, req.user.id],
    );
    await logActivity(req.user.id, 'tournament_created', 'tournament', result.insertId);
    res.status(201).json({ id: result.insertId, message: 'Tournament created.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/tournaments/:id', async (req, res, next) => {
  try {
    const { name, description, status, starts_at } = req.body;
    if (status && !['draft', 'open', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid tournament status.' });
    }

    await query(
      `UPDATE tournaments
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           status = COALESCE(?, status),
           starts_at = COALESCE(?, starts_at)
       WHERE id = ?`,
      [name || null, description || null, status || null, starts_at || null, req.params.id],
    );
    await logActivity(req.user.id, 'tournament_updated', 'tournament', Number(req.params.id));
    res.json({ message: 'Tournament updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });

    const result = await query(
      'INSERT INTO announcements (title, body, created_by) VALUES (?, ?, ?)',
      [title.trim(), body.trim(), req.user.id],
    );
    await logActivity(req.user.id, 'announcement_created', 'announcement', result.insertId);
    res.status(201).json({ id: result.insertId, message: 'Announcement posted.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
