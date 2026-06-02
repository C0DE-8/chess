const { query } = require('../config/database');

const STOCKFISH_ENABLED_KEY = 'stockfish_enabled';

let ensured = false;

async function ensureSettingsTable() {
  if (ensured) return;
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(120) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  );
  ensured = true;
}

async function seedStockfishSetting() {
  await ensureSettingsTable();
  const enabled = defaultStockfishEnabled() ? 'true' : 'false';
  await query(
    `INSERT IGNORE INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)`,
    [STOCKFISH_ENABLED_KEY, enabled],
  );
}

function defaultStockfishEnabled() {
  if (String(process.env.STOCKFISH_ENABLED || '').toLowerCase() === 'false') return false;
  if (String(process.env.STOCKFISH_ENABLED || '').toLowerCase() === 'true') return true;
  return Boolean(process.env.STOCKFISH_PATH);
}

async function getStockfishEnabled() {
  await seedStockfishSetting();
  const rows = await query('SELECT setting_value FROM app_settings WHERE setting_key = ?', [STOCKFISH_ENABLED_KEY]);
  return rows[0]?.setting_value === 'true';
}

async function setStockfishEnabled(enabled) {
  await ensureSettingsTable();
  await query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [STOCKFISH_ENABLED_KEY, enabled ? 'true' : 'false'],
  );
  return getStockfishEnabled();
}

async function getAppSettings() {
  const stockfishEnabled = await getStockfishEnabled();
  return {
    stockfish: {
      enabled: stockfishEnabled,
      configured: Boolean(process.env.STOCKFISH_PATH),
    },
  };
}

module.exports = {
  getAppSettings,
  getStockfishEnabled,
  setStockfishEnabled,
};
