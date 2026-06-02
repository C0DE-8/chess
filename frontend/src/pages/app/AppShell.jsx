import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDashboard } from '../../api/dashboardApi';
import { listGames } from '../../api/gamesApi';
import { getLeaderboard } from '../../api/leaderboardApi';
import { listTournaments } from '../../api/tournamentsApi';
import { listAnnouncements } from '../../api/announcementsApi';
import AdminPage from '../admin/AdminPage';
import AnnouncementsPage from '../announcements/AnnouncementsPage';
import DashboardPage from '../dashboard/DashboardPage';
import GamePage from '../game/GamePage';
import LeaderboardPage from '../leaderboard/LeaderboardPage';
import TournamentsPage from '../tournaments/TournamentsPage';
import logo from '../../assets/images/logo.png';
import styles from './AppShell.module.css';

export default function AppShell({ page, routes, session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(session.user);
  const [workspace, setWorkspace] = useState({
    dashboard: {},
    games: [],
    leaderboard: [],
    tournaments: [],
    announcements: [],
  });

  async function fetchWorkspace() {
    const [dashboard, gameData, leaders, tourneys, posts] = await Promise.all([
      getDashboard(),
      listGames(),
      getLeaderboard(),
      listTournaments(),
      listAnnouncements(),
    ]);
    return {
      dashboard,
      games: gameData.games,
      leaderboard: leaders.players,
      tournaments: tourneys.tournaments,
      announcements: posts.announcements,
    };
  }

  function applyWorkspace(data) {
    setUser(data.dashboard.user);
    setWorkspace(data);
  }

  async function refresh() {
    const data = await fetchWorkspace();
    applyWorkspace(data);
  }

  useEffect(() => {
    fetchWorkspace().then(applyWorkspace).catch(() => {});
  }, []);

  const availableRoutes = routes.filter((route) => !route.publicOnly && (!route.adminOnly || user.role !== 'player'));
  const activeRoute = availableRoutes.find((route) => route.path === location.pathname) || availableRoutes[0];

  function logout() {
    session.logout();
    navigate('/auth', { replace: true });
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.clubTitle}>
          <img src={logo} alt="" />
          <div>KnightClub<span>{user.role.replace('_', ' ')}</span></div>
        </div>
        {availableRoutes.map((route) => (
          <button className={activeRoute.path === route.path ? styles.active : ''} onClick={() => navigate(route.path)} key={route.path} type="button">
            {route.label}
          </button>
        ))}
        <button onClick={logout} type="button">Log out</button>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p>{user.status === 'pending' ? 'Pending approval' : 'Club workspace'}</p>
            <h1>{activeRoute.label}</h1>
          </div>
          <strong>{user.name}</strong>
        </header>
        {page === 'dashboard' && <DashboardPage user={user} workspace={workspace} />}
        {page === 'game' && <GamePage user={user} games={workspace.games} refresh={refresh} />}
        {page === 'leaderboard' && <LeaderboardPage leaderboard={workspace.leaderboard} />}
        {page === 'tournaments' && <TournamentsPage tournaments={workspace.tournaments} />}
        {page === 'announcements' && <AnnouncementsPage announcements={workspace.announcements} />}
        {page === 'admin' && <AdminPage user={user} dashboard={workspace.dashboard} refresh={refresh} />}
      </main>
    </div>
  );
}
