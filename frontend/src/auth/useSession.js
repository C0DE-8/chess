import { useEffect, useState } from 'react';
import { currentUser } from '../api/authApi';
import { getToken, setAuthToken } from '../api/client';

export function useSession() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;

    currentUser()
      .then((data) => setUser(data.user))
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  function login(nextUser) {
    setUser(nextUser);
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
  }

  return {
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    logout,
  };
}
