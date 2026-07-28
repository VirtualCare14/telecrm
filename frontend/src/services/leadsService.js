import api from './api';

export async function createLead(data) {
  const res = await api.post('/leads', data);
  return res.data.lead;
}

export async function checkDuplicates(data) {
  const res = await api.post('/leads/check-duplicates', data);
  return res.data.matches;
}

export async function listLeads(params) {
  const res = await api.get('/leads', { params });
  return res.data;
}

export async function getLead(id) {
  const res = await api.get(`/leads/${id}`);
  return res.data.lead;
}

export async function updateLead(leadId, data) {
  const res = await api.put(`/leads/${leadId}`, data);
  return res.data.lead;
}

// Contact management
export async function getLeadContacts(leadId) {
  const res = await api.get(`/leads/${leadId}/contacts`);
  return res.data.contacts;
}

export async function addContact(leadId, data) {
  const res = await api.post(`/leads/${leadId}/contacts`, data);
  return res.data.contact;
}

export async function updateContact(leadId, contactId, data) {
  const res = await api.put(`/leads/${leadId}/contacts/${contactId}`, data);
  return res.data.contact;
}

export async function setPrimaryContact(leadId, contactId) {
  const res = await api.patch(`/leads/${leadId}/contacts/${contactId}/set-primary`);
  return res.data;
}

// Call logs
export async function listCallLogs(leadId) {
  const res = await api.get(`/leads/${leadId}/call-logs`);
  return res.data.logs;
}

export async function createCallLog(leadId, data) {
  const res = await api.post(`/leads/${leadId}/call-logs`, data);
  return res.data.callLog;
}

// Activities
export async function listActivities(leadId) {
  const res = await api.get(`/leads/${leadId}/activities`);
  return res.data.activities;
}

// Closure
export async function closeWon(leadId, data) {
  const res = await api.post(`/leads/${leadId}/close-won`, data);
  return res.data;
}

export async function closeLost(leadId, data) {
  const res = await api.post(`/leads/${leadId}/close-lost`, data);
  return res.data;
}