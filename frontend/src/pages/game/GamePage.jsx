import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './GamePage.module.css';

const filters = [
  { value: 'all', label: 'All games' },
  { value: 'mine', label: 'My games' },
  { value: 'bots', label: 'Bot games' },
];

function isBotGame(game) {
  return Boolean(game?.black_player_id == null && String(game?.result_reason || '').startsWith('bot:'));
}

function isOwnGame(game, userId) {
  return [game.white_player_id, game.black_player_id, game.created_by].includes(userId);
}

function botLabel(game) {
  if (!isBotGame(game)) return '';
  const level = String(game.result_reason || '').replace('bot:', '');
  return level ? `Bot: ${level}` : 'Bot game';
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusText(game) {
  if (game.status === 'open') return 'Open';
  if (game.status === 'active') return 'In progress';
  return game.status;
}

export default function GamePage({ user, games }) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredGames = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return games.filter((game) => {
      if (activeFilter === 'mine' && !isOwnGame(game, user.id)) return false;
      if (activeFilter === 'bots' && !isBotGame(game)) return false;
      if (!needle) return true;

      const haystack = [
        game.id,
        game.status,
        game.white_name,
        game.black_name,
        game.result_reason,
        botLabel(game),
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(needle);
    });
  }, [activeFilter, games, search, user.id]);

  const counts = useMemo(() => ({
    all: games.length,
    mine: games.filter((game) => isOwnGame(game, user.id)).length,
    bots: games.filter(isBotGame).length,
  }), [games, user.id]);

  return (
    <section className={styles.games}>
      <div className={styles.head}>
        <div>
          <h2>Games</h2>
          <p>Find an open or active game, then open it on the play page.</p>
        </div>
        <strong>{filteredGames.length}</strong>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span>Search games</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by player, bot, status, or ID"
            type="search"
          />
        </label>

        <div className={styles.filters} aria-label="Game filters">
          {filters.map((filter) => (
            <button
              className={activeFilter === filter.value ? styles.activeFilter : ''}
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
            >
              <span>{filter.label}</span>
              <strong>{counts[filter.value]}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {filteredGames.length === 0 && (
          <p className={styles.empty}>No games match this search.</p>
        )}

        {filteredGames.map((game) => {
          const ownGame = isOwnGame(game, user.id);
          const botGame = isBotGame(game);

          return (
            <button
              className={styles.row}
              key={game.id}
              onClick={() => navigate(`/play/${game.id}`)}
              type="button"
            >
              <div className={styles.matchup}>
                <span className={styles.gameId}>#{game.id}</span>
                <div>
                  <h3>{game.white_name || 'White'} vs {game.black_name || 'Waiting'}</h3>
                  <p>{botGame ? botLabel(game) : ownGame ? 'Your game' : 'Club game'}</p>
                </div>
              </div>

              <div className={styles.meta}>
                <span className={`${styles.status} ${styles[game.status] || ''}`}>{statusText(game)}</span>
                <time>{formatDate(game.created_at)}</time>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
