import { apiRequest } from './client';

export function getLeaderboard() {
  return apiRequest('/api/leaderboard');
}
