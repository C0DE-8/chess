import { apiRequest } from './client';

export function listGames() {
  return apiRequest('/api/games');
}

export function listGameHistory() {
  return apiRequest('/api/games/history');
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

export function createBotGame(level) {
  return apiRequest('/api/games/bot', {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

export function joinGame(id) {
  return apiRequest(`/api/games/${id}/join`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function makeMove(id, move) {
  return apiRequest(`/api/games/${id}/move`, {
    method: 'POST',
    body: JSON.stringify(move),
  });
}

export function closeGame(id) {
  return apiRequest(`/api/games/${id}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function resignGame(id) {
  return apiRequest(`/api/games/${id}/resign`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function abortBotGame(id) {
  return apiRequest(`/api/games/${id}/abort`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function analyzeGame(id, depth = 8) {
  return apiRequest(`/api/games/${id}/analyze?depth=${depth}`);
}
