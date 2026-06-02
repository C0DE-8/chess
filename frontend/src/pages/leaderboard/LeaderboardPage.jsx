import DataTable from '../../components/DataTable';
import styles from './LeaderboardPage.module.css';

export default function LeaderboardPage({ leaderboard }) {
  return (
    <section className={styles.page}>
      <DataTable rows={leaderboard} columns={['name', 'rating', 'wins', 'losses', 'draws', 'games_played']} />
    </section>
  );
}
