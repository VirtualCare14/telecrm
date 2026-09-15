import api from './api';

export async function getNotifications() {
  const res = await api.get('/notifications');
  return res.data;
}

export async function markNotificationRead(id) {
  const res = await api.post(`/notifications/${id}/read`);
  return res.data;
}

export async function markAllNotificationsRead(alertIds = []) {
  const res = await api.post('/notifications/read-all', { alertIds });
  return res.data;
}
