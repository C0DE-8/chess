import { apiRequest } from './client';

export function listTournaments() {
  return apiRequest('/api/tournaments');
}

export function createTournament(payload) {
  return apiRequest('/api/admin/tournaments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
