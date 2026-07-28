import api from './api';

export async function requestTransfer(leadId, toAgentId) {
  const res = await api.post(`/leads/${leadId}/transfer-request`, { toAgentId });
  return res.data.request;
}

export async function incomingRequests() {
  const res = await api.get('/transfer-requests/incoming');
  return res.data.requests;
}

export async function outgoingRequests() {
  const res = await api.get('/transfer-requests/outgoing');
  return res.data.requests;
}

export async function approveRequest(id) {
  const res = await api.patch(`/transfer-requests/${id}/approve`);
  return res.data;
}

export async function rejectRequest(id) {
  const res = await api.patch(`/transfer-requests/${id}/reject`);
  return res.data;
}

export async function cancelRequest(id) {
  const res = await api.delete(`/transfer-requests/${id}/cancel`);
  return res.data;
}