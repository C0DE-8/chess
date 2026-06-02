import { Navigate, Outlet } from 'react-router-dom';
import styles from '../App.module.css';

export default function AdminRoute({ session }) {
  if (session.loading) return <main className={styles.loading}>Loading KnightClub...</main>;
  if (!session.isAuthenticated) return <Navigate to="/auth" replace />;
  if (session.user?.role === 'player') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
