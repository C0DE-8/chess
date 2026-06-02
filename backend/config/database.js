const { connectProject } = require('diamond-sql');
require('dotenv').config();

const db = connectProject(process.env.SITE_ID, {
  apiKey: process.env.API_KEY,
  dbmsUrl: process.env.DBMS_URL,
});

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

module.exports = {
  pool: db,
  query,
};
