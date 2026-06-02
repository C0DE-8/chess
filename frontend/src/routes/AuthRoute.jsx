import { Navigate, useNavigate } from 'react-router-dom';
import AuthPage from '../pages/auth/AuthPage';
import styles from '../App.module.css';

export default function AuthRoute({ session }) {
  const navigate = useNavigate();

  if (session.loading) return <main className={styles.loading}>Loading KnightClub...</main>;
  if (session.isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <AuthPage
      onAuthed={(user) => {
        session.login(user);
        navigate('/dashboard', { replace: true });
      }}
    />
  );
}
