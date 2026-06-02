import ListPanel from '../../components/ListPanel';
import styles from './AnnouncementsPage.module.css';

export default function AnnouncementsPage({ announcements }) {
  return (
    <section className={styles.page}>
      <ListPanel title="Announcements" items={announcements.map((a) => `${a.title}: ${a.body}`)} />
    </section>
  );
}
