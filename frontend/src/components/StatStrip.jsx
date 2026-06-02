import styles from './StatStrip.module.css';

export default function StatStrip({ user }) {
  return (
    <section className={styles.statStrip}>
      <div><span>Rating</span><strong>{user.rating}</strong></div>
      <div><span>Games</span><strong>{user.games_played}</strong></div>
      <div><span>Wins</span><strong>{user.wins}</strong></div>
      <div><span>Losses</span><strong>{user.losses}</strong></div>
      <div><span>Draws</span><strong>{user.draws}</strong></div>
    </section>
  );
}
