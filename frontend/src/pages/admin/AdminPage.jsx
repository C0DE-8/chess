import { useEffect, useState } from 'react';
import { createAdmin, getAdminSettings, updateStockfishSetting, updateUserStatus } from '../../api/adminApi';
import { createAnnouncement } from '../../api/announcementsApi';
import { createTournament } from '../../api/tournamentsApi';
import { useToast } from '../../components/ToastProvider';
import styles from './AdminPage.module.css';

export default function AdminPage({ user, dashboard, refresh }) {
  const [announcement, setAnnouncement] = useState({ title: '', body: '' });
  const [tournament, setTournament] = useState({ name: '', description: '', status: 'open' });
  const [admin, setAdmin] = useState({ name: '', email: '', password: '' });
  const [settings, setSettings] = useState(dashboard.settings || null);
  const [isSavingStockfish, setIsSavingStockfish] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    setSettings(dashboard.settings || null);
  }, [dashboard.settings]);

  useEffect(() => {
    getAdminSettings().then((data) => setSettings(data.settings)).catch(() => {});
  }, []);

  async function approve(id) {
    await updateUserStatus(id, 'active');
    refresh();
  }

  async function suspend(id) {
    await updateUserStatus(id, 'suspended');
    refresh();
  }

  async function postAnnouncement(event) {
    event.preventDefault();
    await createAnnouncement(announcement);
    setAnnouncement({ title: '', body: '' });
    refresh();
  }

  async function postTournament(event) {
    event.preventDefault();
    await createTournament(tournament);
    setTournament({ name: '', description: '', status: 'open' });
    refresh();
  }

  async function postAdmin(event) {
    event.preventDefault();
    await createAdmin(admin);
    setAdmin({ name: '', email: '', password: '' });
    refresh();
  }

  async function toggleStockfish() {
    const nextEnabled = !settings?.stockfish?.enabled;
    setIsSavingStockfish(true);
    try {
      const data = await updateStockfishSetting(nextEnabled);
      setSettings(data.settings);
      notify(data.message, 'success');
      refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setIsSavingStockfish(false);
    }
  }

  return (
    <section className={styles.workspace}>
      <h2>Club control</h2>
      <div className={styles.adminGrid}>
        <div className={styles.settingPanel}>
          <div>
            <h3>Bot engine</h3>
            <p>
              {settings?.stockfish?.enabled ? 'Stockfish is on. Bot moves use Stockfish when available.' : 'Stockfish is off. Bot moves use the chess.js fallback.'}
            </p>
            {!settings?.stockfish?.configured && <small>Stockfish path is not configured on the server.</small>}
          </div>
          <button
            className={settings?.stockfish?.enabled ? styles.toggleOn : styles.toggleOff}
            onClick={toggleStockfish}
            disabled={isSavingStockfish}
            type="button"
          >
            <span />
            {settings?.stockfish?.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div>
          <h3>Pending players</h3>
          {(dashboard.pendingPlayers || []).map((player) => (
            <div className={styles.adminRow} key={player.id}>
              <span>{player.name}<small>{player.email}</small></span>
              <button onClick={() => approve(player.id)} type="button">Approve</button>
            </div>
          ))}
        </div>
        <div>
          <h3>Active games</h3>
          {(dashboard.activeGames || []).map((game) => (
            <div className={styles.adminRow} key={game.id}>
              <span>#{game.id}<small>{game.white_name || 'Open'} vs {game.black_name || 'Waiting'}</small></span>
              <button onClick={() => suspend(game.white_player_id)} disabled={!game.white_player_id} type="button">Suspend white</button>
            </div>
          ))}
        </div>
        <form onSubmit={postAnnouncement}>
          <h3>Post announcement</h3>
          <input placeholder="Title" value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} />
          <input placeholder="Message" value={announcement.body} onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })} />
          <button type="submit">Post</button>
        </form>
        <form onSubmit={postTournament}>
          <h3>Create tournament</h3>
          <input placeholder="Name" value={tournament.name} onChange={(event) => setTournament({ ...tournament, name: event.target.value })} />
          <input placeholder="Description" value={tournament.description} onChange={(event) => setTournament({ ...tournament, description: event.target.value })} />
          <select value={tournament.status} onChange={(event) => setTournament({ ...tournament, status: event.target.value })}>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="active">Active</option>
          </select>
          <button type="submit">Create</button>
        </form>
        {user.role === 'super_admin' && (
          <form onSubmit={postAdmin}>
            <h3>Create admin</h3>
            <input placeholder="Name" value={admin.name} onChange={(event) => setAdmin({ ...admin, name: event.target.value })} />
            <input placeholder="Email" value={admin.email} onChange={(event) => setAdmin({ ...admin, email: event.target.value })} />
            <input placeholder="Password" type="password" value={admin.password} onChange={(event) => setAdmin({ ...admin, password: event.target.value })} />
            <button type="submit">Create admin</button>
          </form>
        )}
      </div>
    </section>
  );
}
