const { query } = require('../config/database');

async function logActivity(actorId, action, entityType = null, entityId = null, metadata = null) {
  await query(
    'INSERT INTO activity_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)',
    [actorId || null, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null],
  );
}

module.exports = { logActivity };
