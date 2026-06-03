export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

function isVercelSocketHost() {
  try {
    return new URL(SOCKET_URL).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function socketEnabled() {
  const configured = import.meta.env.VITE_SOCKET_ENABLED;
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return !isVercelSocketHost();
}

function socketTransports() {
  const configured = import.meta.env.VITE_SOCKET_TRANSPORTS;
  if (configured) {
    return configured
      .split(',')
      .map((transport) => transport.trim())
      .filter(Boolean);
  }

  try {
    const host = new URL(SOCKET_URL).hostname;
    if (host.endsWith('.vercel.app')) return ['polling'];
  } catch {
    return ['websocket', 'polling'];
  }

  return ['websocket', 'polling'];
}

export const SOCKET_ENABLED = socketEnabled();
export const SOCKET_TRANSPORTS = socketTransports();

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
