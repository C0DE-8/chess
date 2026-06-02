import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './ToastProvider.module.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((items) => [...items, { id, message, type }].slice(-4));
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = setTimeout(() => {
      setToasts((items) => items.slice(1));
    }, 3600);
    return () => clearTimeout(timer);
  }, [toasts]);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div className={`${styles.toast} ${styles[toast.type] || ''}`} role="status" key={toast.id}>
            <span>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} type="button">Close</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider.');
  return value;
}
