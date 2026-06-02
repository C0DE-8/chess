const fs = require('fs');
const path = require('path');

const defaultLogPath = path.join(__dirname, '..', 'logs', 'error.log');
const errorLogPath = resolveLogPath(process.env.ERROR_LOG_PATH);

function logError(error, context = {}) {
  const entry = {
    at: new Date().toISOString(),
    level: 'error',
    message: error?.message || String(error),
    name: error?.name,
    code: error?.code,
    stack: error?.stack,
    context: redact(context),
  };

  const line = `${JSON.stringify(entry)}\n`;

  try {
    fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
    fs.appendFileSync(errorLogPath, line);
  } catch (writeError) {
    console.error('[error-logger:write-failed]', writeError.message);
  }

  console.error('[server-error]', entry);
}

function requestContext(req) {
  return {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    origin: req.headers?.origin,
    userAgent: req.headers?.['user-agent'],
    userId: req.user?.id,
    userRole: req.user?.role,
    params: req.params,
    query: req.query,
    body: req.body,
  };
}

function installProcessErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    logError(reason instanceof Error ? reason : new Error(String(reason)), {
      source: 'process.unhandledRejection',
    });
  });

  process.on('uncaughtException', (error) => {
    logError(error, { source: 'process.uncaughtException' });
    process.exitCode = 1;
  });
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (isSensitiveKey(key)) return [key, '[redacted]'];
      return [key, redact(entryValue)];
    }),
  );
}

function isSensitiveKey(key) {
  return /password|token|secret|api[_-]?key|authorization|cookie/i.test(key);
}

function resolveLogPath(configuredPath) {
  if (!configuredPath) return defaultLogPath;
  if (path.isAbsolute(configuredPath)) return configuredPath;
  return path.join(__dirname, '..', configuredPath);
}

module.exports = {
  errorLogPath,
  installProcessErrorHandlers,
  logError,
  requestContext,
};
