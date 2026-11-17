import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, FormControl, InputLabel,
  Select, MenuItem, TextField, Button, Chip, LinearProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  TableFooter, IconButton, Collapse, Alert, Tooltip, Divider, Stack, Avatar,
  Tabs, Tab
} from '@mui/material';
import {
  Assessment, Refresh, Business, Schedule, CheckCircle,
  Cancel, PhoneInTalk, DirectionsWalk, LaptopMac, EmojiEvents,
  Person, TrendingUp, CalendarMonth, FilterAlt, EventNote,
  TaskAlt, Warning, EventBusy, FileDownload, KeyboardArrowDown,
  KeyboardArrowUp, BusinessCenter, Visibility, HelpOutline
} from '@mui/icons-material';
import { getAdminReports } from '../services/dashboardService';
import { getAgents } from '../services/agentService';
import DailyActivityReportSection from '../components/DailyActivityReportSection';
import HospitalActivityReportSection from '../components/HospitalActivityReportSection';
import CalendarDatePicker from '../components/CalendarDatePicker';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  formatDateToYYYYMMDD, getDailyRange, getWeeklyRange,
  getMonthlyRange, formatDate, formatDateTime
} from '../utils/dateHelpers';

export default function AdminReports() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlTab = searchParams.get('tab');
  const urlActivityType = searchParams.get('activityType') || 'ALL';
  const urlStatus = searchParams.get('status') || 'ALL';
  const urlAgentId = searchParams.get('agentId') || '';

  // Report Tab Navigation (Daily Activity Report vs Hospital Activities vs General Trend Reports)
  const [activeReportTab, setActiveReportTab] = useState(() => {
    if (urlTab === 'activities' || urlTab === 'hospital-activities') return 'activities';
    if (urlTab === 'general') return 'general';
    return 'daily';
  });

  useEffect(() => {
    if (urlTab === 'activities' || urlTab === 'hospital-activities') {
      setActiveReportTab('activities');
    } else if (urlTab === 'general') {
      setActiveReportTab('general');
    } else if (urlTab === 'daily') {
      setActiveReportTab('daily');
    }
  }, [urlTab]);


  // Filter States
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(() => formatDateToYYYYMMDD(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return formatDateToYYYYMMDD(d);
  });
  const [customEndDate, setCustomEndDate] = useState(() => formatDateToYYYYMMDD(new Date()));
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [expandedAgentId, setExpandedAgentId] = useState(null);
  const [showActiveDaysOnly, setShowActiveDaysOnly] = useState(true);

  // Data States
  const [agents, setAgents] = useState([]);
  const [reportsData, setReportsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Validate custom date range
  const customDateError = useMemo(() => {
    if (reportType !== 'custom') return null;
    if (!customStartDate || !customEndDate) return 'Please select both start and end dates.';
    if (customStartDate > customEndDate) return 'Start date cannot be after end date.';
    return null;
  }, [reportType, customStartDate, customEndDate]);

  const customRangeSpanDays = useMemo(() => {
    if (reportType !== 'custom' || !customStartDate || !customEndDate || customStartDate > customEndDate) return 0;
    const [sy, sm, sd] = customStartDate.split('-').map(Number);
    const [ey, em, ed] = customEndDate.split('-').map(Number);
    return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
  }, [reportType, customStartDate, customEndDate]);

  const isCustomRangeOverCap = customRangeSpanDays > 366;

  // Compute active date range based on report type and selected values
  const activeRange = useMemo(() => {
    if (reportType === 'daily') {
      return getDailyRange(selectedDate);
    } else if (reportType === 'weekly') {
      return getWeeklyRange(selectedDate);
    } else if (reportType === 'monthly') {
      return getMonthlyRange(selectedMonth);
    } else if (reportType === 'custom') {
      if (customDateError) return {};
      return {
        startDate: customStartDate || '',
        endDate: customEndDate || ''
      };
    }
    return {};
  }, [reportType, selectedDate, selectedMonth, customStartDate, customEndDate, customDateError]);

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

  // Handle role selection change
  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    setSelectedRole(newRole);
    if (selectedAgentId) {
      const currentAgent = agents.find((a) => a._id === selectedAgentId);
      if (currentAgent && newRole && (currentAgent.agentRole || '').toLowerCase() !== newRole.toLowerCase()) {
        setSelectedAgentId('');
      }
    }
  };

  // Filter agents available in dropdown by selected role
  const filteredAgentsForDropdown = useMemo(() => {
    if (!selectedRole) return agents;
    return agents.filter((a) => (a.agentRole || '').toLowerCase() === selectedRole.toLowerCase());
  }, [agents, selectedRole]);

  // Fetch Report Data from real CRM backend
  const fetchReports = useCallback(async () => {
    if (reportType === 'custom' && customDateError) {
      setReportsData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (activeRange.startDate) params.startDate = activeRange.startDate;
      if (activeRange.endDate) params.endDate = activeRange.endDate;
      if (selectedAgentId) params.agentId = selectedAgentId;
      if (selectedRole) params.role = selectedRole;

      const data = await getAdminReports(params);
      setReportsData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  }, [reportType, customDateError, activeRange, selectedAgentId, selectedRole]);

  // When filters change, auto update report
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Active filter text label helper
  const activePeriodLabel = useMemo(() => {
    const eff = reportsData?.effectiveRange;
    if (eff?.startDate && eff?.endDate) {
      if (eff.startDate === eff.endDate) return formatDate(eff.startDate);
      return `${formatDate(eff.startDate)} — ${formatDate(eff.endDate)}`;
    }
    if (!activeRange.startDate || !activeRange.endDate) return 'All Time';
    if (activeRange.startDate === activeRange.endDate) {
      return formatDate(activeRange.startDate);
    }
    return `${formatDate(activeRange.startDate)} — ${formatDate(activeRange.endDate)}`;
  }, [reportsData?.effectiveRange, activeRange]);

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
    rows.push(['Selected Role', selectedRole || 'All Roles']);
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
    rows.push(['Walk-ins Conducted', walkInsCount]);
    if (reportsData.summary?.walkInsScheduled !== undefined) {
      rows.push(['Walk-ins Planned', reportsData.summary.walkInsScheduled]);
    }
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

      if (reportsData?.unassignedActivities?.hasUnassigned) {
        const u = reportsData.unassignedActivities;
        rows.push([
          'Unassigned / Other Activity',
          'Unassigned / System / Admin',
          u.callsLogged,
          u.walkIns,
          u.demosScheduled,
          u.demosCompleted,
          u.demosNotDone,
          u.followUpsScheduled,
          u.followUpsCompleted,
          u.wonLeads,
          u.lostLeads
        ]);
      }

      const totCalls = agentPerformance.reduce((acc, a) => acc + a.callsLogged, 0) + (reportsData?.unassignedActivities?.callsLogged || 0);
      const totWalkIns = agentPerformance.reduce((acc, a) => acc + a.walkIns, 0) + (reportsData?.unassignedActivities?.walkIns || 0);
      const totDemosSched = agentPerformance.reduce((acc, a) => acc + a.demosScheduled, 0) + (reportsData?.unassignedActivities?.demosScheduled || 0);
      const totDemosComp = agentPerformance.reduce((acc, a) => acc + a.demosCompleted, 0) + (reportsData?.unassignedActivities?.demosCompleted || 0);
      const totDemosNotDone = agentPerformance.reduce((acc, a) => acc + a.demosNotDone, 0) + (reportsData?.unassignedActivities?.demosNotDone || 0);
      const totFuSched = agentPerformance.reduce((acc, a) => acc + a.followUpsScheduled, 0) + (reportsData?.unassignedActivities?.followUpsScheduled || 0);
      const totFuComp = agentPerformance.reduce((acc, a) => acc + a.followUpsCompleted, 0) + (reportsData?.unassignedActivities?.followUpsCompleted || 0);
      const totWon = agentPerformance.reduce((acc, a) => acc + a.wonLeads, 0) + (reportsData?.unassignedActivities?.wonLeads || 0);
      const totLost = agentPerformance.reduce((acc, a) => acc + a.lostLeads, 0) + (reportsData?.unassignedActivities?.lostLeads || 0);

      rows.push([
        'TOTAL (Reconciled)',
        '',
        totCalls,
        totWalkIns,
        totDemosSched,
        totDemosComp,
        totDemosNotDone,
        totFuSched,
        totFuComp,
        totWon,
        totLost
      ]);
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
        {activeReportTab === 'general' && (
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
        )}
      </Box>

      {/* Report Section Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeReportTab}
          onChange={(_, val) => {
            setActiveReportTab(val);
            navigate(`/reports?tab=${val}`, { replace: true });
          }}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            id="tab-daily-activity-report"
            value="daily"
            label="Daily Activity Report"
            icon={<EventNote fontSize="small" />}
            iconPosition="start"
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: 14 }}
          />
          <Tab
            id="tab-hospital-activities"
            value="activities"
            label="Hospital Demos & Walk-ins"
            icon={<DirectionsWalk fontSize="small" />}
            iconPosition="start"
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: 14 }}
          />
          <Tab
            id="tab-pipeline-trends"
            value="general"
            label="Pipeline & Activity Trends"
            icon={<Assessment fontSize="small" />}
            iconPosition="start"
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: 14 }}
          />
        </Tabs>
      </Box>

      {/* 1. Dedicated Daily Activity Report */}
      {activeReportTab === 'daily' && (
        <DailyActivityReportSection
          selectedAgentId={selectedAgentId}
          selectedRole={selectedRole}
          agents={agents}
        />
      )}

      {/* 2. Dedicated Demo & Walk-in Hospital Activity List */}
      {activeReportTab === 'activities' && (
        <HospitalActivityReportSection
          initialActivityType={urlActivityType}
          initialStatus={urlStatus}
          initialAgentId={urlAgentId}
          agents={agents}
        />
      )}


      {/* 2. General Step 1 & Step 2 Reports */}
      {activeReportTab === 'general' && (
        <>
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
          {/* 1. Report Type: Daily, Weekly, Monthly, Custom */}
          <Grid item xs={12} sm={6} md={reportType === 'custom' ? 2 : 2.5}>
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
                <MenuItem value="custom">Custom Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* 2. Date Selector (Context-Sensitive) */}
          {reportType === 'custom' ? (
            <>
              <Grid item xs={6} sm={3} md={2.5}>
                <CalendarDatePicker
                  fullWidth
                  size="small"
                  label="Start Date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  error={Boolean(customDateError)}
                  helperText={customDateError}
                />
              </Grid>
              <Grid item xs={6} sm={3} md={2.5}>
                <CalendarDatePicker
                  fullWidth
                  size="small"
                  label="End Date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  error={Boolean(customDateError)}
                />
              </Grid>
            </>
          ) : (
            <Grid item xs={12} sm={6} md={3.5}>
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
                <CalendarDatePicker
                  fullWidth
                  size="small"
                  label={reportType === 'weekly' ? 'Select Week (Date)' : 'Select Date'}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              )}
            </Grid>
          )}

          {/* 3. Role Selector */}
          <Grid item xs={12} sm={6} md={reportType === 'custom' ? 2.5 : 3}>
            <FormControl fullWidth size="small">
              <InputLabel id="role-select-label">Role</InputLabel>
              <Select
                labelId="role-select-label"
                id="role-select"
                value={selectedRole}
                label="Role"
                onChange={handleRoleChange}
              >
                <MenuItem value="">
                  <em>All Roles</em>
                </MenuItem>
                <MenuItem value="Calling Agent">Calling Agent</MenuItem>
                <MenuItem value="Sales Agent">Sales Agent</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* 4. Agent Selector with "All Agents" */}
          <Grid item xs={12} sm={6} md={reportType === 'custom' ? 2.5 : 3}>
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
                  <em>{selectedRole ? `All ${selectedRole}s` : 'All Agents'}</em>
                </MenuItem>
                {filteredAgentsForDropdown.map((agent) => (
                  <MenuItem key={agent._id} value={agent._id}>
                    {agent.fullName || agent.username}
                    {agent.agentRole ? ` (${agent.agentRole})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Validation Error & Cap Warning Alerts */}
        {reportType === 'custom' && customDateError && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
            <strong>Invalid Date Range:</strong> {customDateError}. Please choose an end date that is on or after the start date.
          </Alert>
        )}

        {reportType === 'custom' && !customDateError && isCustomRangeOverCap && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
            <strong>366-Day Limit:</strong> Selected range spans {customRangeSpanDays} days. Daily breakdown and activity totals are capped to the most recent 366 days ending at {customEndDate ? formatDate(customEndDate) : 'end date'}{reportsData?.effectiveRange?.startDate ? ` (Effective range: ${formatDate(reportsData.effectiveRange.startDate)} — ${formatDate(reportsData.effectiveRange.endDate)})` : ''}.
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Active Filter Context Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
          <Chip
            size="small"
            icon={<CalendarMonth sx={{ fontSize: '16px !important' }} />}
            label={`${reportType.toUpperCase()}: ${activePeriodLabel}`}
            sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
          />
          {reportsData?.effectiveRange?.isCapped && (
            <Chip
              size="small"
              color="warning"
              label={`Capped to 366 days (${formatDate(reportsData.effectiveRange.startDate)} — ${formatDate(reportsData.effectiveRange.endDate)})`}
              sx={{ fontWeight: 600 }}
            />
          )}
          {selectedRole && (
            <Chip
              size="small"
              icon={selectedRole === 'Calling Agent' ? <PhoneInTalk sx={{ fontSize: '14px !important' }} /> : <BusinessCenter sx={{ fontSize: '14px !important' }} />}
              label={`Role: ${selectedRole}`}
              onDelete={() => setSelectedRole('')}
              sx={{
                fontWeight: 600,
                bgcolor: selectedRole === 'Calling Agent' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(124, 58, 237, 0.08)',
                color: selectedRole === 'Calling Agent' ? '#1d4ed8' : '#6d28d9'
              }}
            />
          )}
          <Chip
            size="small"
            icon={<Person sx={{ fontSize: '16px !important' }} />}
            label={`Agent: ${activeAgentName}`}
            variant="outlined"
            onDelete={selectedAgentId ? () => setSelectedAgentId('') : undefined}
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

      {/* Custom Date Range Error Display */}
      {reportType === 'custom' && customDateError && (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            my: 3,
            textAlign: 'center',
            borderRadius: 2.5,
            border: '1px dashed',
            borderColor: 'error.main',
            bgcolor: '#fef2f2'
          }}
        >
          <Typography variant="subtitle1" color="error.main" fontWeight={700}>
            {customDateError}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The report request was blocked because the start date is after the end date. Please update your date selection above.
          </Typography>
        </Paper>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Dynamic Report Content */}
      {reportsData && (
        <>
          {/* Primary Activity Metrics: Total Calls, Total Demos, Total Walk-ins */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                Activity Reports
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Action activity records in selected period ({activePeriodLabel})
              </Typography>
            </Box>
            <Grid container spacing={2.5}>
              {/* 1. Total Calls */}
              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: '#ffffff',
                    borderTop: '4px solid #2563eb',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.06)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(37, 99, 235, 0.12)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
                        Total Calls
                      </Typography>
                      <Typography variant="h3" fontWeight={800} sx={{ mt: 0.5, color: '#1e3a8a' }}>
                        {callsCount}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                      <PhoneInTalk fontSize="medium" />
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />
                  <Stack direction="row" spacing={1} justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">
                      Follow-ups Sched: <Box component="span" fontWeight={700} color="#0f172a">{followUpsScheduled}</Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Completed: <Box component="span" fontWeight={700} color="#059669">{followUpsCompleted}</Box>
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>

              {/* 2. Total Demos */}
              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: '#ffffff',
                    borderTop: '4px solid #d97706',
                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.06)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(217, 119, 6, 0.12)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
                        Total Demos
                      </Typography>
                      <Typography variant="h3" fontWeight={800} sx={{ mt: 0.5, color: '#92400e' }}>
                        {demosCount}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
                      <LaptopMac fontSize="medium" />
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />
                  <Stack direction="row" spacing={1} justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">
                      Completed: <Box component="span" fontWeight={700} color="#059669">{completedDemos}</Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Not Done: <Box component="span" fontWeight={700} color="#e11d48">{demosNotDone}</Box>
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>

              {/* 3. Total Walk-ins */}
              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: '#ffffff',
                    borderTop: '4px solid #7c3aed',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.06)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.12)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
                        Total Walk-ins
                      </Typography>
                      <Typography variant="h3" fontWeight={800} sx={{ mt: 0.5, color: '#5b21b6' }}>
                        {walkInsCount}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
                      <DirectionsWalk fontSize="medium" />
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />
                  <Stack direction="row" spacing={1} justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">
                      Conducted: <Box component="span" fontWeight={700} color="#059669">{walkInsCount}</Box>
                    </Typography>
                    {reportsData?.summary?.walkInsScheduled !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        Planned: <Box component="span" fontWeight={700} color="#6b7280">{reportsData.summary.walkInsScheduled}</Box>
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Box>

          {/* Pipeline Conversion Cards */}
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
                  Created in selected {reportType} period
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

          {/* Operational Follow-ups & Demo Status */}
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
              Action Status & Follow-up Breakdown
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4} md={2.4}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#4f46e5', mb: 0.5 }}>
                    <EventNote fontSize="small" />
                    <Typography variant="body2" fontWeight={600} noWrap>Scheduled</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{followUpsScheduled}</Typography>
                  <Typography variant="caption" color="text.secondary">Follow-ups set</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={4} md={2.4}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#0d9488', mb: 0.5 }}>
                    <TaskAlt fontSize="small" />
                    <Typography variant="body2" fontWeight={600} noWrap>Completed</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{followUpsCompleted}</Typography>
                  <Typography variant="caption" color="text.secondary">Follow-ups done</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={4} md={2.4}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ea580c', mb: 0.5 }}>
                    <Warning fontSize="small" />
                    <Typography variant="body2" fontWeight={600} noWrap>Overdue</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{overdueFollowups}</Typography>
                  <Typography variant="caption" color="text.secondary">Pending action</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={6} md={2.4}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#059669', mb: 0.5 }}>
                    <EmojiEvents fontSize="small" />
                    <Typography variant="body2" fontWeight={600} noWrap>Demos Done</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{completedDemos}</Typography>
                  <Typography variant="caption" color="text.secondary">Successfully pitched</Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={6} md={2.4}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#e11d48', mb: 0.5 }}>
                    <EventBusy fontSize="small" />
                    <Typography variant="body2" fontWeight={600} noWrap>Demos Not Done</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="#0f172a">{demosNotDone}</Typography>
                  <Typography variant="caption" color="text.secondary">Missed or cancelled</Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Step 2: Agent-Wise Performance Section */}
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
            {/* Section Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Agent-Wise Performance Reports
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Activity totals and daily breakdown by agent for the selected period ({activePeriodLabel})
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                {selectedRole && (
                  <Chip
                    size="small"
                    label={`Filtered: ${selectedRole}`}
                    onDelete={() => setSelectedRole('')}
                    sx={{ fontWeight: 600, bgcolor: selectedRole === 'Calling Agent' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(124, 58, 237, 0.08)', color: selectedRole === 'Calling Agent' ? '#1d4ed8' : '#6d28d9' }}
                  />
                )}
                <Chip
                  size="small"
                  label={
                    selectedAgentId
                      ? '1 Selected Agent'
                      : `${agentPerformance.length} Active Agent${agentPerformance.length === 1 ? '' : 's'}`
                  }
                  sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
                />
              </Stack>
            </Box>

            {/* Individual Agent Scoped Banner */}
            {selectedAgentId && (
              <Alert
                severity="info"
                sx={{ mb: 2.5, borderRadius: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => setSelectedAgentId('')} sx={{ textTransform: 'none', fontWeight: 600 }}>
                    View All Agents
                  </Button>
                }
              >
                Viewing individual report for <strong>{activeAgentName}</strong>. Summary KPI metrics, daily breakdown, and charts are currently scoped to this agent.
              </Alert>
            )}

            <TableContainer sx={{ width: '100%', overflowX: 'auto', borderRadius: 2, border: '1px solid #f1f5f9' }}>
              <Table size="small" sx={{ minWidth: 1040 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ width: 44, p: 0.5 }} />
                    <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Agent Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Agent Role</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#2563eb' }}>Calls Made</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#d97706' }}>Demos Conducted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#7c3aed' }}>Walk-ins Conducted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#4f46e5' }}>Follow-ups</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#10b981' }}>Won / Lost</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Scope Report</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agentPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No agents found matching the selected role or filter criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agentPerformance.map((agent) => {
                      const isExpanded = expandedAgentId === agent.agentId;
                      const isCalling = (agent.agentRole || '').toLowerCase().includes('calling');
                      const isSales = (agent.agentRole || '').toLowerCase().includes('sales');

                      return (
                        <React.Fragment key={agent.agentId}>
                          <TableRow hover sx={{ '& > *': { borderBottom: isExpanded ? 'none !important' : undefined }, bgcolor: isExpanded ? '#fafafa' : undefined }}>
                            <TableCell sx={{ p: 0.5, textAlign: 'center' }}>
                              <Tooltip title={isExpanded ? "Hide daily breakdown" : "Show daily breakdown"}>
                                <IconButton
                                  size="small"
                                  onClick={() => setExpandedAgentId(isExpanded ? null : agent.agentId)}
                                  sx={{ transition: 'transform 0.2s' }}
                                >
                                  {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </TableCell>

                            {/* Agent Details */}
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                <Avatar
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    bgcolor: isCalling ? 'rgba(37, 99, 235, 0.1)' : 'rgba(124, 58, 237, 0.1)',
                                    color: isCalling ? '#2563eb' : '#7c3aed'
                                  }}
                                >
                                  {(agent.agentName || 'A').charAt(0).toUpperCase()}
                                </Avatar>
                                <Box>
                                  <Typography variant="body2" fontWeight={600} color="text.primary">
                                    {agent.agentName}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, display: 'block' }}>
                                    ID: {agent.agentId ? String(agent.agentId).slice(-6) : ''}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>

                            {/* Distinctive Agent Role Badge */}
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {isCalling ? (
                                <Chip
                                  size="small"
                                  icon={<PhoneInTalk sx={{ fontSize: '13px !important' }} />}
                                  label="Calling Agent"
                                  sx={{
                                    bgcolor: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                    fontWeight: 600,
                                    fontSize: 11
                                  }}
                                />
                              ) : isSales ? (
                                <Chip
                                  size="small"
                                  icon={<BusinessCenter sx={{ fontSize: '13px !important' }} />}
                                  label="Sales Agent"
                                  sx={{
                                    bgcolor: '#f5f3ff',
                                    color: '#6d28d9',
                                    border: '1px solid #ddd6fe',
                                    fontWeight: 600,
                                    fontSize: 11
                                  }}
                                />
                              ) : (
                                <Chip
                                  size="small"
                                  label={agent.agentRole || 'Agent'}
                                  variant="outlined"
                                  sx={{ fontWeight: 600, fontSize: 11 }}
                                />
                              )}
                            </TableCell>

                            {/* Calls Made */}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" fontWeight={700} color="#2563eb">
                                {agent.callsLogged}
                              </Typography>
                            </TableCell>

                            {/* Demos Conducted */}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" fontWeight={700} color="#d97706">
                                {agent.demosScheduled}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>
                                Done: {agent.demosCompleted} | Missed: {agent.demosNotDone}
                              </Typography>
                            </TableCell>

                            {/* Walk-ins Conducted */}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" fontWeight={700} color="#7c3aed">
                                {agent.walkIns}
                              </Typography>
                            </TableCell>

                            {/* Follow-ups */}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" fontWeight={600} color="#4f46e5">
                                {agent.followUpsScheduled} Sched
                              </Typography>
                              <Typography variant="caption" color="#0d9488" sx={{ display: 'block', fontSize: 10 }}>
                                {agent.followUpsCompleted} Done
                              </Typography>
                            </TableCell>

                            {/* Won / Lost */}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" fontWeight={700} color="#10b981">
                                {agent.wonLeads} Won
                              </Typography>
                              <Typography variant="caption" color="#ef4444" sx={{ display: 'block', fontSize: 10 }}>
                                {agent.lostLeads} Lost
                              </Typography>
                            </TableCell>

                            {/* Action: Scope Full Report */}
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                              <Tooltip title={selectedAgentId === agent.agentId ? "Clear agent filter and view all agents" : `Scope entire report to ${agent.agentName}`}>
                                <Button
                                  size="small"
                                  variant={selectedAgentId === agent.agentId ? "contained" : "outlined"}
                                  color={selectedAgentId === agent.agentId ? "primary" : "inherit"}
                                  onClick={() => setSelectedAgentId(selectedAgentId === agent.agentId ? '' : agent.agentId)}
                                  startIcon={<Visibility sx={{ fontSize: '13px !important' }} />}
                                  sx={{
                                    textTransform: 'none',
                                    py: 0.25,
                                    px: 1,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    borderRadius: 1.5
                                  }}
                                >
                                  {selectedAgentId === agent.agentId ? "Selected" : "View Report"}
                                </Button>
                              </Tooltip>
                            </TableCell>
                          </TableRow>

                          {/* Expandable Daily Breakdown Nested Table */}
                          <TableRow sx={{ bgcolor: '#fafafa' }}>
                            <TableCell colSpan={9} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ py: 2, px: 3, bgcolor: '#f8fafc', borderTop: '1px dashed #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                                    <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                                      Daily Activity Breakdown — {agent.agentName} ({agent.agentRole})
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Attributed actions logged on each calendar date in IST ({activePeriodLabel})
                                    </Typography>
                                  </Box>

                                  <Table size="small" sx={{ bgcolor: '#ffffff', borderRadius: 1.5, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    <TableHead>
                                      <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                                        <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Date (IST)</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#2563eb' }}>Calls Logged</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#d97706' }}>Demos Scheduled</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#059669' }}>Demos Completed</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#e11d48' }}>Demos Not Done</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#7c3aed' }}>Walk-ins Conducted</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {(() => {
                                        const breakdown = agent.dailyBreakdown || [];
                                        const activeDays = breakdown.filter(d => d.callsLogged > 0 || d.walkIns > 0 || d.demosScheduled > 0);
                                        const displayList = activeDays.length > 0 ? activeDays : breakdown.slice(-7);

                                        if (displayList.length === 0) {
                                          return (
                                            <TableRow>
                                              <TableCell colSpan={6} align="center" sx={{ py: 2, color: 'text.secondary', fontSize: 12 }}>
                                                No activity recorded by this agent in the selected date range.
                                              </TableCell>
                                            </TableRow>
                                          );
                                        }

                                        return displayList.map((day) => (
                                          <TableRow key={day.date} hover>
                                            <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{formatDate(day.date)}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{day.callsLogged}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>{day.demosScheduled}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>{day.demosCompleted}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#e11d48' }}>{day.demosNotDone}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{day.walkIns}</TableCell>
                                          </TableRow>
                                        ));
                                      })()}
                                    </TableBody>
                                  </Table>
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })
                  )}

                  {/* Explicit Unassigned / Other Activity Row */}
                  {reportsData?.unassignedActivities?.hasUnassigned && (
                    <React.Fragment>
                      <TableRow hover sx={{ bgcolor: '#fffbeb', borderTop: '1px dashed #fde68a' }}>
                        <TableCell sx={{ p: 0.5, textAlign: 'center' }}>
                          <Tooltip title="Show daily breakdown of unassigned activity">
                            <IconButton
                              size="small"
                              onClick={() => setExpandedAgentId(expandedAgentId === 'unassigned' ? null : 'unassigned')}
                            >
                              {expandedAgentId === 'unassigned' ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: '#fef3c7', color: '#b45309' }}>
                              <HelpOutline fontSize="small" />
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600} color="#92400e">
                                Unassigned / Other Activity
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                                Admin or system activity without active agent assignment
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Chip
                            size="small"
                            label="Unassigned / Admin"
                            sx={{ bgcolor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 600, fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#2563eb' }}>
                          {reportsData.unassignedActivities.callsLogged}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706' }}>
                          {reportsData.unassignedActivities.demosScheduled}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>
                            Done: {reportsData.unassignedActivities.demosCompleted} | Missed: {reportsData.unassignedActivities.demosNotDone}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#7c3aed' }}>
                          {reportsData.unassignedActivities.walkIns}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', fontSize: 11 }}>
                          —
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', fontSize: 11 }}>
                          —
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" label="Non-agent" variant="outlined" sx={{ fontSize: 10 }} />
                        </TableCell>
                      </TableRow>

                      {/* Unassigned Daily Breakdown Row */}
                      <TableRow sx={{ bgcolor: '#fffdf5' }}>
                        <TableCell colSpan={9} sx={{ p: 0, borderBottom: expandedAgentId === 'unassigned' ? '1px solid #fde68a' : 'none' }}>
                          <Collapse in={expandedAgentId === 'unassigned'} timeout="auto" unmountOnExit>
                            <Box sx={{ py: 2, px: 3, bgcolor: '#fefce8', borderTop: '1px dashed #fde68a', borderBottom: '1px solid #fde68a' }}>
                              <Typography variant="subtitle2" fontWeight={700} color="#92400e" sx={{ mb: 1 }}>
                                Daily Breakdown of Unassigned Activities ({activePeriodLabel})
                              </Typography>
                              <Table size="small" sx={{ bgcolor: '#ffffff', borderRadius: 1.5, overflow: 'hidden', border: '1px solid #fde68a' }}>
                                <TableHead>
                                  <TableRow sx={{ bgcolor: '#fef9c3' }}>
                                    <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Date (IST)</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#2563eb' }}>Unassigned Calls</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#d97706' }}>Unassigned Demos</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#7c3aed' }}>Unassigned Walk-ins</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {(reportsData.unassignedActivities.dailyBreakdown || [])
                                    .filter(d => d.callsLogged > 0 || d.walkIns > 0 || d.demosScheduled > 0)
                                    .map(day => (
                                      <TableRow key={day.date}>
                                        <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{formatDate(day.date)}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{day.callsLogged}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>{day.demosScheduled}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{day.walkIns}</TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  )}
                </TableBody>

                {/* Table Footer: Exact Totals and Reconciliation with KPI Summary */}
                {agentPerformance.length > 0 && (
                  <TableFooter>
                    <TableRow sx={{ bgcolor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <TableCell />
                      <TableCell sx={{ fontWeight: 800, fontSize: 13, color: 'text.primary' }}>
                        Reconciled Totals
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Chip
                          size="small"
                          icon={<CheckCircle sx={{ fontSize: '13px !important' }} />}
                          label="Reconciled with KPI"
                          color="success"
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13, color: '#2563eb' }}>
                        {agentPerformance.reduce((acc, a) => acc + a.callsLogged, 0) + (reportsData?.unassignedActivities?.callsLogged || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13, color: '#d97706' }}>
                        {agentPerformance.reduce((acc, a) => acc + a.demosScheduled, 0) + (reportsData?.unassignedActivities?.demosScheduled || 0)}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, fontWeight: 500 }}>
                          Done: {agentPerformance.reduce((acc, a) => acc + a.demosCompleted, 0) + (reportsData?.unassignedActivities?.demosCompleted || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13, color: '#7c3aed' }}>
                        {agentPerformance.reduce((acc, a) => acc + a.walkIns, 0) + (reportsData?.unassignedActivities?.walkIns || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13, color: '#4f46e5' }}>
                        {agentPerformance.reduce((acc, a) => acc + a.followUpsScheduled, 0) + (reportsData?.unassignedActivities?.followUpsScheduled || 0)}
                        <Typography variant="caption" color="#0d9488" sx={{ display: 'block', fontSize: 10, fontWeight: 500 }}>
                          {agentPerformance.reduce((acc, a) => acc + a.followUpsCompleted, 0) + (reportsData?.unassignedActivities?.followUpsCompleted || 0)} Done
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13, color: '#10b981' }}>
                        {agentPerformance.reduce((acc, a) => acc + a.wonLeads, 0) + (reportsData?.unassignedActivities?.wonLeads || 0)}
                        <Typography variant="caption" color="#ef4444" sx={{ display: 'block', fontSize: 10, fontWeight: 500 }}>
                          {agentPerformance.reduce((acc, a) => acc + a.lostLeads, 0) + (reportsData?.unassignedActivities?.lostLeads || 0)} Lost
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 600 }}>
                          {agentPerformance.length} Agents
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {reportsData?.effectiveRange?.isCapped && (
                  <Chip
                    size="small"
                    color="warning"
                    label="Limited to 366 days"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                <Chip
                  size="small"
                  label={`${dateWiseReport.length} Date${dateWiseReport.length === 1 ? '' : 's'}`}
                  sx={{ fontWeight: 600, bgcolor: 'rgba(234, 88, 12, 0.08)', color: 'primary.main' }}
                />
              </Box>
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
        </>
      )}
    </Box>
  );
}
