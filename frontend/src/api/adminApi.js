import { apiRequest } from './client';

export function updateUserStatus(id, status) {
  return apiRequest(`/api/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function createAdmin(payload) {
  return apiRequest('/api/admin/admins', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUserRole(id, role) {
  return apiRequest(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}
