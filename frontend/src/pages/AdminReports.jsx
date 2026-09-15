import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, FormControl, InputLabel,
  Select, MenuItem, TextField, Button, Chip, LinearProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Alert, Tooltip, Divider, Stack, Avatar
} from '@mui/material';
import {
  Assessment, Refresh, Business, Schedule, CheckCircle,
  Cancel, PhoneInTalk, DirectionsWalk, LaptopMac, EmojiEvents,
  Person, TrendingUp, CalendarMonth, FilterAlt, EventNote,
  TaskAlt, Warning, EventBusy, FileDownload
} from '@mui/icons-material';
import { getAdminReports } from '../services/dashboardService';
import { getAgents } from '../services/agentService';
import {
  formatDateToYYYYMMDD, getDailyRange, getWeeklyRange,
  getMonthlyRange, formatDate, formatDateTime
} from '../utils/dateHelpers';

export default function AdminReports() {
  // Filter States
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(() => formatDateToYYYYMMDD(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  });
  const [selectedAgentId, setSelectedAgentId] = useState('');

  // Data States
  const [agents, setAgents] = useState([]);
  const [reportsData, setReportsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Compute active date range based on report type and selected values
  const activeRange = useMemo(() => {
    if (reportType === 'daily') {
      return getDailyRange(selectedDate);
    } else if (reportType === 'weekly') {
      return getWeeklyRange(selectedDate);
    } else if (reportType === 'monthly') {
      return getMonthlyRange(selectedMonth);
    }
    return {};
  }, [reportType, selectedDate, selectedMonth]);

  // Fetch Agents List once on mount
  useEffect(() => {
    let mounted = true;
    getAgents()
      .then((data) => {
        if (mounted) setAgents(data || []);
      })
      .catch((err) => {
        console.error('Failed to fetch agents for reports filter', err);
        if (mounted) setAgents([]);
      });
    return () => { mounted = false; };
  }, []);

  // Fetch Report Data from real CRM backend
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (activeRange.startDate) params.startDate = activeRange.startDate;
      if (activeRange.endDate) params.endDate = activeRange.endDate;
      if (selectedAgentId) params.agentId = selectedAgentId;

      const data = await getAdminReports(params);
      setReportsData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  }, [activeRange, selectedAgentId]);

  // When filters change, auto update report
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Active filter text label helper
  const activePeriodLabel = useMemo(() => {
    if (!activeRange.startDate || !activeRange.endDate) return 'All Time';
    if (activeRange.startDate === activeRange.endDate) {
      return formatDate(activeRange.startDate);
    }
    return `${formatDate(activeRange.startDate)} — ${formatDate(activeRange.endDate)}`;
  }, [activeRange]);

  const activeAgentName = useMemo(() => {
    if (!selectedAgentId) return 'All Agents';
    const found = agents.find((a) => a._id === selectedAgentId);
    return found ? (found.fullName || found.username) : 'Selected Agent';
  }, [selectedAgentId, agents]);

  // Extract real dynamic summaries
  const summary = reportsData?.summary || {};
  const totalLeads = summary.totalLeads ?? 0;
  const openLeads = summary.openLeads ?? 0;
  const wonLeads = summary.wonLeads ?? 0;
  const lostLeads = summary.lostLeads ?? 0;
  const totalDealValue = summary.totalDealValue ?? 0;
  const avgDealValue = summary.avgDealValue ?? 0;
  const conversionRate = summary.conversionRate ?? 0;
  const callsCount = summary.callsCount ?? 0;
  const walkInsCount = summary.walkInsCount ?? 0;
  const demosCount = summary.demosCount ?? 0;
  const completedDemos = summary.completedDemos ?? 0;
  const demosNotDone = summary.demosNotDone ?? 0;
  const followUpsScheduled = summary.followUpsScheduled ?? 0;
  const followUpsCompleted = summary.followUpsCompleted ?? 0;
  const overdueFollowups = summary.overdueFollowups ?? 0;

  const agentPerformance = reportsData?.agentPerformance || [];
  const dateWiseReport = reportsData?.dateWiseReport || [];
  const sources = reportsData?.sources || [];
  const dispositions = reportsData?.dispositions || [];
  const lostReasons = reportsData?.lostReasons || [];
  const recentClosed = reportsData?.recentClosed || [];

  // CSV Export Handler
  const handleExportCSV = () => {
    if (!reportsData) return;

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [];

    // 1. Report Header / Filter Metadata
    rows.push(['REPORT INFORMATION']);
    rows.push(['Report Type', reportType ? reportType.toUpperCase() : '']);
    rows.push(['Selected Period', activePeriodLabel]);
    rows.push(['Selected Agent', activeAgentName]);
    rows.push(['Exported At', formatDateTime(new Date())]);
    rows.push([]);

    // 2. Visible Report Metrics (Summary & Activity Metrics)
    rows.push(['REPORT METRICS']);
    rows.push(['Metric', 'Value']);
    rows.push(['Total Leads', totalLeads]);
    rows.push(['Open Leads', openLeads]);
    rows.push(['Won Leads', wonLeads]);
    rows.push(['Lost Leads', lostLeads]);
    rows.push(['Conversion Rate', `${conversionRate}%`]);
    rows.push(['Total Deal Value', `₹${totalDealValue.toLocaleString('en-IN')}`]);
    rows.push(['Average Deal Value', `₹${avgDealValue.toLocaleString('en-IN')}`]);
    rows.push(['Calls Logged', callsCount]);
    rows.push(['Follow-ups Scheduled', followUpsScheduled]);
    rows.push(['Follow-ups Completed', followUpsCompleted]);
    rows.push(['Overdue Follow-ups', overdueFollowups]);
    rows.push(['Walk-ins', walkInsCount]);
    rows.push(['Demos Scheduled', demosCount]);
    rows.push(['Demos Completed', completedDemos]);
    rows.push(['Demos Not Done', demosNotDone]);
    rows.push([]);

    // 3. Date-wise Activity Report
    rows.push(['DATE-WISE ACTIVITY REPORT']);
    rows.push([
      'Date',
      'Calls Logged',
      'Follow-ups Scheduled',
      'Follow-ups Completed',
      'Walk-ins',
      'Demos Scheduled',
      'Demos Completed',
      'Demos Not Done',
      'Won Leads',
      'Lost Leads'
    ]);
    if (dateWiseReport.length === 0) {
      rows.push(['No activity data available for the selected period']);
    } else {
      dateWiseReport.forEach((r) => {
        rows.push([
          formatDate(r.date),
          r.callsLogged,
          r.followUpsScheduled,
          r.followUpsCompleted,
          r.walkIns,
          r.demosScheduled,
          r.demosCompleted,
          r.demosNotDone,
          r.wonLeads,
          r.lostLeads
        ]);
      });
    }
    rows.push([]);

    // 4. Agent Performance Table
    rows.push(['AGENT PERFORMANCE']);
    rows.push([
      'Agent Name',
      'Agent Role',
      'Calls Logged',
      'Walk-ins',
      'Demos Scheduled',
      'Demos Completed',
      'Demos Not Done',
      'Follow-ups Scheduled',
      'Follow-ups Completed',
      'Won Leads',
      'Lost Leads'
    ]);
    if (agentPerformance.length === 0) {
      rows.push(['No active agents found for this filter']);
    } else {
      agentPerformance.forEach((a) => {
        rows.push([
          a.agentName || 'Agent',
          a.agentRole || '',
          a.callsLogged,
          a.walkIns,
          a.demosScheduled,
          a.demosCompleted,
          a.demosNotDone,
          a.followUpsScheduled,
          a.followUpsCompleted,
          a.wonLeads,
          a.lostLeads
        ]);
      });
    }

    const csvContent = rows.map((row) => row.map(escapeCSV).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedAgent = (activeAgentName || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `admin_report_${reportType}_${activeRange.startDate || 'start'}_${activeRange.endDate || 'end'}_${sanitizedAgent}.csv`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
            Reports
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Dynamic CRM performance, pipeline metrics, and team activity
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            id="export-csv-btn"
            variant="contained"
            size="small"
            startIcon={<FileDownload />}
            onClick={handleExportCSV}
            disabled={loading || !reportsData}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: '#ffffff',
              fontWeight: 600,
              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
              '&:hover': { bgcolor: 'primary.dark' }
            }}
          >
            Export CSV
          </Button>
          <Button
            id="refresh-reports-btn"
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={fetchReports}
            disabled={loading}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              borderColor: 'divider',
              color: 'text.primary',
              fontWeight: 600,
              '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(234, 88, 12, 0.04)' }
            }}
          >
            Refresh Data
          </Button>
        </Stack>
      </Box>

      {/* Filter Toolbar */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: '#ffffff'
        }}
      >
        <Grid container spacing={2} alignItems="center">
          {/* 1. Report Type: Daily, Weekly, Monthly */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="report-type-select-label">Report Type</InputLabel>
              <Select
                labelId="report-type-select-label"
                id="report-type-select"
                value={reportType}
                label="Report Type"
                onChange={(e) => setReportType(e.target.value)}
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* 2. Date Selector (Context-Sensitive) */}
          <Grid item xs={12} sm={6} md={4}>
            {reportType === 'monthly' ? (
              <TextField
                fullWidth
                size="small"
                type="month"
                label="Select Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            ) : (
              <TextField
                fullWidth
                size="small"
                type="date"
                label={reportType === 'weekly' ? 'Select Week (Date)' : 'Select Date'}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Grid>

          {/* 3. Agent Selector with "All Agents" */}
          <Grid item xs={12} sm={12} md={5}>
            <FormControl fullWidth size="small">
              <InputLabel id="agent-select-label">Agent</InputLabel>
              <Select
                labelId="agent-select-label"
                id="agent-select"
                value={selectedAgentId}
                label="Agent"
                onChange={(e) => setSelectedAgentId(e.target.value)}
              >
                <MenuItem value="">
                  <em>All Agents</em>
                </MenuItem>
                {agents.map((agent) => (
                  <MenuItem key={agent._id} value={agent._id}>
                    {agent.fullName || agent.username}
                    {agent.agentRole ? ` (${agent.agentRole})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Active Filter Context Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
          <Chip
            size="small"
            icon={<CalendarMonth sx={{ fontSize: '16px !important' }} />}
            label={`${reportType.toUpperCase()}: ${activePeriodLabel}`}
            sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
          />
          <Chip
            size="small"
            icon={<Person sx={{ fontSize: '16px !important' }} />}
            label={`Agent: ${activeAgentName}`}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {loading && (
            <Chip
              size="small"
              label="Updating report..."
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
          )}
        </Stack>
      </Paper>

      {/* Loading Bar */}
      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Dynamic Report Content */}
      {reportsData && (
        <>
          {/* KPI Pipeline Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Total Leads */}
            <Grid item xs={12} sm={6} md={3}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  borderTop: '4px solid #ea580c'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Total Leads
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#0f172a' }}>
                      {totalLeads}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
                    <Business />
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  In selected {reportType} period
                </Typography>
              </Paper>
            </Grid>

            {/* Open Leads */}
            <Grid item xs={12} sm={6} md={3}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  borderTop: '4px solid #0284c7'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Open Leads
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#0f172a' }}>
                      {openLeads}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
                    <Schedule />
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Active in pipeline
                </Typography>
              </Paper>
            </Grid>

            {/* Won Leads */}
            <Grid item xs={12} sm={6} md={3}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  borderTop: '4px solid #10b981'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Won Leads
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#10b981' }}>
                      {wonLeads}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <CheckCircle />
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#059669', fontWeight: 600 }}>
                  {conversionRate}% conversion rate
                  {totalDealValue > 0 && ` • ₹${totalDealValue.toLocaleString('en-IN')}`}
                </Typography>
              </Paper>
            </Grid>

            {/* Lost Leads */}
            <Grid item xs={12} sm={6} md={3}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  borderTop: '4px solid #ef4444'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Lost Leads
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#ef4444' }}>
                      {lostLeads}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                    <Cancel />
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Closed without conversion
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Activity Metrics Strip */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#ffffff'
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
              Activity Metrics in Selected Period
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#2563eb', mb: 0.5 }}>
                    <PhoneInTalk fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Calls Logged</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{callsCount}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#7c3aed', mb: 0.5 }}>
                    <DirectionsWalk fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Walk-ins</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{walkInsCount}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#d97706', mb: 0.5 }}>
                    <LaptopMac fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Demos Scheduled</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{demosCount}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#059669', mb: 0.5 }}>
                    <EmojiEvents fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Demos Completed</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{completedDemos}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#4f46e5', mb: 0.5 }}>
                    <EventNote fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Follow-ups Scheduled</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{followUpsScheduled}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#0d9488', mb: 0.5 }}>
                    <TaskAlt fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Follow-ups Completed</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{followUpsCompleted}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ea580c', mb: 0.5 }}>
                    <Warning fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Overdue Follow-ups</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{overdueFollowups}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#e11d48', mb: 0.5 }}>
                    <EventBusy fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>Demos Not Done</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{demosNotDone}</Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Agent Performance Section */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#ffffff'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                  Agent Performance
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Individual agent activity and outcome metrics for the selected period
                </Typography>
              </Box>
              <Chip
                size="small"
                label={
                  selectedAgentId
                    ? '1 Selected Agent'
                    : `${agentPerformance.length} Active Agent${agentPerformance.length === 1 ? '' : 's'}`
                }
                sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
              />
            </Box>

            <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 960 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Agent Name</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Calls Logged</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Walk-ins</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Scheduled</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Completed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Not Done</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Follow-ups Scheduled</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Follow-ups Completed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Won Leads</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Lost Leads</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agentPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        No active agents found for this filter
                      </TableCell>
                    </TableRow>
                  ) : (
                    agentPerformance.map((agent) => (
                      <TableRow key={agent.agentId} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Avatar
                              sx={{
                                width: 28,
                                height: 28,
                                fontSize: 13,
                                fontWeight: 700,
                                bgcolor: 'rgba(234, 88, 12, 0.1)',
                                color: 'primary.main'
                              }}
                            >
                              {(agent.agentName || 'A').charAt(0).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600} color="text.primary">
                                {agent.agentName}
                              </Typography>
                              {agent.agentRole && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                                  {agent.agentRole}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#2563eb' }}>
                          {agent.callsLogged}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#7c3aed' }}>
                          {agent.walkIns}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#d97706' }}>
                          {agent.demosScheduled}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#059669' }}>
                          {agent.demosCompleted}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#e11d48' }}>
                          {agent.demosNotDone}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#4f46e5' }}>
                          {agent.followUpsScheduled}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#0d9488' }}>
                          {agent.followUpsCompleted}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#10b981' }}>
                          {agent.wonLeads}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#ef4444' }}>
                          {agent.lostLeads}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Date-wise Activity Report Section */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#ffffff'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                  Date-wise Activity Report
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Daily breakdown of calls, follow-ups, walk-ins, demos, and outcomes in the selected period
                </Typography>
              </Box>
              <Chip
                size="small"
                label={`${dateWiseReport.length} Date${dateWiseReport.length === 1 ? '' : 's'}`}
                sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
              />
            </Box>

            <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 960 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Calls Logged</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Follow-ups Scheduled</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Follow-ups Completed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Walk-ins</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Scheduled</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Completed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Demos Not Done</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Won Leads</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Lost Leads</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dateWiseReport.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        No activity data available for the selected period
                      </TableCell>
                    </TableRow>
                  ) : (
                    dateWiseReport.map((row) => (
                      <TableRow key={row.date} hover>
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {formatDate(row.date)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#2563eb' }}>
                          {row.callsLogged}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#4f46e5' }}>
                          {row.followUpsScheduled}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#0d9488' }}>
                          {row.followUpsCompleted}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#7c3aed' }}>
                          {row.walkIns}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#d97706' }}>
                          {row.demosScheduled}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#059669' }}>
                          {row.demosCompleted}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#e11d48' }}>
                          {row.demosNotDone}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#10b981' }}>
                          {row.wonLeads}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#ef4444' }}>
                          {row.lostLeads}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Breakdowns Grid: Sources & Dispositions */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Lead Sources */}
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  height: '100%'
                }}
              >
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                  Lead Sources Breakdown
                </Typography>
                {sources.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No leads created in this period
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Leads</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Share</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sources.map((src, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{src.source}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{src.count}</TableCell>
                            <TableCell align="right">{src.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </Grid>

            {/* Dispositions */}
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#ffffff',
                  height: '100%'
                }}
              >
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                  Call Dispositions Breakdown
                </Typography>
                {dispositions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No call dispositions recorded in this period
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Disposition</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Count</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Share</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dispositions.map((disp, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{disp.disposition}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{disp.count}</TableCell>
                            <TableCell align="right">{disp.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Closed Leads in Period */}
          {recentClosed.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: '#ffffff',
                mb: 3
              }}
            >
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                Closed Leads in this Period
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Lead #</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Organization</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Owner</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Outcome</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Deal Value / Reason</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Closed Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentClosed.map((lead) => {
                      const isWon = lead.closureStatus === 'WON';
                      return (
                        <TableRow key={lead._id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>#{lead.leadNumber}</TableCell>
                          <TableCell>{lead.organizationName}</TableCell>
                          <TableCell>{lead.currentOwner?.fullName || lead.currentOwner?.username || '—'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={lead.closureStatus}
                              color={isWon ? 'success' : 'error'}
                              sx={{ fontWeight: 700, fontSize: 11 }}
                            />
                          </TableCell>
                          <TableCell>
                            {isWon
                              ? lead.dealValue ? `₹${Number(lead.dealValue).toLocaleString('en-IN')}` : '—'
                              : lead.lostReason || lead.closingRemark || '—'}
                          </TableCell>
                          <TableCell>{formatDate(lead.closedAt || lead.updatedAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* Empty State when no data across board */}
          {totalLeads === 0 && callsCount === 0 && walkInsCount === 0 && demosCount === 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 4,
                borderRadius: 2.5,
                border: '1px dashed #cbd5e1',
                textAlign: 'center',
                bgcolor: '#f8fafc',
                my: 2
              }}
            >
              <Assessment sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
              <Typography variant="h6" fontWeight={600} color="text.primary">
                No CRM activity found for this period
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Try selecting a different date, week, or month, or choose "All Agents" to view broader results.
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
