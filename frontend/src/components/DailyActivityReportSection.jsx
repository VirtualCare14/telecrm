import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Pagination, Tooltip, Stack, Alert, CircularProgress,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton
} from '@mui/material';
import {
  FileDownload, PictureAsPdf, Refresh, PhoneInTalk,
  Business, CheckCircle, Schedule, Warning, LaptopMac,
  DirectionsWalk, EmojiEvents, Cancel, Search, CalendarMonth,
  Today, AssignmentTurnedIn, EventNote, HourglassEmpty,
  LocationOn, LocationOff, MyLocation, OpenInNew, Close, Devices
} from '@mui/icons-material';
import { getDailyActivityReport, downloadDailyActivityExport } from '../services/dashboardService';
import { generateDailyActivityPdf } from '../utils/dailyReportPdf';
import { getAgents } from '../services/agentService';
import { useHospitalDetail } from '../context/HospitalDetailContext';
import CalendarDatePicker from './CalendarDatePicker';

// Calculate Yesterday in Asia/Kolkata timezone
function getYesterdayIST() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = todayStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default function DailyActivityReportSection({
 selectedAgentId = '', selectedRole = 'all', agents: propAgents = [] }) {
  const { openHospitalDetail } = useHospitalDetail();
  const [selectedDate, setSelectedDate] = useState(() => getYesterdayIST());
  const [activeRole, setActiveRole] = useState(selectedRole);
  const [activeAgentId, setActiveAgentId] = useState(selectedAgentId);
  const [agentsList, setAgentsList] = useState(propAgents);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState({ xlsx: false, csv: false, pdf: false });
  const [visitsModalOpen, setVisitsModalOpen] = useState(false);

  // Sync with prop changes if passed from parent
  useEffect(() => {
    setActiveRole(selectedRole);
  }, [selectedRole]);

  useEffect(() => {
    setActiveAgentId(selectedAgentId);
  }, [selectedAgentId]);

  useEffect(() => {
    if (propAgents && propAgents.length > 0) {
      setAgentsList(propAgents);
    } else {
      getAgents().then((data) => {
        const list = Array.isArray(data) ? data : (data?.agents || []);
        setAgentsList(list);
      }).catch(() => {});
    }
  }, [propAgents]);

  // Table filtering and pagination states
  const [search, setSearch] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchReport = useCallback(async (dateToFetch, roleFilter = activeRole, agentFilter = activeAgentId) => {
    setLoading(true);
    setError(null);
    try {
      const params = { date: dateToFetch };
      if (roleFilter && roleFilter !== 'all') params.role = roleFilter;
      if (agentFilter) params.agentId = agentFilter;
      const data = await getDailyActivityReport(params);
      setReportData(data);
      setPage(1);
    } catch (err) {
      console.error('Failed to fetch daily activity report:', err);
      setError(err.response?.data?.message || 'Unable to load daily activity report');
    } finally {
      setLoading(false);
    }
  }, [activeRole, activeAgentId]);

  useEffect(() => {
    fetchReport(selectedDate, activeRole, activeAgentId);
  }, [selectedDate, activeRole, activeAgentId, fetchReport]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
  };

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
    // If agent role does not match, reset agent
    if (newRole !== 'all' && activeAgentId) {
      const currentAgent = agentsList.find(a => (a._id || a.id) === activeAgentId);
      if (currentAgent && currentAgent.agentRole?.toLowerCase() !== newRole.toLowerCase()) {
        setActiveAgentId('');
      }
    }
  };

  const handleAgentChange = (newAgentId) => {
    setActiveAgentId(newAgentId);
  };

  const handleDownloadExcel = async () => {
    setExportLoading((prev) => ({ ...prev, xlsx: true }));
    try {
      const params = { date: selectedDate };
      if (activeRole && activeRole !== 'all') params.role = activeRole;
      if (activeAgentId) params.agentId = activeAgentId;
      const res = await downloadDailyActivityExport(params, 'xlsx');
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `daily_activity_report_${selectedDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, xlsx: false }));
    }
  };

  const handleDownloadCsv = async () => {
    setExportLoading((prev) => ({ ...prev, csv: true }));
    try {
      const params = { date: selectedDate };
      if (activeRole && activeRole !== 'all') params.role = activeRole;
      if (activeAgentId) params.agentId = activeAgentId;
      const res = await downloadDailyActivityExport(params, 'csv');
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `daily_activity_report_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, csv: false }));
    }
  };

  const handleDownloadPdf = () => {
    if (!reportData) return;
    setExportLoading((prev) => ({ ...prev, pdf: true }));
    try {
      generateDailyActivityPdf(reportData);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, pdf: false }));
    }
  };

  // Filter hospital-wise rows based on search and disposition
  const filteredRows = useMemo(() => {
    if (!reportData?.hospitalActivity) return [];
    return reportData.hospitalActivity.filter((row) => {
      if (dispositionFilter !== 'ALL' && (row.disposition || '').toLowerCase() !== dispositionFilter.toLowerCase()) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchesHospital = (row.hospitalName || '').toLowerCase().includes(q);
        const matchesPhone = (row.hospitalPhone || '').toLowerCase().includes(q);
        const matchesCaller = (row.callerName || '').toLowerCase().includes(q);
        const matchesRemarks = (row.remarks || '').toLowerCase().includes(q);
        const matchesDisposition = (row.disposition || '').toLowerCase().includes(q);
        if (!matchesHospital && !matchesPhone && !matchesCaller && !matchesRemarks && !matchesDisposition) {
          return false;
        }
      }
      return true;
    });
  }, [reportData, search, dispositionFilter]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Filter agents matching selected role
  const filteredAgents = useMemo(() => {
    if (!agentsList || agentsList.length === 0) return [];
    if (!activeRole || activeRole === 'all') return agentsList;
    return agentsList.filter(a => (a.agentRole || '').toLowerCase() === activeRole.toLowerCase());
  }, [agentsList, activeRole]);

  // Available unique dispositions for filter dropdown
  const availableDispositions = useMemo(() => {
    if (!reportData?.hospitalActivity) return [];
    const set = new Set(reportData.hospitalActivity.map((r) => r.disposition).filter(Boolean));
    return Array.from(set).sort();
  }, [reportData]);

  const summary = reportData?.summary || {};

  return (
    <Box>
      {/* 1. Header Toolbar with Date Controls and Action Buttons */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Grid container spacing={2} alignItems="center" justifyContent="space-between">
          {/* Left: Date Selection, Role & Agent Filters, Shortcuts */}
          <Grid item xs={12} xl={7}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <CalendarDatePicker
                id="daily-report-date-picker"
                size="small"
                label="Report Date (IST)"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                sx={{ width: 165 }}
              />

              <Button
                variant={selectedDate === getYesterdayIST() ? 'contained' : 'outlined'}
                size="small"
                startIcon={<CalendarMonth />}
                onClick={() => handleDateChange(getYesterdayIST())}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: selectedDate === getYesterdayIST() ? 'primary.main' : 'transparent',
                }}
              >
                Yesterday
              </Button>

              <Button
                variant={selectedDate === getTodayIST() ? 'contained' : 'outlined'}
                size="small"
                startIcon={<Today />}
                onClick={() => handleDateChange(getTodayIST())}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: selectedDate === getTodayIST() ? 'primary.main' : 'transparent',
                }}
              >
                Today
              </Button>

              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel id="daily-role-select-label">Role</InputLabel>
                <Select
                  labelId="daily-role-select-label"
                  id="daily-role-select"
                  value={activeRole}
                  label="Role"
                  onChange={(e) => handleRoleChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="Sales Agent">Sales Agent</MenuItem>
                  <MenuItem value="Calling Agent">Calling Agent</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="daily-agent-select-label">Agent</InputLabel>
                <Select
                  labelId="daily-agent-select-label"
                  id="daily-agent-select"
                  value={activeAgentId}
                  label="Agent"
                  onChange={(e) => handleAgentChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Agents</MenuItem>
                  {filteredAgents.map((a) => (
                    <MenuItem key={a._id || a.id} value={a._id || a.id}>
                      {a.fullName || a.username}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Tooltip title="Reload report data">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => fetchReport(selectedDate, activeRole, activeAgentId)}
                    disabled={loading}
                    sx={{ minWidth: 38, px: 1, borderRadius: 2 }}
                  >
                    <Refresh fontSize="small" />
                  </Button>
                </span>
              </Tooltip>

              <Chip
                label="8:00 AM Ready"
                size="small"
                color="success"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: 11, height: 24 }}
              />
            </Stack>
          </Grid>

          {/* Right: Export Download Options */}
          <Grid item xs={12} xl={5} sx={{ textAlign: { xs: 'left', xl: 'right' } }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', xl: 'flex-end' }} flexWrap="wrap" sx={{ gap: 1 }}>
              <Button
                id="view-field-visits-gps-btn"
                variant="outlined"
                size="small"
                startIcon={<LocationOn sx={{ color: '#059669' }} />}
                onClick={() => setVisitsModalOpen(true)}
                disabled={loading || !reportData}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#059669',
                  color: '#059669',
                  '&:hover': { bgcolor: 'rgba(5, 150, 105, 0.08)', borderColor: '#047857' },
                }}
              >
                Field Visits GPS ({reportData?.walkIns?.length || 0})
              </Button>

              <Button
                id="download-daily-excel-btn"
                variant="contained"
                size="small"
                startIcon={exportLoading.xlsx ? <CircularProgress size={16} color="inherit" /> : <FileDownload />}
                onClick={handleDownloadExcel}
                disabled={loading || !reportData || exportLoading.xlsx}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#059669',
                  '&:hover': { bgcolor: '#047857' },
                }}
              >
                Download Excel (.xlsx)
              </Button>

              <Button
                id="download-daily-pdf-btn"
                variant="contained"
                size="small"
                startIcon={exportLoading.pdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdf />}
                onClick={handleDownloadPdf}
                disabled={loading || !reportData || exportLoading.pdf}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#dc2626',
                  '&:hover': { bgcolor: '#b91c1c' },
                }}
              >
                Download PDF
              </Button>

              <Button
                id="download-daily-csv-btn"
                variant="outlined"
                size="small"
                startIcon={exportLoading.csv ? <CircularProgress size={16} color="inherit" /> : <FileDownload />}
                onClick={handleDownloadCsv}
                disabled={loading || !reportData || exportLoading.csv}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Download CSV
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && reportData && (
        <>
          {/* 2. Daily Summary KPI Scorecard Grid */}
          <Box sx={{ mb: 3.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssignmentTurnedIn fontSize="small" sx={{ color: 'primary.main' }} />
                Daily Activity Summary ({selectedDate})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Asia/Kolkata Calendar Day • Actual CRM Records
              </Typography>
            </Box>

            <Grid container spacing={1.5}>
              {/* Calls Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0f9ff' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#0369a1" display="block">
                      TOTAL CALLS
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#0c4a6e" sx={{ mt: 0.5 }}>
                      {summary.totalCalls || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Logged outreach calls
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdf4' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      UNIQUE HOSPITALS
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.uniqueHospitalsCalled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Distinct hospitals contacted
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Follow-ups Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#475569" display="block">
                      FOLLOW-UPS DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#1e293b" sx={{ mt: 0.5 }}>
                      {summary.followUpsCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Follow-ups completed on date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fffbeb' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b45309" display="block">
                      FOLLOW-UPS PENDING
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#92400e" sx={{ mt: 0.5 }}>
                      {summary.followUpsPending || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Scheduled for date, pending
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b91c1c" display="block">
                      FOLLOW-UPS OVERDUE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#991b1b" sx={{ mt: 0.5 }}>
                      {summary.followUpsOverdue || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Overdue as of date end
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Demos Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#faf5ff' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#6b21a8" display="block">
                      DEMOS SCHEDULED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#581c87" sx={{ mt: 0.5 }}>
                      {summary.demosScheduled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Fixed demo appointments
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#ecfdf5' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      DEMOS COMPLETED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.demosCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Done with doctors/decision makers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#dc2626" display="block">
                      DEMOS NOT DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#b91c1c" sx={{ mt: 0.5 }}>
                      {summary.demosNotDone || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Cancelled or missed demos
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Walk-ins Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdfa' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#0f766e" display="block">
                      WALK-INS SCHEDULED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#115e59" sx={{ mt: 0.5 }}>
                      {summary.walkInsScheduled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Planned in-person meetings
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#ecfdf5' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      WALK-INS COMPLETED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.walkInsCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      On-site visits conducted
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#dc2626" display="block">
                      WALK-INS NOT DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#b91c1c" sx={{ mt: 0.5 }}>
                      {summary.walkInsNotCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Unfulfilled in-person visits
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Won / Lost */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdf4' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#15803d" display="block">
                      LEADS WON
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#166534" sx={{ mt: 0.5 }}>
                      {summary.leadsWon || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Closed won on actual date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b91c1c" display="block">
                      LEADS LOST
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#991b1b" sx={{ mt: 0.5 }}>
                      {summary.leadsLost || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Closed lost on actual date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* 3. Hospital-Wise Detailed Activity Table */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            {/* Table Filters Toolbar */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
              <Grid container spacing={2} alignItems="center" justifyContent="space-between">
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    id="search-hospital-activity-input"
                    fullWidth
                    size="small"
                    placeholder="Search hospital, phone, caller, or remark..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ bgcolor: '#ffffff', borderRadius: 2 }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small" sx={{ bgcolor: '#ffffff', borderRadius: 2 }}>
                    <InputLabel id="disposition-filter-select-label">Disposition</InputLabel>
                    <Select
                      labelId="disposition-filter-select-label"
                      id="disposition-filter-select"
                      value={dispositionFilter}
                      label="Disposition"
                      onChange={(e) => {
                        setDispositionFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <MenuItem value="ALL">All Dispositions</MenuItem>
                      {availableDispositions.map((disp) => (
                        <MenuItem key={disp} value={disp}>
                          {disp}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={5} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Typography variant="body2" color="text.secondary">
                    Showing <strong>{filteredRows.length}</strong> individual call records
                    {filteredRows.length !== (reportData?.hospitalActivity?.length || 0) && (
                      <span> (filtered from {reportData?.hospitalActivity?.length})</span>
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Table Data */}
            <TableContainer>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Hospital Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Contact Number</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Call Time (IST)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Caller / Agent</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Disposition</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 260 }}>Call Remarks / Notes</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Lead Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Next Follow-up</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Demo / Walk-in</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Assigned Agent</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        No call activity records found matching the selected date and filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row, idx) => (
                      <TableRow key={row.id || idx} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {(page - 1) * pageSize + idx + 1}
                        </TableCell>
                        <TableCell
                          onClick={() => row.leadId && openHospitalDetail(row.leadId, row)}
                          sx={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: row.leadId ? 'primary.main' : 'text.primary',
                            cursor: row.leadId ? 'pointer' : 'default',
                            '&:hover': row.leadId ? { textDecoration: 'underline' } : {},
                          }}
                        >
                          {row.hospitalName}
                          {row.leadNumber && row.leadNumber !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Lead #{row.leadNumber}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.hospitalPhone}
                          {row.contactPerson && row.contactPerson !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {row.contactPerson}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.callDateTime}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.callerName}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.disposition}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: 11,
                              fontWeight: 600,
                              bgcolor:
                                row.disposition === 'Interested' || row.disposition === 'Connected'
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : row.disposition === 'Not Interested'
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : 'rgba(2, 132, 199, 0.12)',
                              color:
                                row.disposition === 'Interested' || row.disposition === 'Connected'
                                  ? '#047857'
                                  : row.disposition === 'Not Interested'
                                  ? '#b91c1c'
                                  : '#0369a1',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.primary' }}>
                          {row.remarks}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.currentLeadStatus}
                            size="small"
                            color={row.currentLeadStatus === 'WON' ? 'success' : row.currentLeadStatus === 'LOST' ? 'error' : 'default'}
                            variant={row.currentLeadStatus === 'OPEN' ? 'outlined' : 'filled'}
                            sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.nextFollowUpDate}
                          {row.followUpStatus !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Status: {row.followUpStatus}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.demoStatus !== 'N/A' ? (
                            <Typography variant="caption" display="block" color="#581c87" fontWeight={600}>
                              Demo: {row.demoStatus}
                            </Typography>
                          ) : null}
                          {row.walkInStatus !== 'N/A' ? (
                            <Typography variant="caption" display="block" color="#0f766e" fontWeight={600}>
                              Walk-in: {row.walkInStatus}
                            </Typography>
                          ) : null}
                          {row.demoStatus === 'N/A' && row.walkInStatus === 'N/A' ? '—' : null}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.currentAssignedAgent}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                  shape="rounded"
                  size="small"
                />
              </Box>
            )}
          </Paper>
        </>
      )}

      {/* Field Visits GPS & Device Verification Dialog (Requirement 5) */}
      <Dialog
        open={visitsModalOpen}
        onClose={() => setVisitsModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <MyLocation sx={{ color: '#059669', fontSize: 24 }} />
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Sales Agent Field Visits & GPS Verification
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Verified visits for {selectedDate} ({reportData?.walkIns?.length || 0} visits recorded)
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={() => setVisitsModalOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {(!reportData?.walkIns || reportData.walkIns.length === 0) ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <DirectionsWalk sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                No field visits or walk-ins recorded for {selectedDate}.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Hospital Name & Registered Address</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Sales Agent</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Visit Date & Time</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>GPS Location Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Captured Coordinates</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>GPS Accuracy</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Distance</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Geofence</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Device ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="center">Map Link</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.walkIns.map((w, idx) => (
                    <TableRow key={idx} hover sx={{ '&:nth-of-type(even)': { bgcolor: '#fcfcfc' } }}>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                          {w.hospitalName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25 }}>
                          Registered Address: {w.hospitalAddress || 'Not recorded'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                        {w.agentName}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {w.walkInDate} {w.walkInTime !== 'N/A' ? `• ${w.walkInTime}` : ''}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          label={w.status}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                            bgcolor: ['Done', 'Completed'].includes(w.status) ? 'rgba(16, 185, 129, 0.12)' : (w.status === 'Not Done' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'),
                            color: ['Done', 'Completed'].includes(w.status) ? '#059669' : (w.status === 'Not Done' ? '#dc2626' : '#2563eb'),
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          icon={w.latitude != null ? <LocationOn sx={{ fontSize: '13px !important' }} /> : <LocationOff sx={{ fontSize: '13px !important' }} />}
                          label={w.locationStatus || 'Not recorded'}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                            bgcolor: w.latitude != null ? 'rgba(16, 185, 129, 0.12)' : (w.locationStatus === 'Permission Denied' ? 'rgba(245, 158, 11, 0.12)' : '#f1f5f9'),
                            color: w.latitude != null ? '#059669' : (w.locationStatus === 'Permission Denied' ? '#d97706' : '#64748b'),
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {w.latitude != null && w.longitude != null ? (
                          `${w.latitude.toFixed(6)}, ${w.longitude.toFixed(6)}`
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                            Not recorded
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {w.accuracy || 'N/A'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                        {w.distanceMetres || 'N/A'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          label={w.geofenceStatus || 'Not Verified'}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                            bgcolor: w.geofenceStatus === 'Passed' ? 'rgba(16, 185, 129, 0.12)' : w.geofenceStatus === 'Failed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                            color: w.geofenceStatus === 'Passed' ? '#059669' : w.geofenceStatus === 'Failed' ? '#dc2626' : '#2563eb',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                        <Tooltip title={w.deviceInstallationId || 'Not recorded'}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {typeof w.deviceInstallationId === 'string' && w.deviceInstallationId && w.deviceInstallationId !== 'Not recorded'
                              ? `${w.deviceInstallationId.substring(0, 10)}...`
                              : (w.deviceInstallationId ? String(w.deviceInstallationId) : 'Not recorded')}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        {w.mapUrl ? (
                          <Button
                            size="small"
                            variant="outlined"
                            component="a"
                            href={w.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            startIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                            sx={{ minWidth: 'auto', py: 0.2, px: 1, fontSize: 11, textTransform: 'none', color: '#2563eb', borderColor: 'rgba(37, 99, 235, 0.3)' }}
                          >
                            Map
                          </Button>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setVisitsModalOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
