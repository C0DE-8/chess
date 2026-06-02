import { apiRequest } from './client';

export function getDashboard() {
  return apiRequest('/api/dashboard');
}
