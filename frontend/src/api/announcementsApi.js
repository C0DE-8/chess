import { apiRequest } from './client';

export function listAnnouncements() {
  return apiRequest('/api/announcements');
}

export function createAnnouncement(payload) {
  return apiRequest('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
