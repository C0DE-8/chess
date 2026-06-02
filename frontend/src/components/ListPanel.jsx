import styles from './ListPanel.module.css';

export default function ListPanel({ title, items }) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {items.length ? items.map((item, index) => <p key={`${item}-${index}`}>{item}</p>) : <p className={styles.muted}>Nothing here yet.</p>}
    </section>
  );
}
