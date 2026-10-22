import api from './api';

export async function bulkTransferLeads({ fromAgentId, toAgentId, leadIds }) {
  const res = await api.post('/admin/leads/bulk-transfer', { fromAgentId, toAgentId, leadIds });
  return res.data;
}

export async function exportRawDump(params = {}) {
  const res = await api.get('/admin/export/raw-dump', {
    params,
    responseType: 'blob',
  });
  return res;
}

export function triggerFileDownload(blob, defaultFilename = 'telecrm_export.xlsx', contentDisposition = '') {
  let filename = defaultFilename;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
    }
  }
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
