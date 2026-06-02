import { useState } from 'react';
import { login, register } from '../../api/authApi';
import { setAuthToken } from '../../api/client';
import styles from './AuthPage.module.css';

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    try {
      const data = mode === 'login' ? await login(form) : await register(form);
      setAuthToken(data.token);
      onAuthed(data.user);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.brandPanel}>
        <div className={styles.boardMark} aria-hidden="true">
          {Array.from({ length: 16 }).map((_, index) => <span key={index} />)}
        </div>
        <h1>KnightClub</h1>
        <p>School chess club games, tournaments, approvals, and leaderboards in one focused workspace.</p>
      </section>
      <section className={styles.authPanel}>
        <div className={styles.segmented}>
          <button className={mode === 'login' ? styles.active : ''} onClick={() => setMode('login')} type="button">Log in</button>
          <button className={mode === 'register' ? styles.active : ''} onClick={() => setMode('register')} type="button">Register</button>
        </div>
        <form className={styles.form} onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          <button className={styles.primary} type="submit">{mode === 'login' ? 'Enter club' : 'Request approval'}</button>
          {message && <p className={styles.error}>{message}</p>}
        </form>
      </section>
    </main>
  );
}
