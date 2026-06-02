const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const announcements = await query(
      `SELECT a.*, u.name AS author_name
       FROM announcements a
       JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC
       LIMIT 30`,
    );
    res.json({ announcements });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
