import ListPanel from '../../components/ListPanel';
import styles from './TournamentsPage.module.css';

export default function TournamentsPage({ tournaments }) {
  return (
    <section className={styles.page}>
      <ListPanel title="Tournaments" items={tournaments.map((t) => `${t.name} - ${t.status} - ${t.player_count} players`)} />
    </section>
  );
}
