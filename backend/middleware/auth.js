const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET || 'dev-only-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-me');
    const users = await query(
      `SELECT id, name, email, role, status, rating, games_played, wins, losses, draws, created_at
       FROM users WHERE id = ?`,
      [payload.id],
    );
    if (!users.length) return res.status(401).json({ message: 'User no longer exists.' });
    if (users[0].status === 'suspended') return res.status(403).json({ message: 'Account is suspended.' });
    req.user = users[0];
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireActive(req, res, next) {
  if (req.user.status !== 'active') {
    return res.status(403).json({ message: 'Account is waiting for club approval.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for that action.' });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole('admin', 'super_admin')(req, res, next);
}

module.exports = {
  authenticate,
  requireActive,
  requireAdmin,
  requireRole,
  signToken,
};
