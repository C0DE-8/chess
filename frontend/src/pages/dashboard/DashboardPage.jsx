import ListPanel from '../../components/ListPanel';
import StatStrip from '../../components/StatStrip';
import styles from './DashboardPage.module.css';

export default function DashboardPage({ user, workspace }) {
  return (
    <>
      <StatStrip user={user} />
      <section className={styles.grid}>
        <ListPanel title="Announcements" items={workspace.announcements.map((a) => `${a.title}: ${a.body}`)} />
        <ListPanel title="Leaderboard" items={workspace.leaderboard.slice(0, 6).map((p, index) => `${index + 1}. ${p.name} - ${p.rating}`)} />
        <ListPanel title="Active games" items={(workspace.dashboard.activeGames || []).map((g) => `#${g.id} ${g.white_name || 'Open'} vs ${g.black_name || 'Waiting'}`)} />
      </section>
    </>
  );
}
