export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

export function getToken() {
  return localStorage.getItem('knightclub_token');
}

export function setAuthToken(value) {
  if (value) localStorage.setItem('knightclub_token', value);
  else localStorage.removeItem('knightclub_token');
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}
