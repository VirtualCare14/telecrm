import api from './api'

export async function bulkTransferLeads({ fromAgentId, toAgentId, leadIds }) {
  const res = await api.post('/admin/leads/bulk-transfer', { fromAgentId, toAgentId, leadIds })
  return res.data
}
