import api from './api';

export async function getAgents() {
  const res = await api.get('/agents');
  return res.data.agents;
}

export async function getActiveAgents() {
  const res = await api.get('/agents/active');
  return res.data.agents;
}

export async function createAgent(agentData) {
  const res = await api.post('/agents', agentData);
  return res.data.user;
}

export async function updateAgent(id, agentData) {
  const res = await api.put(`/agents/${id}`, agentData);
  return res.data.agent;
}

export async function changeAgentStatus(id, status) {
  const res = await api.patch(`/agents/${id}/status`, { status });
  return res.data;
}

export async function changeAgentPassword(id, newPassword) {
  const res = await api.patch(`/agents/${id}/password`, { newPassword });
  return res.data;
}

export async function forceLogoutAgent(id) {
  const res = await api.post(`/agents/${id}/force-logout`);
  return res.data;
}