import api from './api';

export async function getRoles(params) {
  const res = await api.get('/roles', { params });
  return res.data.roles;
}

export async function createRole(roleData) {
  const res = await api.post('/roles', roleData);
  return res.data.role;
}

export async function updateRole(id, roleData) {
  const res = await api.put(`/roles/${id}`, roleData);
  return res.data.role;
}

export async function changeRoleStatus(id, active) {
  const res = await api.patch(`/roles/${id}/status`, { active });
  return res.data;
}

export async function deleteRole(id) {
  const res = await api.delete(`/roles/${id}`);
  return res.data;
}

