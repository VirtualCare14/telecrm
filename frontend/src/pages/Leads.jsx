import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, FormControl, InputLabel,
  Select, MenuItem, Pagination, Paper, Grid, Alert
} from '@mui/material';
import { Add, Search as SearchIcon, Clear, CloudUpload } from '@mui/icons-material';
import LeadTable from '../components/LeadTable';
import ImportLeadsModal from '../components/ImportLeadsModal';
import { listLeads } from '../services/leadsService';
import { getAgents } from '../services/agentService';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { DATE_FILTERS } from '../utils/constants';
import { getDateRangeFromFilter } from '../utils/dateHelpers';

export default function Leads() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [alertInfo, setAlertInfo] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    const unassigned = searchParams.get('unassigned');
    const owner = searchParams.get('owner');
    if (unassigned === 'true' || owner === 'unassigned') return 'unassigned';
    return owner || '';
  });
  const [dateFilter, setDateFilter] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [closureFilter, setClosureFilter] = useState(() => searchParams.get('closureStatus') || '');
  const [followUpFilter, setFollowUpFilter] = useState(() => searchParams.get('followUpType') || '');
  const [agents, setAgents] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const buildParams = useCallback(() => {
    const params = { search, page, limit: pageSize };
    if (ownerFilter) {
      if (ownerFilter === 'unassigned') {
        params.unassigned = 'true';
      } else {
        params.owner = ownerFilter;
      }
    }
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
  }, [search, page, pageSize, ownerFilter, closureFilter, followUpFilter, dateFilter, customStart, customEnd]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      getAgents().then((data) => {
        const agentList = data || [];
        setAgents(agentList);
        if (ownerFilter && ownerFilter !== 'unassigned') {
          const match = agentList.find(
            (a) => a._id === ownerFilter || a.fullName === ownerFilter || a.username === ownerFilter
          );
          if (match && match._id !== ownerFilter) {
            setOwnerFilter(match._id);
          }
        }
      }).catch(() => {});
    }
  }, [user]);

  // Handle navigation alert (e.g. redirected after deleting a lead)
  useEffect(() => {
    if (location.state?.alert) {
      setAlertInfo(location.state.alert);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleLeadDeleted = (deletedLead) => {
    setAlertInfo({
      type: 'success',
      message: `Lead "${deletedLead.organizationName || deletedLead.leadNumber}" and all associated records were deleted successfully.`
    });
    setRefreshTrigger((prev) => prev + 1);
  };

  // Auto-fetch when filters change, with cancellation to prevent stale response race conditions
  useEffect(() => {
    let isCurrent = true;

    const runFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildParams();
        const res = await listLeads(params);
        if (isCurrent) {
          setLeads(res.leads || []);
          setTotalPages(res.totalPages || Math.ceil((res.total || 0) / pageSize) || 1);
        }
      } catch (err) {
        if (isCurrent) {
          setError(err.response?.data?.message || 'Unable to load leads');
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    runFetch();

    return () => {
      isCurrent = false;
    };
  }, [page, ownerFilter, dateFilter, closureFilter, followUpFilter, customStart, customEnd, refreshTrigger, buildParams]);

  // Handle search - use debounce for search text
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== undefined) {
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync state if URL search parameters change while component is mounted
  useEffect(() => {
    const closure = searchParams.get('closureStatus') || '';
    const followUp = searchParams.get('followUpType') || '';
    const unassigned = searchParams.get('unassigned');
    const owner = searchParams.get('owner') || searchParams.get('agentId') || '';

    let nextOwner = '';
    if (unassigned === 'true' || owner === 'unassigned') {
      nextOwner = 'unassigned';
    } else if (owner) {
      const match = agents.find((a) => a._id === owner || a.fullName === owner || a.username === owner);
      nextOwner = match ? match._id : owner;
    }

    setClosureFilter(closure);
    setFollowUpFilter(followUp);
    setOwnerFilter(nextOwner);
    if (!searchParams.toString()) {
      setSearch('');
      setDateFilter('');
      setCustomStart('');
      setCustomEnd('');
    } else if (followUp) {
      setDateFilter('');
    }
    setPage(1);
  }, [searchParams, agents]);

  const handleClear = () => {
    setSearch('');
    setOwnerFilter('');
    setDateFilter('');
    setCustomStart('');
    setCustomEnd('');
    setClosureFilter('');
    setFollowUpFilter('');
    setPage(1);
    navigate('/leads', { replace: true });
  };

  const hasFilters = search || ownerFilter || dateFilter || closureFilter || followUpFilter;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Leads
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<CloudUpload sx={{ color: '#107c41' }} />}
            onClick={() => setImportModalOpen(true)}
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              borderColor: '#107c41',
              color: '#107c41',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#0b582e',
                bgcolor: 'rgba(16, 124, 65, 0.05)'
              }
            }}
          >
            Import from Excel
          </Button>

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/leads/create')}
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)'
              }
            }}
          >
            Create Lead
          </Button>
        </Box>
      </Box>

      {/* Import Modal */}
      <ImportLeadsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          setImportModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
        }}
      />

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
                  <MenuItem value="unassigned">Unassigned Leads</MenuItem>
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

      {alertInfo && (
        <Alert
          severity={alertInfo.type || 'info'}
          onClose={() => setAlertInfo(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {alertInfo.message}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <LeadTable leads={leads} loading={loading} onLeadDeleted={handleLeadDeleted} />
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
