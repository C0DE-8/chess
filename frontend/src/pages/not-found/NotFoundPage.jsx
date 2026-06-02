import { useNavigate } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage({ session }) {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(session?.user);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <img src={logo} alt="" />
        <p>404</p>
        <h1>Page not found</h1>
        <span>This page does not exist in KnightClub.</span>
        <div className={styles.actions}>
          <button onClick={() => navigate(isLoggedIn ? '/dashboard' : '/auth')} type="button">
            {isLoggedIn ? 'Dashboard' : 'Sign in'}
          </button>
          <button className={styles.secondary} onClick={() => navigate('/game')} type="button">Games</button>
        </div>
      </section>
    </main>
  );
}
