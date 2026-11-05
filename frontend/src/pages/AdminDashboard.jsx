import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Grid, Paper, Button, Box, FormControl, InputLabel,
  Select, MenuItem, TextField, Chip, Skeleton, Divider, Tooltip
} from '@mui/material';
import {
  Business, CalendarMonth, Warning, People, CheckCircle, Cancel,
  FilterList, PersonOff, PersonAdd, PhoneInTalk, EventRepeat,
  OndemandVideo, TaskAlt, DirectionsWalk, CheckCircleOutline,
  WarningAmber, Insights, AssessmentOutlined, FileDownload,
  Whatshot, AcUnit
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import KpiCard from '../components/dashboard/KpiCard';
import LeadTable from '../components/LeadTable';
import AgentPerformanceTable from '../components/dashboard/AgentPerformanceTable';
import ExportRawDumpModal from '../components/ExportRawDumpModal';
import DashboardActivityModal from '../components/DashboardActivityModal';
import { getAdminDashboard } from '../services/dashboardService';
import { getAgents } from '../services/agentService';
import { listLeads } from '../services/leadsService';
import { DATE_FILTERS } from '../utils/constants';
import { getDateRangeFromFilter } from '../utils/dateHelpers';

const ACTIVE_LEAD_TABS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'unassigned', label: 'Unassigned' },
];

