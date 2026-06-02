const mysql = require('mysql2');

const pools = new Map();

function connectProject(siteId, options = {}) {
  const resolvedSiteId = siteId || options.siteId || process.env.SITE_ID;
  const apiKey = options.apiKey || process.env.API_KEY;
  const dbmsUrl = normalizeUrl(options.dbmsUrl || process.env.DBMS_URL || 'http://localhost:4000');
  const timeoutMs = Number(options.timeoutMs || process.env.DBMS_TIMEOUT_MS || 15000);

  if (!resolvedSiteId) throw new Error('siteId or SITE_ID is required');
  if (!apiKey) throw new Error('API key is required');
  if (!dbmsUrl) throw new Error('DBMS_URL is required');

  if (!globalThis.fetch) {
    throw new Error('global fetch is required. Use Node.js 18+ or provide a fetch polyfill.');
  }

  const poolKey = `${dbmsUrl}:${resolvedSiteId}`;

  async function requestConnectionConfig() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${dbmsUrl}/gateway/connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-id': resolvedSiteId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ siteId: resolvedSiteId }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.message || payload.error || `DBMS connection request failed with ${response.status}`,
        );
      }

      if (!payload.connection) {
        throw new Error('DBMS did not return connection config');
      }

      return payload.connection;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`DBMS request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createPool() {
    const config = await requestConnectionConfig();

    const pool = mysql.createPool({
      host: config.host,
      port: Number(config.port || 3306),
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: Number(config.connectionLimit || 10),
      queueLimit: Number(config.queueLimit || 0),
      charset: config.charset || 'utf8mb4',
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    const promisePool = pool.promise();

    pools.set(poolKey, {
      rawPool: pool,
      promisePool,
      config,
      createdAt: new Date(),
    });

    return promisePool;
  }

  async function getPool() {
    const cached = pools.get(poolKey);

    if (cached?.promisePool) {
      return cached.promisePool;
    }

    return createPool();
  }

  async function reconnect() {
    const cached = pools.get(poolKey);

    if (cached?.promisePool) {
      try {
        await cached.promisePool.end();
      } catch (_) {
        // Ignore close errors while refreshing the DBMS connection.
      }
    }

    pools.delete(poolKey);

    return createPool();
  }

  async function runWithReconnect(method, sql, params = []) {
    try {
      const pool = await getPool();
      return pool[method](sql, params);
    } catch (error) {
      if (isReconnectError(error)) {
        const pool = await reconnect();
        return pool[method](sql, params);
      }

      throw error;
    }
  }

  return {
    siteId: resolvedSiteId,
    dbmsUrl,

    async query(sql, params = []) {
      return runWithReconnect('query', sql, params);
    },

    async execute(sql, params = []) {
      return runWithReconnect('execute', sql, params);
    },

    async getConnection() {
      const pool = await getPool();
      return pool.getConnection();
    },

    async status() {
      const pool = await getPool();
      const [rows] = await pool.query('SELECT 1 AS ok');
      const cached = pools.get(poolKey);

      return {
        connected: rows?.[0]?.ok === 1,
        siteId: resolvedSiteId,
        dbmsUrl,
        database: cached?.config?.database || null,
        host: cached?.config?.host || null,
        createdAt: cached?.createdAt || null,
      };
    },

    async reconnect() {
      await reconnect();

      return {
        success: true,
        message: `Reconnected project ${resolvedSiteId}`,
      };
    },

    async end() {
      const cached = pools.get(poolKey);

      if (cached?.promisePool) {
        await cached.promisePool.end();
      }

      pools.delete(poolKey);
    },
  };
}

function normalizeUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function isReconnectError(error) {
  return ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(error.code);
}

module.exports = {
  connectProject,
};
