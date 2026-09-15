import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Grid, Paper, Button, Box, FormControl, InputLabel,
  Select, MenuItem, TextField, Chip, Skeleton
} from '@mui/material';
import {
  Business, CalendarMonth, Warning, People, CheckCircle, Cancel,
  FilterList, PersonOff
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

      {/* Filters - auto apply */}
      <Paper elevation={0} sx={{ 
        p: 2, 
        mb: 3, 
        borderRadius: 2, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Agent</InputLabel>
              <Select value={filterAgentId} label="Agent" onChange={(e) => setFilterAgentId(e.target.value)} sx={{ borderRadius: 2 }}>
                <MenuItem value="">All Agents</MenuItem>
                {agents.map((a) => (
                  <MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Date</InputLabel>
              <Select value={dateFilter} label="Date" onChange={(e) => setDateFilter(e.target.value)} sx={{ borderRadius: 2 }}>
                {DATE_FILTERS.map((df) => (
                  <MenuItem key={df.value} value={df.value}>{df.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {dateFilter === 'custom' && (
            <>
              <Grid item xs={6} md={2}>
                <TextField fullWidth size="small" type="date" label="From" value={customStart} onChange={(e) => setCustomStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth size="small" type="date" label="To" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
            </>
          )}
          {(filterAgentId || dateFilter) && (
            <Grid item xs={6} md={1}>
              <Button variant="text" size="small" onClick={() => { setFilterAgentId(''); setDateFilter(''); setCustomStart(''); setCustomEnd(''); }} fullWidth sx={{ borderRadius: 2, textTransform: 'none' }}>
                Clear
              </Button>
            </Grid>
          )}
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

        <LeadTable leads={recentLeads} loading={recentLoading} />
      </Paper>
    </Box>
  );
}
