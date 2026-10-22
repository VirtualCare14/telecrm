import api from './api'

export async function getAdminDashboard(params) {
  const res = await api.get('/dashboard/admin', { params })
  return res.data
}

export async function getAdminReports(params) {
  const res = await api.get('/dashboard/reports', { params })
  return res.data
}

export async function getAgentDashboard(params) {
  const res = await api.get('/dashboard/agent', { params })
  return res.data
}

export async function getDailyActivityReport(params) {
  const res = await api.get('/dashboard/daily-activity', { params });
  return res.data;
}

export async function downloadDailyActivityExport(params, format = 'xlsx') {
  const res = await api.get('/dashboard/daily-activity/export', {
    params: { ...params, format },
    responseType: 'blob',
  });
  return res;
}

export async function getActivityHospitals(params) {
  const res = await api.get('/dashboard/activity-hospitals', { params });
  return res.data;
}

export async function downloadActivityHospitalsExport(params, format = 'xlsx') {
  const res = await api.get('/dashboard/activity-hospitals/export', {
    params: { ...params, format },
    responseType: 'blob',
  });
  return res;
}

export async function getDashboardMetricRecords(params) {
  const res = await api.get('/dashboard/metric-records', { params });
  return res.data;
}

export async function downloadDashboardMetricRecordsExport(params, format = 'xlsx') {
  const res = await api.get('/dashboard/metric-records/export', {
    params: { ...params, format },
    responseType: 'blob',
  });
  return res;
}


