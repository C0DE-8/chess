import styles from './HistoryPage.module.css';

function resultText(game) {
  if (game.result === 'white_win') return `${game.white_name || 'White'} won`;
  if (game.result === 'black_win') return `${game.black_name || 'Black'} won`;
  if (game.result === 'draw') return 'Draw';
  return game.status === 'cancelled' ? 'Cancelled' : 'Completed';
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function HistoryPage({ games }) {
  return (
    <section className={styles.history}>
      <div className={styles.head}>
        <div>
          <h2>Game History</h2>
          <p>Completed and closed games move here automatically.</p>
        </div>
        <strong>{games.length}</strong>
      </div>

      <div className={styles.list}>
        {games.length === 0 && <p className={styles.empty}>No completed games yet.</p>}
        {games.map((game) => (
          <article className={styles.row} key={game.id}>
            <div>
              <h3>#{game.id} {game.white_name || 'White'} vs {game.black_name || 'Black'}</h3>
              <p>{resultText(game)} · {game.result_reason || game.status}</p>
            </div>
            <time>{formatDate(game.completed_at || game.created_at)}</time>
          </article>
        ))}
      </div>
    </section>
  );
}
