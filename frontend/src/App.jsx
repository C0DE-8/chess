import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './auth/useSession';
import AdminRoute from './routes/AdminRoute';
import AuthRoute from './routes/AuthRoute';
import UserRoute from './routes/UserRoute';
import AppShell from './pages/app/AppShell';
import NotFoundPage from './pages/not-found/NotFoundPage';

const routes = [
  { path: '/auth', label: 'Auth', publicOnly: true },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/profile', label: 'Profile' },
  { path: '/game', label: 'Games' },
  { path: '/play', label: 'Play' },
  { path: '/history', label: 'History' },
  { path: '/leaderboard', label: 'Leaderboard' },
  { path: '/tournaments', label: 'Tournaments' },
  { path: '/announcements', label: 'Announcements' },
  { path: '/admin', label: 'Admin', adminOnly: true },
];

function App() {
  const session = useSession();

  return (
    <Router>
      <Routes>
        {/* ================= AUTH ROUTES ================= */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/auth" element={<AuthRoute session={session} />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/register" element={<Navigate to="/auth" replace />} />

        {/* ================= PLAYER ROUTES (Protected) ================= */}
        <Route element={<UserRoute session={session} />}>
          <Route path="/dashboard" element={<AppShell page="dashboard" routes={routes} session={session} />} />
          <Route path="/profile" element={<AppShell page="profile" routes={routes} session={session} />} />
          <Route path="/game" element={<AppShell page="game" routes={routes} session={session} />} />
          <Route path="/play" element={<AppShell page="play" routes={routes} session={session} />} />
          <Route path="/play/:gameId" element={<AppShell page="play" routes={routes} session={session} />} />
          <Route path="/history" element={<AppShell page="history" routes={routes} session={session} />} />
          <Route path="/leaderboard" element={<AppShell page="leaderboard" routes={routes} session={session} />} />
          <Route path="/tournaments" element={<AppShell page="tournaments" routes={routes} session={session} />} />
          <Route path="/announcements" element={<AppShell page="announcements" routes={routes} session={session} />} />
        </Route>

        {/* ================= ADMIN ROUTES (Protected) ================= */}
        <Route element={<AdminRoute session={session} />}>
          <Route path="/admin" element={<AppShell page="admin" routes={routes} session={session} />} />
        </Route>

        {/* ================= 404 FALLBACK ================= */}
        <Route path="*" element={<NotFoundPage session={session} />} />
      </Routes>
    </Router>
  );
}

export default App;
