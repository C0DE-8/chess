const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/users.route');
const adminRoutes = require('./routes/admin.route');
const gameRoutes = require('./routes/games.route');
const tournamentRoutes = require('./routes/tournaments.route');
const announcementRoutes = require('./routes/announcements.route');
const leaderboardRoutes = require('./routes/leaderboard.route');
const dashboardRoutes = require('./routes/dashboard.route');
const { wireGameSockets } = require('./socket/games');
const {
  errorLogPath,
  getRecentErrors,
  installProcessErrorHandlers,
  logError,
  readErrorLogFile,
  requestContext,
} = require('./lib/errorLogger');

installProcessErrorHandlers();

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use((req, res, next) => {
  req.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/', (_req, res) => res.json({ ok: true, app: 'KnightClub' }));
app.get('/health', (_req, res) => res.json({ ok: true, app: 'KnightClub' }));
app.get('/debug/errors', (req, res) => {
  const logToken = process.env.ERROR_LOG_TOKEN;
  const providedToken = req.headers['x-error-log-token'] || req.query.token;

  if (!logToken || providedToken !== logToken) {
    return res.status(401).json({ message: 'Missing or invalid error log token.' });
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  return res.json({
    ok: true,
    source: 'server',
    logPath: errorLogPath,
    recent: getRecentErrors(limit),
    file: readErrorLogFile(limit),
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/dashboard', dashboardRoutes);

wireGameSockets(io);

app.use((req, res) => {
  res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
});

app.use((error, req, res, _next) => {
  logError(error, requestContext(req));
  res.status(500).json({
    message: 'KnightClub hit a server error.',
    requestId: req.id,
  });
});

const port = Number(process.env.PORT || 4000);
server.on('error', (error) => {
  logError(error, { source: 'server.listen', port });
});

server.listen(port, () => {
  console.log(`KnightClub API listening on ${port}`);
  console.log(`KnightClub error log: ${errorLogPath}`);
});
