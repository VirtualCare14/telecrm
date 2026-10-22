import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Pagination, Tooltip, Stack, Alert, CircularProgress,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, Card, CardContent,
  IconButton, ToggleButtonGroup, ToggleButton, Avatar, TablePagination
} from '@mui/material';
import {
  FileDownload, Refresh, Business, CheckCircle, Schedule,
  Warning, LaptopMac, DirectionsWalk, Cancel, Search,
  CalendarMonth, Today, DateRange, FilterList, OpenInNew,
  LocationOn, LocationOff, CheckCircleOutline, Clear,
  Person, EventNote, Map, Visibility
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getActivityHospitals, downloadActivityHospitalsExport } from '../services/dashboardService';
import { getAgents } from '../services/agentService';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getYesterdayIST() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = todayStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

function getCurrentMonthIST() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m] = todayStr.split('-');
  return `${y}-${m}`;
}

function getPreviousMonthIST() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m] = todayStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${py}-${pm}`;
}

export default function HospitalActivityReportSection({
  initialActivityType = 'ALL',
  initialStatus = 'ALL',
  initialAgentId = '',
  agents: propAgents = []
}) {
  const navigate = useNavigate();

  // 1. Filter States
  const [dateMode, setDateMode] = useState('single'); // 'single' | 'month' | 'custom'
  const [singleDate, setSingleDate] = useState(() => getTodayIST());
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthIST());
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  });
  const [customEndDate, setCustomEndDate] = useState(() => getTodayIST());

  const [activityType, setActivityType] = useState(initialActivityType); // 'ALL' | 'DEMO' | 'WALKIN'
  const [statusFilter, setStatusFilter] = useState(initialStatus); // 'ALL' | 'Scheduled' | 'Completed' | 'Not Done'
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgentId);
  const [selectedRole, setSelectedRole] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // 2. Data States
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState({ xlsx: false, csv: false });
  const [agentsList, setAgentsList] = useState(propAgents);

  // Load Agents
  useEffect(() => {
    if (propAgents && propAgents.length > 0) {
      setAgentsList(propAgents);
    } else {
      getAgents().then((res) => {
        const list = Array.isArray(res) ? res : (res?.agents || []);
        setAgentsList(list);
      }).catch(() => {});
    }
  }, [propAgents]);

  // Validation
  const customRangeError = useMemo(() => {
    if (dateMode !== 'custom') return null;
    if (!customStartDate || !customEndDate) return 'Please select both start and end dates.';
    if (customStartDate > customEndDate) return 'Start date cannot be after end date.';
    return null;
  }, [dateMode, customStartDate, customEndDate]);

  // Build query params
  const buildQueryParams = useCallback(() => {
    const params = {
      dateMode,
      activityType,
      status: statusFilter,
      page,
      limit,
    };

    if (dateMode === 'single') {
      params.date = singleDate || getTodayIST();
    } else if (dateMode === 'month') {
      params.month = selectedMonth || getCurrentMonthIST();
    } else if (dateMode === 'custom') {
      params.startDate = customStartDate;
      params.endDate = customEndDate;
    }

    if (selectedAgentId) params.agentId = selectedAgentId;
    if (selectedRole && selectedRole !== 'all') params.role = selectedRole;
    if (search.trim()) params.search = search.trim();

    return params;
  }, [dateMode, singleDate, selectedMonth, customStartDate, customEndDate, activityType, statusFilter, selectedAgentId, selectedRole, search, page, limit]);

  // Fetch report data
  const fetchData = useCallback(async () => {
    if (dateMode === 'custom' && customRangeError) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = buildQueryParams();
      const res = await getActivityHospitals(params);
      setData(res);
    } catch (err) {
      console.error('Failed to fetch hospital activities:', err);
      setError(err.response?.data?.message || 'Failed to load hospital activity records');
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, dateMode, customRangeError]);

  // Auto-refresh when filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers for filter controls
  const handleDateModeChange = (_, newMode) => {
    if (newMode) {
      setDateMode(newMode);
      setPage(1);
    }
  };

  const handleActivityTypeChange = (newType) => {
    setActivityType(newType);
    setPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleAgentChange = (newAgentId) => {
    setSelectedAgentId(newAgentId);
    setPage(1);
  };

  const handleRoleChange = (newRole) => {
    setSelectedRole(newRole);
    if (selectedAgentId) {
      const currentAgent = agentsList.find(a => (a._id || a.id) === selectedAgentId);
      if (currentAgent && newRole !== 'all' && currentAgent.agentRole?.toLowerCase() !== newRole.toLowerCase()) {
        setSelectedAgentId('');
      }
    }
    setPage(1);
  };

  const handleResetFilters = () => {
    setDateMode('single');
    setSingleDate(getTodayIST());
    setSelectedMonth(getCurrentMonthIST());
    setCustomStartDate(getYesterdayIST());
    setCustomEndDate(getTodayIST());
    setActivityType('ALL');
    setStatusFilter('ALL');
    setSelectedAgentId('');
    setSelectedRole('all');
    setSearch('');
    setPage(1);
  };

  // Export handler
  const handleExport = async (format = 'xlsx') => {
    setExportLoading(prev => ({ ...prev, [format]: true }));
    try {
      const params = buildQueryParams();
      const res = await downloadActivityHospitalsExport(params, format);
      const mime = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([res.data], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `hospital_activities_${data?.filter?.startDate || 'export'}_to_${data?.filter?.endDate || 'export'}.${format}`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to export ${format}:`, err);
    } finally {
      setExportLoading(prev => ({ ...prev, [format]: false }));
    }
  };

  // Filter agents dropdown by role
  const filteredAgents = useMemo(() => {
    if (!selectedRole || selectedRole === 'all') return agentsList;
    return agentsList.filter(a => (a.agentRole || '').toLowerCase() === selectedRole.toLowerCase());
  }, [agentsList, selectedRole]);

  const summary = data?.summary || {};
  const activities = data?.activities || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, totalRecords: 0 };

  return (
    <Box>
      {/* 1. Header Toolbar & Quick Filters */}
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
          <Grid item xs={12} lg={8}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              {/* Date Mode Toggle */}
              <ToggleButtonGroup
                id="activity-date-mode-toggle"
                value={dateMode}
                exclusive
                onChange={handleDateModeChange}
                size="small"
                sx={{
                  bgcolor: '#f8fafc',
                  '& .MuiToggleButton-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 2,
                  },
                  '& .Mui-selected': {
                    bgcolor: 'primary.main !important',
                    color: '#ffffff !important',
                  }
                }}
              >
                <ToggleButton value="single" id="mode-single-date">
                  <Today sx={{ fontSize: 16, mr: 0.5 }} /> Single Date
                </ToggleButton>
                <ToggleButton value="month" id="mode-month">
                  <CalendarMonth sx={{ fontSize: 16, mr: 0.5 }} /> Month
                </ToggleButton>
                <ToggleButton value="custom" id="mode-custom-range">
                  <DateRange sx={{ fontSize: 16, mr: 0.5 }} /> Custom Range
                </ToggleButton>
              </ToggleButtonGroup>

              {/* Dynamic Date Controls based on Mode */}
              {dateMode === 'single' && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    id="single-date-input"
                    type="date"
                    size="small"
                    label="Select Date"
                    value={singleDate}
                    onChange={(e) => { setSingleDate(e.target.value); setPage(1); }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 155 }}
                  />
                  <Button
                    id="shortcut-today"
                    variant={singleDate === getTodayIST() ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => { setSingleDate(getTodayIST()); setPage(1); }}
                    sx={{ textTransform: 'none', borderRadius: 2, fontSize: 12, py: 0.5 }}
                  >
                    Today
                  </Button>
                  <Button
                    id="shortcut-yesterday"
                    variant={singleDate === getYesterdayIST() ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => { setSingleDate(getYesterdayIST()); setPage(1); }}
                    sx={{ textTransform: 'none', borderRadius: 2, fontSize: 12, py: 0.5 }}
                  >
                    Yesterday
                  </Button>
                </Stack>
              )}

              {dateMode === 'month' && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    id="month-input"
                    type="month"
                    size="small"
                    label="Select Month"
                    value={selectedMonth}
                    onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 165 }}
                  />
                  <Button
                    id="shortcut-this-month"
                    variant={selectedMonth === getCurrentMonthIST() ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => { setSelectedMonth(getCurrentMonthIST()); setPage(1); }}
                    sx={{ textTransform: 'none', borderRadius: 2, fontSize: 12, py: 0.5 }}
                  >
                    This Month
                  </Button>
                  <Button
                    id="shortcut-last-month"
                    variant={selectedMonth === getPreviousMonthIST() ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => { setSelectedMonth(getPreviousMonthIST()); setPage(1); }}
                    sx={{ textTransform: 'none', borderRadius: 2, fontSize: 12, py: 0.5 }}
                  >
                    Last Month
                  </Button>
                </Stack>
              )}

              {dateMode === 'custom' && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                  <TextField
                    id="custom-start-date"
                    type="date"
                    size="small"
                    label="Start Date"
                    value={customStartDate}
                    onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                  />
                  <Typography variant="body2" color="text.secondary">to</Typography>
                  <TextField
                    id="custom-end-date"
                    type="date"
                    size="small"
                    label="End Date"
                    value={customEndDate}
                    onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                  />
                </Stack>
              )}
            </Stack>
          </Grid>

          {/* Right Action Buttons */}
          <Grid item xs={12} lg={4} sx={{ textAlign: { xs: 'left', lg: 'right' } }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', lg: 'flex-end' }} flexWrap="wrap" sx={{ gap: 1 }}>
              <Button
                id="refresh-activity-btn"
                variant="outlined"
                size="small"
                startIcon={<Refresh className={loading ? 'animate-spin' : ''} />}
                onClick={fetchData}
                disabled={loading}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Refresh
              </Button>
              <Button
                id="export-activity-xlsx"
                variant="outlined"
                size="small"
                startIcon={exportLoading.xlsx ? <CircularProgress size={16} /> : <FileDownload />}
                onClick={() => handleExport('xlsx')}
                disabled={loading || exportLoading.xlsx || activities.length === 0}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, color: '#047857', borderColor: '#047857', '&:hover': { bgcolor: '#ecfdf5', borderColor: '#047857' } }}
              >
                Excel
              </Button>
              <Button
                id="export-activity-csv"
                variant="outlined"
                size="small"
                startIcon={exportLoading.csv ? <CircularProgress size={16} /> : <FileDownload />}
                onClick={() => handleExport('csv')}
                disabled={loading || exportLoading.csv || activities.length === 0}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, color: '#0284c7', borderColor: '#0284c7', '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' } }}
              >
                CSV
              </Button>
            </Stack>
          </Grid>
        </Grid>

        {/* Custom Range Error */}
        {customRangeError && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
            {customRangeError}
          </Alert>
        )}

        {/* Secondary Filter Controls Row: Activity Type, Status, Role, Agent, Search */}
        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Grid container spacing={1.5} alignItems="center">
            {/* 1. Activity Type */}
            <Grid item xs={12} sm={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="activity-type-label">Activity Type</InputLabel>
                <Select
                  labelId="activity-type-label"
                  id="activity-type-select"
                  value={activityType}
                  label="Activity Type"
                  onChange={(e) => handleActivityTypeChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="ALL">All Activities (Demo & Walk-in)</MenuItem>
                  <MenuItem value="DEMO">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LaptopMac sx={{ fontSize: 16, color: '#6366f1' }} />
                      <span>Demos Only</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="WALKIN">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DirectionsWalk sx={{ fontSize: 16, color: '#059669' }} />
                      <span>Walk-ins Only</span>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 2. Status */}
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  id="status-filter-select"
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => handleStatusChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="ALL">All Statuses</MenuItem>
                  <MenuItem value="Scheduled">Scheduled (Planned)</MenuItem>
                  <MenuItem value="Completed">Completed (Done)</MenuItem>
                  <MenuItem value="Not Done">Not Done / Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 3. Role */}
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="role-filter-label">Agent Role</InputLabel>
                <Select
                  labelId="role-filter-label"
                  id="role-filter-select"
                  value={selectedRole}
                  label="Agent Role"
                  onChange={(e) => handleRoleChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="Sales Agent">Sales Agent</MenuItem>
                  <MenuItem value="Calling Agent">Calling Agent</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 4. Agent */}
            <Grid item xs={12} sm={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="agent-filter-label">Agent</InputLabel>
                <Select
                  labelId="agent-filter-label"
                  id="agent-filter-select"
                  value={selectedAgentId}
                  label="Agent"
                  onChange={(e) => handleAgentChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Agents</MenuItem>
                  {filteredAgents.map((a) => (
                    <MenuItem key={a._id || a.id} value={a._id || a.id}>
                      {a.fullName || a.username} {a.agentRole ? `(${a.agentRole})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* 5. Search Bar */}
            <Grid item xs={12} sm={9} md={2.2}>
              <TextField
                id="activity-search-input"
                fullWidth
                size="small"
                placeholder="Search hospital, ID, remark..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setSearch(''); setPage(1); }}>
                        <Clear fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null
                }}
                sx={{ borderRadius: 2 }}
              />
            </Grid>

            {/* 6. Clear Filters Button */}
            <Grid item xs={12} sm={3} md={0.8}>
              <Tooltip title="Reset all filters">
                <Button
                  id="reset-filters-btn"
                  variant="outlined"
                  size="small"
                  onClick={handleResetFilters}
                  fullWidth
                  sx={{ borderRadius: 2, minWidth: 'auto', py: 0.9, textTransform: 'none', color: 'text.secondary' }}
                >
                  Clear
                </Button>
              </Tooltip>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* 2. Reconciled Dynamic KPI Summary Cards */}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={1.5}>
          {/* Total Activities Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: activityType === 'ALL' && statusFilter === 'ALL' ? 'primary.main' : 'divider',
                bgcolor: '#f8fafc',
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
              }}
              onClick={() => { setActivityType('ALL'); setStatusFilter('ALL'); setPage(1); }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block">
                  TOTAL ACTIVITIES
                </Typography>
                <Typography variant="h5" fontWeight={800} color="#0f172a" sx={{ mt: 0.5 }}>
                  {summary.totalActivities || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  In {data?.filter?.rangeLabel || 'period'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Unique Hospitals Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: '#f0fdf4',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" fontWeight={700} color="#047857" display="block">
                  UNIQUE HOSPITALS
                </Typography>
                <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                  {summary.uniqueHospitals || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Distinct facilities
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Demos Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: activityType === 'DEMO' ? '#6366f1' : 'divider',
                bgcolor: '#faf5ff',
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(99,102,241,0.15)' }
              }}
              onClick={() => { setActivityType('DEMO'); setPage(1); }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={700} color="#6b21a8">
                    DEMOS
                  </Typography>
                  <LaptopMac sx={{ fontSize: 16, color: '#6366f1' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} color="#581c87" sx={{ mt: 0.5 }}>
                  {summary.demosCount || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  {summary.periodTotals ? `${summary.periodTotals.demosScheduled || 0} Sched • ${summary.periodTotals.demosCompleted || 0} Done` : 'Product presentations'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Walk-ins Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: activityType === 'WALKIN' ? '#059669' : 'divider',
                bgcolor: '#f0fdfa',
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(5,150,105,0.15)' }
              }}
              onClick={() => { setActivityType('WALKIN'); setPage(1); }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={700} color="#0f766e">
                    WALK-INS
                  </Typography>
                  <DirectionsWalk sx={{ fontSize: 16, color: '#059669' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} color="#115e59" sx={{ mt: 0.5 }}>
                  {summary.walkInsCount || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  {summary.periodTotals ? `${summary.periodTotals.walkInsScheduled || 0} Sched • ${summary.periodTotals.walkInsCompleted || 0} Done` : 'On-site hospital visits'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Scheduled Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: statusFilter === 'Scheduled' ? '#0284c7' : 'divider',
                bgcolor: '#f0f9ff',
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(2,132,199,0.15)' }
              }}
              onClick={() => { setStatusFilter('Scheduled'); setPage(1); }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={700} color="#0369a1">
                    SCHEDULED
                  </Typography>
                  <Schedule sx={{ fontSize: 16, color: '#0284c7' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} color="#075985" sx={{ mt: 0.5 }}>
                  {summary.scheduledCount || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Planned appointments
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Completed Card */}
          <Grid item xs={6} sm={4} md={2}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: statusFilter === 'Completed' ? '#16a34a' : 'divider',
                bgcolor: '#f0fdf4',
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(22,163,74,0.15)' }
              }}
              onClick={() => { setStatusFilter('Completed'); setPage(1); }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={700} color="#15803d">
                    COMPLETED
                  </Typography>
                  <CheckCircle sx={{ fontSize: 16, color: '#16a34a' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} color="#166534" sx={{ mt: 0.5 }}>
                  {summary.completedCount || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Conducted / Done
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* 3. Hospital Activity Data Table */}
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
        {/* Table Subheader */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Business sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="subtitle2" fontWeight={700} color="text.primary">
              Hospital Activity Records
            </Typography>
            <Chip
              label={`${summary.totalActivities || 0} records`}
              size="small"
              sx={{ height: 22, fontWeight: 700, fontSize: 11, bgcolor: 'rgba(234, 88, 12, 0.1)', color: 'primary.main' }}
            />
            {data?.filter?.rangeLabel && (
              <Chip
                label={data.filter.rangeLabel}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontWeight: 600, fontSize: 11 }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Click on any hospital or lead number to view full lead details
          </Typography>
        </Box>

        {/* Loading Bar */}
        {loading && <Box sx={{ height: 3, bgcolor: 'primary.main', animation: 'pulse 1.5s infinite' }} />}

        {/* Table Data */}
        <TableContainer>
          <Table size="small" id="hospital-activity-table">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 45 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Activity</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Hospital Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Lead ID</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Date & Time (IST)</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Assigned Agent</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Scheduled By</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 220 }}>Remarks / Notes</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Verification</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 80 }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {loading ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={24} />
                        <Typography variant="body2">Loading activity records...</Typography>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <EventNote sx={{ fontSize: 36, color: 'text.disabled' }} />
                        <Typography variant="subtitle1" fontWeight={600}>
                          No activity records found
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          No qualifying demo or walk-in records found for {data?.filter?.rangeLabel || 'this period'}. Try selecting another date or clearing filters.
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={handleResetFilters}
                          sx={{ mt: 1, textTransform: 'none', borderRadius: 2 }}
                        >
                          Clear Filters
                        </Button>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                activities.map((row, idx) => {
                  const serialNumber = (pagination.page - 1) * pagination.limit + idx + 1;
                  const isDemo = row.activityType === 'Demo';

                  return (
                    <TableRow
                      key={row.id || idx}
                      hover
                      sx={{
                        '&:nth-of-type(even)': { bgcolor: '#fafafa' },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {/* 1. Serial # */}
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>
                        {serialNumber}
                      </TableCell>

                      {/* 2. Activity Type */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          icon={isDemo ? <LaptopMac sx={{ fontSize: '14px !important' }} /> : <DirectionsWalk sx={{ fontSize: '14px !important' }} />}
                          label={row.activityType}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 11,
                            height: 22,
                            bgcolor: isDemo ? 'rgba(99, 102, 241, 0.1)' : 'rgba(5, 150, 105, 0.1)',
                            color: isDemo ? '#6366f1' : '#059669',
                            border: `1px solid ${isDemo ? 'rgba(99, 102, 241, 0.3)' : 'rgba(5, 150, 105, 0.3)'}`
                          }}
                        />
                      </TableCell>

                      {/* 3. Hospital Name */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          onClick={() => row.leadId && navigate(`/leads/${row.leadId}`)}
                          sx={{
                            color: row.leadId ? 'primary.main' : 'text.primary',
                            cursor: row.leadId ? 'pointer' : 'default',
                            '&:hover': { textDecoration: row.leadId ? 'underline' : 'none' },
                          }}
                        >
                          {row.hospitalName}
                        </Typography>
                        {row.hospitalAddress && row.hospitalAddress !== 'N/A' && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', maxWidth: 220 }} noWrap title={row.hospitalAddress}>
                            {row.hospitalAddress}
                          </Typography>
                        )}
                      </TableCell>

                      {/* 4. Lead ID */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          label={row.leadNumber || 'N/A'}
                          size="small"
                          variant="outlined"
                          onClick={() => row.leadId && navigate(`/leads/${row.leadId}`)}
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: 11,
                            height: 22,
                            cursor: row.leadId ? 'pointer' : 'default',
                            borderColor: 'divider',
                            bgcolor: '#f1f5f9',
                            '&:hover': { borderColor: 'primary.main' }
                          }}
                        />
                      </TableCell>

                      {/* 5. Date & Time */}
                      <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          {row.activityDateFormatted}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.activityTime !== 'N/A' ? row.activityTime : 'Time not specified'}
                        </Typography>
                      </TableCell>

                      {/* 6. Status */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Chip
                          label={row.status}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 11,
                            height: 22,
                            bgcolor: row.status === 'Completed'
                              ? 'rgba(22, 163, 74, 0.12)'
                              : row.status === 'Not Done'
                                ? 'rgba(220, 38, 38, 0.12)'
                                : 'rgba(2, 132, 199, 0.12)',
                            color: row.status === 'Completed'
                              ? '#15803d'
                              : row.status === 'Not Done'
                                ? '#dc2626'
                                : '#0284c7',
                            border: `1px solid ${
                              row.status === 'Completed'
                                ? 'rgba(22, 163, 74, 0.3)'
                                : row.status === 'Not Done'
                                  ? 'rgba(220, 38, 38, 0.3)'
                                  : 'rgba(2, 132, 199, 0.3)'
                            }`
                          }}
                        />
                      </TableCell>

                      {/* 7. Assigned Agent */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          {row.assignedAgent.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.assignedAgent.role}
                        </Typography>
                      </TableCell>

                      {/* 8. Scheduled By */}
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {row.assignedBy.name}
                      </TableCell>

                      {/* 9. Remarks */}
                      <TableCell sx={{ fontSize: 12 }}>
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{
                            maxWidth: 260,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: 12
                          }}
                          title={row.remarks}
                        >
                          {row.remarks}
                        </Typography>
                      </TableCell>

                      {/* 10. Verification / Location */}
                      <TableCell sx={{ fontSize: 12 }}>
                        {isDemo ? (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        ) : (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Chip
                              icon={row.latitude != null ? <LocationOn sx={{ fontSize: '13px !important' }} /> : <LocationOff sx={{ fontSize: '13px !important' }} />}
                              label={row.locationStatus}
                              size="small"
                              sx={{
                                fontSize: 10,
                                height: 20,
                                fontWeight: 700,
                                bgcolor: row.latitude != null ? 'rgba(16, 185, 129, 0.1)' : '#f1f5f9',
                                color: row.latitude != null ? '#047857' : '#64748b'
                              }}
                            />
                            {row.mapUrl && (
                              <Tooltip title="Open in Google Maps">
                                <IconButton
                                  size="small"
                                  component="a"
                                  href={row.mapUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{ p: 0.25, color: '#2563eb' }}
                                >
                                  <Map sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        )}
                      </TableCell>

                      {/* 11. Action (View Lead) */}
                      <TableCell align="center">
                        {row.leadId ? (
                          <Tooltip title="Open Lead Details">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/leads/${row.leadId}`)}
                              sx={{
                                color: 'primary.main',
                                bgcolor: 'rgba(234, 88, 12, 0.08)',
                                '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.16)' }
                              }}
                            >
                              <Visibility sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Table Pagination */}
        <TablePagination
          component="div"
          count={pagination.totalRecords}
          page={page - 1}
          onPageChange={(_, newPage) => setPage(newPage + 1)}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => {
            setLimit(parseInt(e.target.value, 10));
            setPage(1);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="Rows per page:"
          sx={{ borderTop: '1px solid', borderColor: 'divider' }}
        />
      </Paper>
    </Box>
  );
}