export default function AdminDashboard() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [filterAgentId, setFilterAgentId] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [singleDate, setSingleDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [recentLeads, setRecentLeads] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [activeLeadTab, setActiveLeadTab] = useState('all');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [activityModal, setActivityModal] = useState({
    open: false,
    metric: '',
    label: '',
    icon: null,
    color: '#2563eb',
  });
  const navigate = useNavigate();
  const location = useLocation();

  const buildDateParams = useCallback(() => {
    const params = {};
    if (!dateFilter) return params;

    if (dateFilter === 'custom') {
      if (customStart) params.startDate = customStart;
      if (customEnd) params.endDate = customEnd;
    } else if (dateFilter === 'single') {
      const d = singleDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      params.startDate = d;
      params.endDate = d;
      params.singleDate = d;
    } else if (dateFilter === 'month') {
      const m = selectedMonth || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
      const [year, mon] = m.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
      params.startDate = `${m}-01`;
      params.endDate = `${m}-${String(lastDay).padStart(2, '0')}`;
      params.month = m;
    } else {
      const range = getDateRangeFromFilter(dateFilter, { singleDate, selectedMonth, customStart, customEnd });
      if (range.startDate) params.startDate = range.startDate;
      if (range.endDate) params.endDate = range.endDate;
      params.dateFilter = dateFilter;
    }
    return params;
  }, [dateFilter, singleDate, selectedMonth, customStart, customEnd]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = buildDateParams();
      const params = { ...dateParams };
      if (filterAgentId) params.agentId = filterAgentId;
      const data = await getAdminDashboard(params);
      setKpis(data);
    } catch (e) {
      console.error('Dashboard error', e);
    } finally {
      setLoading(false);
    }
  }, [buildDateParams, filterAgentId]);

  const fetchRecentLeads = useCallback(async () => {
    setRecentLoading(true);
    try {
      const dateParams = buildDateParams();
      const params = { page: 1, limit: 5, ...dateParams };
      if (filterAgentId) params.owner = filterAgentId;

      if (activeLeadTab === 'upcoming') {
        params.followUpType = 'upcoming';
      } else if (activeLeadTab === 'overdue') {
        params.followUpType = 'overdue';
      } else if (activeLeadTab === 'unassigned') {
        if (filterAgentId) {
          setRecentLeads([]);
          setRecentLoading(false);
          return;
        }
        params.unassigned = 'true';
      }

      const data = await listLeads(params);
      setRecentLeads(data.leads || []);
    } catch (e) {
      console.error('Recent leads error', e);
    } finally {
      setRecentLoading(false);
    }
  }, [buildDateParams, filterAgentId, activeLeadTab]);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const dateParams = buildDateParams();
      const data = await getAgents(dateParams);
      setAgents(data || []);
    } catch (e) {
      console.error('Fetch agents error', e);
    } finally {
      setAgentsLoading(false);
    }
  }, [buildDateParams]);

  useEffect(() => {
    fetchDashboard();
    fetchAgents();
    fetchRecentLeads();
  }, [fetchDashboard, fetchAgents, fetchRecentLeads, location.key, location.state]);

  useEffect(() => {
    const onLeadUpdate = () => {
      fetchDashboard();
      fetchRecentLeads();
    };
    window.addEventListener('telecrm:lead-updated', onLeadUpdate);
    return () => window.removeEventListener('telecrm:lead-updated', onLeadUpdate);
  }, [fetchDashboard, fetchRecentLeads]);

  // Automatic cross-agent synchronization: 30s background polling & window focus refresh
  useEffect(() => {
    const handleSync = () => {
      fetchDashboard();
      fetchAgents();
      fetchRecentLeads();
    };

    const handleFocus = () => {
      handleSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = setInterval(() => {
      handleSync();
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [fetchDashboard, fetchAgents, fetchRecentLeads]);

  const displayedAgents = filterAgentId
    ? agents.filter((a) => a._id === filterAgentId)
    : agents;

  const selectedAgentObj = agents.find((a) => a._id === filterAgentId);
  const selectedAgentName = selectedAgentObj ? (selectedAgentObj.fullName || selectedAgentObj.username) : 'All Agents';

  let selectedDateLabel = 'All Time';
  if (dateFilter) {
    if (dateFilter === 'custom') {
      selectedDateLabel = (customStart || customEnd) ? `${customStart || 'Start'} to ${customEnd || 'End'}` : 'Custom Range';
    } else if (dateFilter === 'single') {
      selectedDateLabel = singleDate ? `Date: ${singleDate}` : 'Single Date';
    } else if (dateFilter === 'month') {
      selectedDateLabel = selectedMonth ? `Month: ${selectedMonth}` : 'Selected Month';
    } else {
      const found = DATE_FILTERS.find((df) => df.value === dateFilter);
      selectedDateLabel = found ? found.label : dateFilter;
    }
  }

  const daily = kpis?.dailyActivity || {
    calls: 0,
    followups: 0,
    demos: 0,
    demosScheduled: 0,
    walkins: 0,
    walkinsScheduled: 0,
    salesFollowups: 0,
    demosCompleted: 0,
    walkinsCompleted: 0,
    overdueFollowups: 0,
    won: 0,
    lost: 0,
    newLeads: 0,
  };

  const navigateToLeads = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    navigate(query ? `/leads?${query}` : '/leads');
  };

  const handleOpenActivityModal = (metric, label, icon, color) => {
    setActivityModal({
      open: true,
      metric,
      label,
      icon,
      color,
    });
  };

  const dailyActivityItems = [
    {
      metric: 'newLeads',
      label: 'New Leads',
      value: daily.newLeads ?? 0,
      icon: <PersonAdd sx={{ fontSize: 17 }} />,
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.08)',
      border: 'rgba(99, 102, 241, 0.22)',
      onClick: () => handleOpenActivityModal('newLeads', 'New Leads', <PersonAdd sx={{ fontSize: 20 }} />, '#6366f1'),
    },
    {
      metric: 'calls',
      label: 'Calls',
      value: daily.calls ?? 0,
      icon: <PhoneInTalk sx={{ fontSize: 17 }} />,
      color: '#0284c7',
      bg: 'rgba(2, 132, 199, 0.08)',
      border: 'rgba(2, 132, 199, 0.22)',
      onClick: () => handleOpenActivityModal('calls', 'Calls', <PhoneInTalk sx={{ fontSize: 20 }} />, '#0284c7'),
    },
    {
      metric: 'followups',
      label: 'Follow-ups',
      value: daily.followups ?? 0,
      icon: <EventRepeat sx={{ fontSize: 17 }} />,
      color: '#2563eb',
      bg: 'rgba(37, 99, 235, 0.08)',
      border: 'rgba(37, 99, 235, 0.22)',
      onClick: () => handleOpenActivityModal('followups', 'Follow-ups', <EventRepeat sx={{ fontSize: 20 }} />, '#2563eb'),
    },
    {
      metric: 'demos',
      label: 'Demos',
      value: daily.demos ?? daily.demosScheduled ?? 0,
      icon: <OndemandVideo sx={{ fontSize: 17 }} />,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.08)',
      border: 'rgba(139, 92, 246, 0.22)',
      onClick: () => handleOpenActivityModal('demos', 'Demos', <OndemandVideo sx={{ fontSize: 20 }} />, '#8b5cf6'),
    },
    {
      metric: 'walkins',
      label: 'Walk-ins',
      value: daily.walkins ?? daily.walkinsScheduled ?? 0,
      icon: <DirectionsWalk sx={{ fontSize: 17 }} />,
      color: '#d97706',
      bg: 'rgba(217, 119, 6, 0.08)',
      border: 'rgba(217, 119, 6, 0.22)',
      onClick: () => handleOpenActivityModal('walkins', 'Walk-ins', <DirectionsWalk sx={{ fontSize: 20 }} />, '#d97706'),
    },
    {
      metric: 'salesFollowups',
      label: 'Sales Follow-ups',
      value: daily.salesFollowups ?? 0,
      icon: <CalendarMonth sx={{ fontSize: 17 }} />,
      color: '#0891b2',
      bg: 'rgba(8, 145, 178, 0.08)',
      border: 'rgba(8, 145, 178, 0.22)',
      onClick: () => handleOpenActivityModal('salesFollowups', 'Sales Follow-ups', <CalendarMonth sx={{ fontSize: 20 }} />, '#0891b2'),
    },
    {
      metric: 'demosCompleted',
      label: 'Demos Completed',
      value: daily.demosCompleted ?? 0,
      icon: <TaskAlt sx={{ fontSize: 17 }} />,
      color: '#059669',
      bg: 'rgba(5, 150, 105, 0.08)',
      border: 'rgba(5, 150, 105, 0.22)',
      onClick: () => handleOpenActivityModal('demosCompleted', 'Demos Completed', <TaskAlt sx={{ fontSize: 20 }} />, '#059669'),
    },
    {
      metric: 'walkinsCompleted',
      label: 'Walk-ins Completed',
      value: daily.walkinsCompleted ?? 0,
      icon: <CheckCircleOutline sx={{ fontSize: 17 }} />,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.22)',
      onClick: () => handleOpenActivityModal('walkinsCompleted', 'Walk-ins Completed', <CheckCircleOutline sx={{ fontSize: 20 }} />, '#10b981'),
    },
    {
      metric: 'overdueFollowups',
      label: 'Overdue Follow-ups',
      value: daily.overdueFollowups ?? 0,
      icon: <WarningAmber sx={{ fontSize: 17 }} />,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.22)',
      onClick: () => handleOpenActivityModal('overdueFollowups', 'Overdue Follow-ups', <WarningAmber sx={{ fontSize: 20 }} />, '#ef4444'),
    },
    {
      metric: 'won',
      label: 'Won',
      value: daily.won ?? 0,
      icon: <CheckCircle sx={{ fontSize: 17 }} />,
      color: '#16a34a',
      bg: 'rgba(22, 163, 74, 0.08)',
      border: 'rgba(22, 163, 74, 0.22)',
      onClick: () => handleOpenActivityModal('won', 'Won', <CheckCircle sx={{ fontSize: 20 }} />, '#16a34a'),
    },
    {
      metric: 'lost',
      label: 'Lost',
      value: daily.lost ?? 0,
      icon: <Cancel sx={{ fontSize: 17 }} />,
      color: '#dc2626',
      bg: 'rgba(220, 38, 38, 0.08)',
      border: 'rgba(220, 38, 38, 0.22)',
      onClick: () => handleOpenActivityModal('lost', 'Lost', <Cancel sx={{ fontSize: 20 }} />, '#dc2626'),
    },
  ];


  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Admin Dashboard
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            id="admin-hospital-activities-btn"
            variant="contained"
            startIcon={<DirectionsWalk />}
            onClick={() => handleOpenActivityModal('demos', 'Hospital Activities (Demos)', <OndemandVideo sx={{ fontSize: 20 }} />, '#8b5cf6')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: 'none',
              bgcolor: 'primary.main',
              '&:hover': { bgcolor: 'primary.dark' }
            }}
          >
            Hospital Activities
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownload sx={{ color: '#0284c7' }} />}
            onClick={() => setExportModalOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              borderColor: '#0284c7',
              color: '#0284c7',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#0369a1',
                bgcolor: 'rgba(2, 132, 199, 0.05)',
              },
            }}
          >
            Export Raw Dump
          </Button>
          <Chip label={new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="primary" variant="outlined" />
        </Box>

      </Box>

      {/* Export Raw Dump Modal */}
      <ExportRawDumpModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        currentFilters={{
          owner: filterAgentId,
          startDate: buildDateParams().startDate,
          endDate: buildDateParams().endDate,
        }}
        filterCount={[filterAgentId, dateFilter].filter(Boolean).length}
      />

      {/* Activity Details Modal */}
      <DashboardActivityModal
        open={activityModal.open}
        onClose={() => {
          setActivityModal((prev) => ({ ...prev, open: false }));
          fetchDashboard();
          fetchAgents();
          fetchRecentLeads();
        }}
        metric={activityModal.metric}
        metricLabel={activityModal.label}
        icon={activityModal.icon}
        color={activityModal.color}
        dateParams={buildDateParams()}
        dateFilter={dateFilter}
        singleDate={singleDate}
        selectedMonth={selectedMonth}
        customStart={customStart}
        customEnd={customEnd}
        filterAgentId={filterAgentId}
        selectedAgentName={selectedAgentName}
        selectedDateLabel={selectedDateLabel}
      />


      {/* Filter & Daily Activity Area */}
      <Paper elevation={0} sx={{ 
        p: 2.5, 
        mb: 3, 
        borderRadius: 2.5, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
      }}>
        {/* Filters Controls Row */}
        <Grid container spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6} md={3.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="agent-filter-label">Agent</InputLabel>
              <Select 
                labelId="agent-filter-label"
                id="agent-filter-select"
                value={filterAgentId} 
                label="Agent" 
                onChange={(e) => setFilterAgentId(e.target.value)} 
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Agents</MenuItem>
                {agents.map((a) => (
                  <MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={4} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="date-filter-label">Date</InputLabel>
              <Select 
                labelId="date-filter-label"
                id="date-filter-select"
                value={dateFilter} 
                label="Date" 
                onChange={(e) => setDateFilter(e.target.value)} 
                sx={{ borderRadius: 2 }}
              >
                {DATE_FILTERS.map((df) => (
                  <MenuItem key={df.value} value={df.value}>{df.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {dateFilter === 'single' && (
            <Grid item xs={6} sm={4} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Select Date"
                id="dashboard-single-date-picker"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          )}
          {dateFilter === 'month' && (
            <Grid item xs={6} sm={4} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="month"
                label="Select Month"
                id="dashboard-month-picker"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          )}
          {dateFilter === 'custom' && (
            <>
              <Grid item xs={6} sm={4} md={2}>
                <TextField fullWidth size="small" type="date" label="From" value={customStart} onChange={(e) => setCustomStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={4} md={2}>
                <TextField fullWidth size="small" type="date" label="To" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
            </>
          )}
          {(filterAgentId || dateFilter) && (
            <Grid item xs={6} sm={2} md={1}>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={() => { setFilterAgentId(''); setDateFilter(''); setCustomStart(''); setCustomEnd(''); setSingleDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })); setSelectedMonth(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)); }} 
                fullWidth 
                sx={{ borderRadius: 2, textTransform: 'none', py: 0.75, color: 'text.secondary', borderColor: 'divider' }}
              >
                Clear
              </Button>
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 1.5, borderColor: 'divider' }} />

        {/* Status / Daily Activity Section Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssessmentOutlined sx={{ fontSize: 20, color: 'primary.main' }} />
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', letterSpacing: 0.3 }}>
              Daily Activity Status
            </Typography>
            <Chip 
              label={`${selectedAgentName} • ${selectedDateLabel}`} 
              size="small" 
              sx={{ 
                height: 22, 
                fontSize: '0.75rem', 
                fontWeight: 600, 
                bgcolor: 'action.hover', 
                color: 'text.secondary' 
              }} 
            />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
            Workload & activity breakdown for selected date & agent
          </Typography>
        </Box>

        {/* 10 Metric Dynamic Activity Cards */}
        <Grid container spacing={1.2}>
          {dailyActivityItems.map((item, idx) => (
            <Grid item xs={6} sm={4} md={2.4} key={item.metric || idx}>
              <Paper
                elevation={0}
                id={`activity-card-${item.metric || idx}`}
                data-testid={`activity-card-${item.metric || idx}`}
                onClick={item.onClick}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: item.bg,
                  border: '1px solid',
                  borderColor: item.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: item.onClick ? 'pointer' : 'default',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: item.onClick ? 'translateY(-2px)' : 'none',
                    boxShadow: item.onClick ? `0 4px 12px ${item.color}20` : 'none',
                    borderColor: item.onClick ? item.color : item.border,
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color,
                    flexShrink: 0
                  }}>
                    {item.icon}
                  </Box>
                  <Typography 
                    variant="caption" 
                    noWrap
                    title={item.label}
                    sx={{ 
                      fontWeight: 600, 
                      color: 'text.primary', 
                      fontSize: '0.75rem',
                      lineHeight: 1.2
                    }}
                  >
                    {item.label}
                  </Typography>
                </Box>
                {loading ? (
                  <Skeleton width={24} height={24} sx={{ ml: 1, flexShrink: 0 }} />
                ) : (
                  <Typography 
                    variant="body2" 
                    fontWeight={800} 
                    sx={{ 
                      color: item.color, 
                      fontSize: '0.95rem',
                      ml: 1,
                      flexShrink: 0,
                      minWidth: 20,
                      textAlign: 'right'
                    }}
                  >
                    {item.value}
                  </Typography>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Summary Section — Total Leads and Temperature Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => navigateToLeads({})}
            sx={{
              p: 2.25,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(234, 88, 12, 0.25)',
              bgcolor: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 10px rgba(234, 88, 12, 0.05)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(234, 88, 12, 0.16)',
                borderColor: '#ea580c',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                  Total Leads
                </Typography>
                {loading ? (
                  <Skeleton width={70} height={42} />
                ) : (
                  <Typography variant="h4" fontWeight={800} sx={{ color: '#ea580c', lineHeight: 1.1 }}>
                    {kpis?.totalLeads ?? 0}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', mt: 0.5 }}>
                  All accessible leads
                </Typography>
              </Box>
              <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(234, 88, 12, 0.1)', color: '#ea580c', flexShrink: 0 }}>
                <Business sx={{ fontSize: 26 }} />
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => navigateToLeads({ temperature: 'Hot' })}
            sx={{
              p: 2.25,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              bgcolor: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 10px rgba(239, 68, 68, 0.05)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.16)',
                borderColor: '#dc2626',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                  🔥 Hot Leads
                </Typography>
                {loading ? (
                  <Skeleton width={70} height={42} />
                ) : (
                  <Typography variant="h4" fontWeight={800} sx={{ color: '#dc2626', lineHeight: 1.1 }}>
                    {kpis?.hotLeads ?? 0}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', mt: 0.5 }}>
                  High purchase intent
                </Typography>
              </Box>
              <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', flexShrink: 0 }}>
                <Whatshot sx={{ fontSize: 26 }} />
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => navigateToLeads({ temperature: 'Warm' })}
            sx={{
              p: 2.25,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(234, 88, 12, 0.25)',
              bgcolor: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 10px rgba(234, 88, 12, 0.05)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(234, 88, 12, 0.16)',
                borderColor: '#c2410c',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                  🟠 Warm Leads
                </Typography>
                {loading ? (
                  <Skeleton width={70} height={42} />
                ) : (
                  <Typography variant="h4" fontWeight={800} sx={{ color: '#c2410c', lineHeight: 1.1 }}>
                    {kpis?.warmLeads ?? 0}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', mt: 0.5 }}>
                  Engaged / Follow-up
                </Typography>
              </Box>
              <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(234, 88, 12, 0.1)', color: '#c2410c', flexShrink: 0 }}>
                <Typography sx={{ fontSize: 22, lineHeight: 1 }}>🟠</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => navigateToLeads({ temperature: 'Cold' })}
            sx={{
              p: 2.25,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(2, 132, 199, 0.25)',
              bgcolor: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.05)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(2, 132, 199, 0.16)',
                borderColor: '#0284c7',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                  ❄️ Cold Leads
                </Typography>
                {loading ? (
                  <Skeleton width={70} height={42} />
                ) : (
                  <Typography variant="h4" fontWeight={800} sx={{ color: '#0284c7', lineHeight: 1.1 }}>
                    {kpis?.coldLeads ?? 0}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', mt: 0.5 }}>
                  Low engagement
                </Typography>
              </Box>
              <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', flexShrink: 0 }}>
                <AcUnit sx={{ fontSize: 26 }} />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Agent Performance */}
      <Paper elevation={0} sx={{ 
        p: 3, 
        mb: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography variant="h6" fontWeight={700}>Agent Performance</Typography>
        </Box>
        <AgentPerformanceTable agents={displayedAgents} allAgents={agents} loading={agentsLoading} />
      </Paper>

      {/* Recent Leads - Active work */}
      <Paper elevation={0} sx={{ 
        p: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>Recent Hospitals / Leads (Latest 5)</Typography>
          <Button 
            size="small" 
            variant="contained" 
            onClick={() => navigate('/leads')} 
            sx={{ 
              textTransform: 'none',
              borderRadius: 2,
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)'
              }
            }}
          >
            View All
          </Button>
        </Box>

        {/* Filter buttons above Active Leads table */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
          {ACTIVE_LEAD_TABS.map((tab) => {
            const isSelected = activeLeadTab === tab.id;
            return (
              <Button
                key={tab.id}
                size="small"
                variant={isSelected ? 'contained' : 'outlined'}
                onClick={() => setActiveLeadTab(tab.id)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  px: 2,
                  py: 0.5,
                  minWidth: 'auto',
                  ...(isSelected
                    ? {
                        bgcolor: 'primary.main',
                        color: '#ffffff',
                        boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
                        '&:hover': {
                          bgcolor: 'primary.dark',
                        },
                      }
                    : {
                        borderColor: 'divider',
                        color: 'text.secondary',
                        bgcolor: 'transparent',
                        '&:hover': {
                          bgcolor: 'rgba(234, 88, 12, 0.06)',
                          borderColor: 'primary.main',
                          color: 'primary.main',
                        },
                      }),
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </Box>

        <LeadTable
          leads={recentLeads}
          loading={recentLoading}
          onLeadDeleted={() => {
            fetchRecentLeads();
            fetchDashboard();
          }}
        />
      </Paper>
    </Box>
  );
}
