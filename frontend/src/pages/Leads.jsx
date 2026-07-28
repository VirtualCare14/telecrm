import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, FormControl, InputLabel,
  Select, MenuItem, Pagination, Paper, Grid
} from '@mui/material';
import { Add, Search as SearchIcon, Clear } from '@mui/icons-material';
import LeadTable from '../components/LeadTable';
import { listLeads } from '../services/leadsService';
import { getAgents } from '../services/agentService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { DATE_FILTERS } from '../utils/constants';
import { getDateRangeFromFilter } from '../utils/dateHelpers';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [closureFilter, setClosureFilter] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [agents, setAgents] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();

  const buildParams = useCallback(() => {
    const params = { search, page, limit: pageSize };
    if (user?.role === 'ADMIN' && ownerFilter) params.owner = ownerFilter;
    if (closureFilter) params.closureStatus = closureFilter;
    if (followUpFilter) params.followUpType = followUpFilter;
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
  }, [search, page, pageSize, user, ownerFilter, closureFilter, followUpFilter, dateFilter, customStart, customEnd]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await listLeads(params);
      setLeads(res.leads || []);
      setTotalPages(res.totalPages || Math.ceil((res.total || 0) / pageSize) || 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load leads');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      getAgents().then(setAgents).catch(() => {});
    }
  }, [user]);

  // Auto-fetch when filters change
  useEffect(() => {
    fetchLeads();
  }, [page, ownerFilter, dateFilter, closureFilter, followUpFilter, customStart, customEnd, fetchLeads]);

  // Handle search - use debounce for search text
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== undefined) {
        setPage(1);
        fetchLeads();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle initial search params from KPI clicks
  useEffect(() => {
    const closure = searchParams.get('closureStatus');
    const followUp = searchParams.get('followUpType');
    if (closure) setClosureFilter(closure);
    if (followUp) {
      setFollowUpFilter(followUp);
      setDateFilter('');
    }
    if (closure || followUp) {
      setPage(1);
    }
  }, [searchParams]);

  const handleClear = () => {
    setSearch('');
    setOwnerFilter('');
    setDateFilter('');
    setCustomStart('');
    setCustomEnd('');
    setClosureFilter('');
    setFollowUpFilter('');
    setPage(1);
  };

  const hasFilters = search || ownerFilter || dateFilter || closureFilter || followUpFilter;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Leads
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/leads/create')}
          sx={{ 
            borderRadius: 2, 
            textTransform: 'none',
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
            '&:hover': {
              boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)'
            }
          }}
        >
          Create Lead
        </Button>
      </Box>

      {/* Filters - auto apply on change */}
      <Paper elevation={0} sx={{ 
        p: 2, 
        mb: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by name, phone, or lead #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'primary.main', fontSize: 20 }} />,
                sx: { borderRadius: 2 }
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
          {user?.role === 'ADMIN' && (
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Agent</InputLabel>
                <Select value={ownerFilter} label="Agent" onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }} sx={{ borderRadius: 2 }}>
                  <MenuItem value="">All Agents</MenuItem>
                  {agents.map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>{agent.fullName || agent.username}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Date</InputLabel>
              <Select value={dateFilter} label="Date" onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} sx={{ borderRadius: 2 }}>
                {DATE_FILTERS.map((df) => (
                  <MenuItem key={df.value} value={df.value}>{df.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {dateFilter === 'custom' && (
            <>
              <Grid item xs={6} md={1.5}>
                <TextField fullWidth size="small" type="date" label="From" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setPage(1); }} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} md={1.5}>
                <TextField fullWidth size="small" type="date" label="To" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }} InputLabelProps={{ shrink: true }} />
              </Grid>
            </>
          )}
          <Grid item xs={6} md={user?.role === 'ADMIN' ? 1.5 : 2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={closureFilter} label="Status" onChange={(e) => { setClosureFilter(e.target.value); setPage(1); }} sx={{ borderRadius: 2 }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="OPEN">Open</MenuItem>
                <MenuItem value="WON">Won</MenuItem>
                <MenuItem value="LOST">Lost</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {hasFilters && (
            <Grid item xs={6} md={1}>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleClear} 
                fullWidth 
                sx={{ 
                  borderRadius: 2, 
                  textTransform: 'none',
                  borderColor: 'error.main',
                  color: 'error.main',
                  '&:hover': {
                    borderColor: 'error.dark',
                    bgcolor: 'rgba(211, 47, 47, 0.04)'
                  }
                }}
              >
                <Clear fontSize="small" sx={{ mr: 0.5 }} /> Clear
              </Button>
            </Grid>
          )}
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <LeadTable leads={leads} loading={loading} />
      </Paper>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            shape="rounded"
            showFirstButton
            showLastButton
            sx={{
              '& .MuiPaginationItem-root': {
                borderRadius: 1.5
              }
            }}
          />
        </Box>
      )}
    </Box>
  );
}
