import api from './api'

export async function getAdminDashboard(params) {
  const res = await api.get('/dashboard/admin', { params })
  return res.data
}

export async function getAgentDashboard(params) {
  const res = await api.get('/dashboard/agent', { params })
  return res.data
}
