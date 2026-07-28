import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Grid, Paper, Button, Box, FormControl, InputLabel,
  Select, MenuItem, TextField, Chip, Skeleton
} from '@mui/material';
import {
  Business, CalendarMonth, Warning, CheckCircle, Cancel
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../components/dashboard/KpiCard';
import LeadTable from '../components/LeadTable';
import { getAgentDashboard } from '../services/dashboardService';
import { listLeads } from '../services/leadsService';
import { DATE_FILTERS } from '../utils/constants';
import { getDateRangeFromFilter } from '../utils/dateHelpers';

export default function AgentDashboard() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [recentLeads, setRecentLeads] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const navigate = useNavigate();

  const buildParams = useCallback(() => {
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
      const data = await getAgentDashboard(buildParams());
      setKpis(data);
    } catch (e) {
      console.error('Dashboard error', e);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchRecentLeads = useCallback(async () => {
    setRecentLoading(true);
    try {
      const data = await listLeads({ page: 1, limit: 5 });
      setRecentLeads(data.leads || []);
    } catch (e) {
      console.error('Recent leads error', e);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); fetchRecentLeads(); }, [dateFilter, customStart, customEnd, fetchDashboard, fetchRecentLeads]);

  const navigateToLeads = (params) => {
    const query = new URLSearchParams(params).toString();
    navigate(`/leads?${query}`);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Agent Dashboard
        </Typography>
        <Chip label={new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="primary" variant="outlined" />
      </Box>

      {/* Filters */}
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
              <Grid item xs={6} md={3}>
                <TextField fullWidth size="small" type="date" label="From" value={customStart} onChange={(e) => setCustomStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField fullWidth size="small" type="date" label="To" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
            </>
          )}
          {(dateFilter) && (
            <Grid item xs={6} md={2}>
              <Button variant="text" size="small" onClick={() => { setDateFilter(''); setCustomStart(''); setCustomEnd(''); }} fullWidth sx={{ borderRadius: 2, textTransform: 'none' }}>
                Clear
              </Button>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'My Leads', value: kpis?.totalLeads, icon: <Business />, color: '#1976d2', onClick: () => navigateToLeads({}) },
          { title: 'Upcoming Follow-ups', value: kpis?.upcomingFollowups, icon: <CalendarMonth />, color: '#388e3c', onClick: () => navigateToLeads({ followUpType: 'upcoming' }) },
          { title: 'Overdue Follow-ups', value: kpis?.overdueFollowups, icon: <Warning />, color: '#f57c00', onClick: () => navigateToLeads({ followUpType: 'overdue' }) },
          { title: 'Won Leads', value: kpis?.totalWon, icon: <CheckCircle />, color: '#2e7d32', onClick: () => navigateToLeads({ closureStatus: 'WON' }) },
          { title: 'Lost Leads', value: kpis?.totalLost, icon: <Cancel />, color: '#d32f2f', onClick: () => navigateToLeads({ closureStatus: 'LOST' }) }
        ].map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} key={idx}>
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

      {/* Recent Leads */}
      <Paper elevation={0} sx={{ 
        p: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography variant="h6" fontWeight={700}>My Recent Leads (Latest 5)</Typography>
          <Button 
            size="small" 
            variant="contained" 
            onClick={() => navigate('/leads')} 
            sx={{ 
              textTransform: 'none',
              borderRadius: 2,
              boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)'
              }
            }}
          >
            View All
          </Button>
        </Box>
        <LeadTable leads={recentLeads} loading={recentLoading} />
      </Paper>
    </Box>
  );
}
