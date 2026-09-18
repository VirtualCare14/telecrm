import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Grid, Paper, Button, Box, FormControl, InputLabel,
  Select, MenuItem, TextField, Chip, Skeleton, Divider, Tooltip
} from '@mui/material';
import {
  Business, CalendarMonth, Warning, People, CheckCircle, Cancel,
  FilterList, PersonOff, PersonAdd, PhoneInTalk, EventRepeat,
  OndemandVideo, TaskAlt, DirectionsWalk, CheckCircleOutline,
  WarningAmber, Insights, AssessmentOutlined
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../components/dashboard/KpiCard';
import LeadTable from '../components/LeadTable';
import AgentPerformanceTable from '../components/dashboard/AgentPerformanceTable';
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
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [recentLeads, setRecentLeads] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [activeLeadTab, setActiveLeadTab] = useState('all');
  const navigate = useNavigate();

  const buildDateParams = useCallback(() => {
    const params = {};
    if (dateFilter) {
      if (dateFilter === 'custom') {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      } else {
        const range = getDateRangeFromFilter(dateFilter);
        if (range.startDate) params.startDate = range.startDate;
        if (range.endDate) params.endDate = range.endDate;
      }
    }
    return params;
  }, [dateFilter, customStart, customEnd]);

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
  }, [fetchDashboard, fetchAgents, fetchRecentLeads]);

  const displayedAgents = filterAgentId
    ? agents.filter((a) => a._id === filterAgentId)
    : agents;

  const selectedAgentObj = agents.find((a) => a._id === filterAgentId);
  const selectedAgentName = selectedAgentObj ? (selectedAgentObj.fullName || selectedAgentObj.username) : 'All Agents';

  let selectedDateLabel = 'All Time';
  if (dateFilter) {
    if (dateFilter === 'custom') {
      selectedDateLabel = customStart || customEnd ? `${customStart || 'Start'} to ${customEnd || 'End'}` : 'Custom Range';
    } else {
      const found = DATE_FILTERS.find((df) => df.value === dateFilter);
      selectedDateLabel = found ? found.label : dateFilter;
    }
  }

  const daily = kpis?.dailyActivity || {
    newLeads: kpis?.totalLeads ?? 0,
    calls: 0,
    followups: kpis?.upcomingFollowups ?? 0,
    demosScheduled: 0,
    demosCompleted: 0,
    walkinsScheduled: 0,
    walkinsCompleted: 0,
    overdueFollowups: kpis?.overdueFollowups ?? 0,
    won: kpis?.totalWon ?? 0,
    lost: kpis?.totalLost ?? 0,
  };

  const dailyActivityItems = [
    { label: 'New Leads', value: daily.newLeads ?? 0, icon: <PersonAdd sx={{ fontSize: 17 }} />, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.22)' },
    { label: 'Calls', value: daily.calls ?? 0, icon: <PhoneInTalk sx={{ fontSize: 17 }} />, color: '#0284c7', bg: 'rgba(2, 132, 199, 0.08)', border: 'rgba(2, 132, 199, 0.22)' },
    { label: 'Follow-ups', value: daily.followups ?? 0, icon: <EventRepeat sx={{ fontSize: 17 }} />, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.22)' },
    { label: 'Demos Scheduled', value: daily.demosScheduled ?? 0, icon: <OndemandVideo sx={{ fontSize: 17 }} />, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.22)' },
    { label: 'Demos Completed', value: daily.demosCompleted ?? 0, icon: <TaskAlt sx={{ fontSize: 17 }} />, color: '#059669', bg: 'rgba(5, 150, 105, 0.08)', border: 'rgba(5, 150, 105, 0.22)' },
    { label: 'Walk-ins Scheduled', value: daily.walkinsScheduled ?? 0, icon: <DirectionsWalk sx={{ fontSize: 17 }} />, color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)', border: 'rgba(217, 119, 6, 0.22)' },
    { label: 'Walk-ins Completed', value: daily.walkinsCompleted ?? 0, icon: <CheckCircleOutline sx={{ fontSize: 17 }} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.22)' },
    { label: 'Overdue Follow-ups', value: daily.overdueFollowups ?? 0, icon: <WarningAmber sx={{ fontSize: 17 }} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.22)' },
    { label: 'Won', value: daily.won ?? 0, icon: <CheckCircle sx={{ fontSize: 17 }} />, color: '#16a34a', bg: 'rgba(22, 163, 74, 0.08)', border: 'rgba(22, 163, 74, 0.22)' },
    { label: 'Lost', value: daily.lost ?? 0, icon: <Cancel sx={{ fontSize: 17 }} />, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)', border: 'rgba(220, 38, 38, 0.22)' },
  ];

  const navigateToLeads = (params) => {
    const combined = { ...params };
    if (filterAgentId && !params.unassigned) combined.owner = filterAgentId;
    const dateParams = buildDateParams();
    Object.assign(combined, dateParams);
    const query = new URLSearchParams(combined).toString();
    navigate(query ? `/leads?${query}` : '/leads');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Admin Dashboard
        </Typography>
        <Chip label={new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="primary" variant="outlined" />
      </Box>

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
                onClick={() => { setFilterAgentId(''); setDateFilter(''); setCustomStart(''); setCustomEnd(''); }} 
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
              Status / Daily Activity
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
            <Grid item xs={6} sm={4} md={2.4} key={idx}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: item.bg,
                  border: '1px solid',
                  borderColor: item.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 4px 12px ${item.color}20`,
                    borderColor: item.color,
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

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          // First row: Total Leads, Unassigned Leads, Total Agents, Won Leads
          { title: 'Total Leads', value: kpis?.totalLeads, icon: <Business />, color: '#ea580c', onClick: () => navigateToLeads({}), md: 3 },
          { title: 'Unassigned Leads', value: kpis?.unassignedLeads, icon: <PersonOff />, color: '#ec4899', onClick: () => navigateToLeads({ unassigned: 'true' }), md: 3 },
          { title: 'Total Agents', value: kpis?.totalAgents, icon: <People />, color: '#a78bfa', onClick: () => navigate('/admin/agents'), md: 3 },
          { title: 'Won Leads', value: kpis?.totalWon, icon: <CheckCircle />, color: '#10b981', onClick: () => navigateToLeads({ closureStatus: 'WON' }), md: 3 },
          // Second row: Upcoming Follow-ups, Overdue Follow-ups, Lost Leads
          { title: 'Upcoming Follow-ups', value: kpis?.upcomingFollowups, icon: <CalendarMonth />, color: '#38bdf8', onClick: () => navigateToLeads({ followUpType: 'upcoming' }), md: 4 },
          { title: 'Overdue Follow-ups', value: kpis?.overdueFollowups, icon: <Warning />, color: '#f97316', onClick: () => navigateToLeads({ followUpType: 'overdue' }), md: 4 },
          { title: 'Lost Leads', value: kpis?.totalLost, icon: <Cancel />, color: '#ef4444', onClick: () => navigateToLeads({ closureStatus: 'LOST' }), md: 4 }
        ].map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={kpi.md} key={idx}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                transition: 'all 0.3s',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 8px 24px ${kpi.color}25`,
                  borderColor: kpi.color,
                  '&::before': {
                    opacity: 0.08
                  }
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: kpi.color,
                  opacity: 0,
                  transition: 'opacity 0.3s'
                }
              }}
              onClick={kpi.onClick}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500, fontSize: 13 }}>
                    {kpi.title}
                  </Typography>
                  {loading ? (
                    <Skeleton width={80} height={40} />
                  ) : (
                    <Typography variant="h3" fontWeight={700} sx={{ color: kpi.color, lineHeight: 1.2 }}>
                      {kpi.value ?? '—'}
                    </Typography>
                  )}
                </Box>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: `${kpi.color}15`,
                    color: kpi.color,
                    transition: 'all 0.3s',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      bgcolor: `${kpi.color}25`
                    }
                  }}
                >
                  {React.cloneElement(kpi.icon, { sx: { fontSize: 28 } })}
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
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
          <Typography variant="h6" fontWeight={700}>Active Leads (Latest 5)</Typography>
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
