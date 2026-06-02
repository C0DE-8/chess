import { Navigate, Outlet } from 'react-router-dom';
import styles from '../App.module.css';

export default function UserRoute({ session }) {
  if (session.loading) return <main className={styles.loading}>Loading KnightClub...</main>;
  if (!session.isAuthenticated) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
