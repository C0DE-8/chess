import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDashboard } from '../../api/dashboardApi';
import { listGameHistory, listGames } from '../../api/gamesApi';
import { getLeaderboard } from '../../api/leaderboardApi';
import { listTournaments } from '../../api/tournamentsApi';
import { listAnnouncements } from '../../api/announcementsApi';
import AdminPage from '../admin/AdminPage';
import AnnouncementsPage from '../announcements/AnnouncementsPage';
import DashboardPage from '../dashboard/DashboardPage';
import GamePage from '../game/GamePage';
import HistoryPage from '../history/HistoryPage';
import LeaderboardPage from '../leaderboard/LeaderboardPage';
import PlayPage from '../play/PlayPage';
import ProfilePage from '../profile/ProfilePage';
import TournamentsPage from '../tournaments/TournamentsPage';
import logo from '../../assets/images/logo.png';
import styles from './AppShell.module.css';

export default function AppShell({ page, routes, session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(session.user);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState({
    dashboard: {},
    games: [],
    history: [],
    leaderboard: [],
    tournaments: [],
    announcements: [],
  });

  const fetchWorkspace = useCallback(async () => {
    const [dashboard, gameData, historyData, leaders, tourneys, posts] = await Promise.all([
      getDashboard(),
      listGames(),
      listGameHistory(),
      getLeaderboard(),
      listTournaments(),
      listAnnouncements(),
    ]);
    return {
      dashboard,
      games: gameData.games,
      history: historyData.games,
      leaderboard: leaders.players,
      tournaments: tourneys.tournaments,
      announcements: posts.announcements,
    };
  }, []);

  function applyWorkspace(data) {
    setUser(data.dashboard.user);
    setWorkspace(data);
  }

  const refresh = useCallback(async () => {
    const data = await fetchWorkspace();
    applyWorkspace(data);
  }, [fetchWorkspace]);

  useEffect(() => {
    fetchWorkspace().then(applyWorkspace).catch(() => {});
  }, [fetchWorkspace]);

  useEffect(() => {
    queueMicrotask(() => setIsMobileNavOpen(false));
  }, [location.pathname]);

  const availableRoutes = routes.filter((route) => !route.publicOnly && (!route.adminOnly || user.role !== 'player'));
  const visibleRoutes = availableRoutes.filter((route) => !route.hidden);
  const activeRoute = availableRoutes.find((route) => (
    route.path === location.pathname
    || (route.path !== '/' && location.pathname.startsWith(`${route.path}/`))
  )) || visibleRoutes[0];

  function logout() {
    session.logout();
    navigate('/auth', { replace: true });
  }

  function goToRoute(path) {
    navigate(path);
    setIsMobileNavOpen(false);
  }

  function renderNavButtons() {
    return visibleRoutes.map((route) => (
      <button
        className={activeRoute.path === route.path ? styles.active : ''}
        onClick={() => goToRoute(route.path)}
        key={route.path}
        type="button"
      >
        {route.label}
      </button>
    ));
  }

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <div className={styles.mobileBrand}>
          <img src={logo} alt="" />
          <div>KnightClub<span>{activeRoute.label}</span></div>
        </div>
        <button
          className={styles.menuButton}
          type="button"
          aria-expanded={isMobileNavOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>
      {isMobileNavOpen && (
        <nav className={styles.mobileNav} id="mobile-navigation" aria-label="Primary navigation">
          <div className={styles.mobileNavGrid}>{renderNavButtons()}</div>
          <button className={styles.logoutButton} onClick={logout} type="button">Log out</button>
        </nav>
      )}
      <aside className={styles.sidebar}>
        <div className={styles.clubTitle}>
          <img src={logo} alt="" />
          <div>KnightClub<span>{user.role.replace('_', ' ')}</span></div>
        </div>
        {renderNavButtons()}
        <button className={styles.logoutButton} onClick={logout} type="button">Log out</button>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p>{user.status === 'pending' ? 'Pending approval' : 'Club workspace'}</p>
            <h1>{activeRoute.label}</h1>
          </div>
          <button className={styles.profileButton} onClick={() => goToRoute('/profile')} type="button">{user.name}</button>
        </header>
        {page === 'dashboard' && <DashboardPage user={user} workspace={workspace} />}
        {page === 'profile' && <ProfilePage user={user} />}
        {page === 'game' && <GamePage user={user} games={workspace.games} />}
        {page === 'play' && <PlayPage user={user} games={workspace.games} refresh={refresh} />}
        {page === 'history' && <HistoryPage games={workspace.history} />}
        {page === 'leaderboard' && <LeaderboardPage leaderboard={workspace.leaderboard} />}
        {page === 'tournaments' && <TournamentsPage tournaments={workspace.tournaments} />}
        {page === 'announcements' && <AnnouncementsPage announcements={workspace.announcements} />}
        {page === 'admin' && <AdminPage user={user} dashboard={workspace.dashboard} refresh={refresh} />}
      </main>
    </div>
  );
}
