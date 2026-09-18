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

// Walk-in records
export async function listWalkIns(leadId) {
  const res = await api.get(`/leads/${leadId}/walk-ins`);
  return res.data.walkIns;
}

export async function createWalkIn(leadId, data) {
  const res = await api.post(`/leads/${leadId}/walk-ins`, data);
  return res.data;
}

// Demo records
export async function listDemos(leadId) {
  const res = await api.get(`/leads/${leadId}/demos`);
  return res.data.demos;
}

export async function createDemo(leadId, data) {
  const res = await api.post(`/leads/${leadId}/demos`, data);
  return res.data;
}

export async function updateDemoStatus(leadId, demoId, data) {
  const res = await api.patch(`/leads/${leadId}/demos/${demoId}/status`, data);
  return res.data;
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

export async function setOutcome(leadId, data) {
  const res = await api.post(`/leads/${leadId}/outcome`, data);
  return res.data;
}

// Reschedule follow-up
export async function rescheduleFollowUp(leadId, data) {
  const res = await api.patch(`/leads/${leadId}/follow-up`, data);
  return res.data;
}

// Complete follow-up
export async function completeFollowUp(leadId, data) {
  const res = await api.patch(`/leads/${leadId}/complete-follow-up`, data);
  return res.data;
}

// Re-engage / Reopen lead
export async function reopenLead(leadId, data = {}) {
  const res = await api.post(`/leads/${leadId}/reopen`, data);
  return res.data;
}

// Update walk-in status
export async function updateWalkInStatus(leadId, walkInId, data) {
  const res = await api.patch(`/leads/${leadId}/walk-ins/${walkInId}/status`, data);
  return res.data;
}

// Sales follow-up records
export async function listSalesFollowUps(leadId) {
  const res = await api.get(`/leads/${leadId}/sales-follow-ups`);
  return res.data.followUps;
}

export async function createSalesFollowUp(leadId, data) {
  const res = await api.post(`/leads/${leadId}/sales-follow-ups`, data);
  return res.data;
}

export async function updateSalesFollowUpStatus(leadId, followUpId, data) {
  const res = await api.patch(`/leads/${leadId}/sales-follow-ups/${followUpId}/status`, data);
  return res.data;
}

// Assigned activities for Sales Agent Workspace
export async function getAssignedActivities(params = {}) {
  const res = await api.get('/agents/assigned-activities', { params });
  return res.data;
}

// Immediate Lead Transfer
export async function transferLead(leadId, data) {
  const res = await api.post(`/leads/${leadId}/transfer`, data);
  return res.data;
}

// Delete Lead (Admin only)
export async function deleteLead(leadId) {
  const res = await api.delete(`/leads/${leadId}`);
  return res.data;
}

// CRM WhatsApp Activity
export async function sendWhatsAppActivity(leadId, data) {
  const res = await api.post(`/leads/${leadId}/whatsapp`, data);
  return res.data;
}
