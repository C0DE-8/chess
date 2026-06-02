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

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/', (_req, res) => res.json({ ok: true, app: 'KnightClub' }));
app.get('/health', (_req, res) => res.json({ ok: true, app: 'KnightClub' }));
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'KnightClub hit a server error.' });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`KnightClub API listening on ${port}`);
});
