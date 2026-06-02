import styles from './ProfilePage.module.css';

function formatDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default function ProfilePage({ user }) {
  const totalGames = Number(user.games_played || 0);
  const wins = Number(user.wins || 0);
  const winRate = totalGames ? Math.round((wins / totalGames) * 100) : 0;

  return (
    <section className={styles.profile}>
      <div className={styles.header}>
        <div className={styles.avatar}>{user.name?.slice(0, 1)?.toUpperCase() || 'U'}</div>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span>{user.role?.replace('_', ' ')} · {user.status}</span>
        </div>
      </div>

      <div className={styles.stats}>
        <div><span>Rating</span><strong>{user.rating}</strong></div>
        <div><span>Games</span><strong>{totalGames}</strong></div>
        <div><span>Win rate</span><strong>{winRate}%</strong></div>
        <div><span>Joined</span><strong>{formatDate(user.created_at)}</strong></div>
      </div>

      <div className={styles.record}>
        <h3>Record</h3>
        <div><span>Wins</span><strong>{user.wins}</strong></div>
        <div><span>Losses</span><strong>{user.losses}</strong></div>
        <div><span>Draws</span><strong>{user.draws}</strong></div>
      </div>
    </section>
  );
}
