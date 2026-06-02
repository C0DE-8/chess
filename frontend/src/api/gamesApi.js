import { apiRequest } from './client';

export function listGames() {
  return apiRequest('/api/games');
}

export function getGame(id) {
  return apiRequest(`/api/games/${id}`);
}

export function createGame() {
  return apiRequest('/api/games', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function joinGame(id) {
  return apiRequest(`/api/games/${id}/join`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
