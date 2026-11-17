import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, TextField, Button, FormControl, InputLabel,
  Select, MenuItem, Pagination, Paper, Grid, Alert, Menu, ListItemIcon,
  ListItemText, Chip, IconButton
} from '@mui/material';
import {
  Add, Search as SearchIcon, Clear, CloudUpload, FileDownload,
  KeyboardArrowDown, Check, Whatshot, AcUnit, Business
} from '@mui/icons-material';
import LeadTable from '../components/LeadTable';
import ImportLeadsModal from '../components/ImportLeadsModal';
import ExportRawDumpModal from '../components/ExportRawDumpModal';
import CalendarDatePicker from '../components/CalendarDatePicker';
import { listLeads } from '../services/leadsService';
import { getAgents } from '../services/agentService';
import { getAdminDashboard, getAgentDashboard } from '../services/dashboardService';
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
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [alertInfo, setAlertInfo] = useState(null);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    const unassigned = searchParams.get('unassigned');
    const owner = searchParams.get('owner');
    if (unassigned === 'true' || owner === 'unassigned') return 'unassigned';
    return owner || '';
  });
  const [dateFilter, setDateFilter] = useState(() => searchParams.get('dateFilter') || '');
  const [customStart, setCustomStart] = useState(() => searchParams.get('startDate') || '');
  const [customEnd, setCustomEnd] = useState(() => searchParams.get('endDate') || '');
  const [closureFilter, setClosureFilter] = useState(() => searchParams.get('closureStatus') || '');
  const [followUpFilter, setFollowUpFilter] = useState(() => searchParams.get('followUpType') || '');
  const [temperatureFilter, setTemperatureFilter] = useState(() => searchParams.get('temperature') || searchParams.get('leadTemperature') || '');
  const [agents, setAgents] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Classification popup anchor state
  const [classificationAnchorEl, setClassificationAnchorEl] = useState(null);
  const [kpiCounts, setKpiCounts] = useState({ totalLeads: null, hotLeads: null, warmLeads: null, coldLeads: null });

  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');

  // Fetch KPI counts dynamically from backend for popup display
  useEffect(() => {
    let active = true;
    const fetchCounts = async () => {
      try {
        const fetcher = isAdmin ? getAdminDashboard : getAgentDashboard;
        const res = await fetcher({});
        if (active && res) {
          setKpiCounts({
            totalLeads: res.totalLeads ?? null,
            hotLeads: res.hotLeads ?? null,
            warmLeads: res.warmLeads ?? null,
            coldLeads: res.coldLeads ?? null,
          });
        }
      } catch (err) {
        // Fallback gracefully without breaking UI
      }
    };
    fetchCounts();
    return () => { active = false; };
  }, [isAdmin, refreshTrigger]);

  const classificationOptions = useMemo(() => [
    {
      value: '',
      key: 'total',
      label: 'Total Leads',
      displayLabel: 'Total Leads',
      icon: <Business sx={{ fontSize: 18, color: '#ea580c' }} />,
      color: '#ea580c',
      bg: 'rgba(234, 88, 12, 0.08)',
      border: 'rgba(234, 88, 12, 0.3)',
      count: kpiCounts.totalLeads ?? (temperatureFilter === '' ? totalCount : null),
    },
    {
      value: 'Hot',
      key: 'hot',
      label: 'Hot',
      displayLabel: '🔥 Hot',
      icon: <Whatshot sx={{ fontSize: 18, color: '#dc2626' }} />,
      color: '#dc2626',
      bg: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.3)',
      count: kpiCounts.hotLeads ?? (temperatureFilter.toLowerCase() === 'hot' ? totalCount : null),
    },
    {
      value: 'Warm',
      key: 'warm',
      label: 'Warm',
      displayLabel: '🟠 Warm',
      icon: <Typography sx={{ fontSize: 16, lineHeight: 1 }}>🟠</Typography>,
      color: '#c2410c',
      bg: 'rgba(234, 88, 12, 0.08)',
      border: 'rgba(234, 88, 12, 0.3)',
      count: kpiCounts.warmLeads ?? (temperatureFilter.toLowerCase() === 'warm' ? totalCount : null),
    },
    {
      value: 'Cold',
      key: 'cold',
      label: 'Cold',
      displayLabel: '❄️ Cold',
      icon: <AcUnit sx={{ fontSize: 18, color: '#0284c7' }} />,
      color: '#0284c7',
      bg: 'rgba(2, 132, 199, 0.08)',
      border: 'rgba(2, 132, 199, 0.3)',
      count: kpiCounts.coldLeads ?? (temperatureFilter.toLowerCase() === 'cold' ? totalCount : null),
    },
  ], [kpiCounts, totalCount, temperatureFilter]);

  const selectedClassification = useMemo(() => {
    if (!temperatureFilter) return classificationOptions[0];
    const match = classificationOptions.find(
      (opt) => opt.value && opt.value.toLowerCase() === temperatureFilter.toLowerCase()
    );
    return match || {
      value: temperatureFilter,
      label: temperatureFilter,
      displayLabel: temperatureFilter,
      icon: <Business sx={{ fontSize: 18, color: '#ea580c' }} />,
      color: '#ea580c',
      bg: 'rgba(234, 88, 12, 0.08)',
      border: 'rgba(234, 88, 12, 0.3)',
      count: totalCount,
    };
  }, [temperatureFilter, classificationOptions, totalCount]);

  const handleOpenClassificationMenu = (event) => {
    setClassificationAnchorEl(event.currentTarget);
  };

  const handleCloseClassificationMenu = () => {
    setClassificationAnchorEl(null);
  };

  const handleSelectClassification = (val) => {
    setTemperatureFilter(val);
    setPage(1);
    setClassificationAnchorEl(null);
  };

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
    if (temperatureFilter) params.temperature = temperatureFilter;
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
  }, [search, page, pageSize, ownerFilter, closureFilter, followUpFilter, temperatureFilter, dateFilter, customStart, customEnd]);

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

  // Handle navigation alert or refresh (e.g. redirected after creating or deleting a lead)
  useEffect(() => {
    if (location.state?.alert || location.state?.refresh) {
      if (location.state.alert) {
        setAlertInfo(location.state.alert);
      }
      setRefreshTrigger((prev) => prev + 1);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, location.key]);

  const handleLeadDeleted = (deletedLead) => {
    setAlertInfo({
      type: 'success',
      message: `Lead "${deletedLead.organizationName || deletedLead.leadNumber}" and all associated records were deleted successfully.`
    });
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleLeadUpdated = (updatedLead) => {
    setLeads((prev) =>
      prev.map((l) => (l._id === updatedLead._id ? { ...l, ...updatedLead } : l))
    );
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
          setTotalCount(res.total || 0);
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
  }, [page, ownerFilter, dateFilter, closureFilter, followUpFilter, temperatureFilter, customStart, customEnd, refreshTrigger, buildParams, pageSize]);

  // Handle search - debounce for typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== undefined) {
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync state if URL search parameters change while component is mounted
  useEffect(() => {
    const closure = searchParams.get('closureStatus') || '';
    const followUp = searchParams.get('followUpType') || '';
    const unassigned = searchParams.get('unassigned');
    const owner = searchParams.get('owner') || searchParams.get('agentId') || '';
    const dateParam = searchParams.get('dateFilter') || '';
    const startParam = searchParams.get('startDate') || '';
    const endParam = searchParams.get('endDate') || '';
    const tempParam = searchParams.get('temperature') || searchParams.get('leadTemperature') || '';

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
    setDateFilter(dateParam);
    setCustomStart(startParam);
    setCustomEnd(endParam);
    setTemperatureFilter(tempParam);
    if (!searchParams.toString()) {
      setSearch('');
      setDateFilter('');
      setCustomStart('');
      setCustomEnd('');
      setClosureFilter('');
      setFollowUpFilter('');
      setOwnerFilter('');
      setTemperatureFilter('');
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
    setTemperatureFilter('');
    setPage(1);
    navigate('/leads', { replace: true });
  };

  const hasFilters = Boolean(search || ownerFilter || dateFilter || closureFilter || followUpFilter || temperatureFilter);

  return (
    <Box>
      {/* 1. Reorganized Leads Page Header */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {/* Left Section: Page Title, Create Lead button, and Search input with Search button */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              flex: { xs: '1 1 100%', md: '0 1 auto' },
            }}
          >
            <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary', mr: 0.5 }}>
              Leads
            </Typography>

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate('/leads/create')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 700,
                px: 2.2,
                py: 0.85,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                bgcolor: '#ea580c',
                '&:hover': {
                  bgcolor: '#c2410c',
                  boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)',
                },
              }}
            >
              Create Lead
            </Button>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                placeholder="Search by hospital name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <SearchIcon sx={{ mr: 1, color: '#ea580c', fontSize: 20 }} />
                  ),
                  endAdornment: search ? (
                    <IconButton size="small" onClick={() => setSearch('')} sx={{ p: 0.5 }}>
                      <Clear fontSize="small" />
                    </IconButton>
                  ) : null,
                  sx: {
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    width: { xs: 200, sm: 240, md: 280 },
                  },
                }}
              />

              <Button
                variant="outlined"
                startIcon={<SearchIcon sx={{ fontSize: 18 }} />}
                onClick={() => setPage(1)}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  py: 0.85,
                  px: 1.8,
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  bgcolor: '#ffffff',
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    borderColor: '#ea580c',
                    color: '#ea580c',
                    bgcolor: 'rgba(234, 88, 12, 0.04)',
                  },
                }}
              >
                Search
              </Button>
            </Box>
          </Box>

          {/* Right Section: Utilities (Export, Import) & Total Leads / Hot/Warm/Cold Classification Popup Button */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', md: 'flex-end' },
            }}
          >
            {isAdmin && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownload sx={{ color: '#0284c7' }} />}
                onClick={() => setExportModalOpen(true)}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  borderColor: '#0284c7',
                  color: '#0284c7',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  py: 0.6,
                  '&:hover': {
                    borderColor: '#0369a1',
                    bgcolor: 'rgba(2, 132, 199, 0.05)',
                  },
                }}
              >
                Export Raw Dump
              </Button>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<CloudUpload sx={{ color: '#107c41' }} />}
              onClick={() => setImportModalOpen(true)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                borderColor: '#107c41',
                color: '#107c41',
                fontWeight: 600,
                fontSize: '0.8125rem',
                py: 0.6,
                '&:hover': {
                  borderColor: '#0b582e',
                  bgcolor: 'rgba(16, 124, 65, 0.05)',
                },
              }}
            >
              Import from Excel
            </Button>
            <Button
              id="lead-classification-popup-btn"
              variant="outlined"
              onClick={handleOpenClassificationMenu}
              endIcon={<KeyboardArrowDown sx={{ color: selectedClassification.color }} />}
              startIcon={selectedClassification.icon}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.875rem',
                px: 2,
                py: 0.8,
                bgcolor: selectedClassification.bg,
                color: selectedClassification.color,
                borderColor: selectedClassification.border,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                '&:hover': {
                  bgcolor: selectedClassification.bg,
                  borderColor: selectedClassification.color,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                },
              }}
            >
              {selectedClassification.displayLabel}
              {selectedClassification.count !== null && selectedClassification.count !== undefined && (
                <Box
                  component="span"
                  sx={{
                    ml: 1,
                    px: 1,
                    py: 0.15,
                    borderRadius: 4,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'inherit',
                    color: 'inherit',
                  }}
                >
                  {selectedClassification.count}
                </Box>
              )}
            </Button>

            {/* Classification Popup Menu */}
            <Menu
              id="lead-classification-popup-menu"
              anchorEl={classificationAnchorEl}
              open={Boolean(classificationAnchorEl)}
              onClose={handleCloseClassificationMenu}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                elevation: 4,
                sx: {
                  borderRadius: 2.5,
                  minWidth: 220,
                  p: 0.5,
                  mt: 0.75,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                  border: '1px solid #e2e8f0',
                },
              }}
            >
              <Typography variant="caption" sx={{ px: 2, py: 0.75, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                Filter Classification
              </Typography>
              {classificationOptions.map((opt) => {
                const isSelected = (temperatureFilter || '').toLowerCase() === (opt.value || '').toLowerCase();
                return (
                  <MenuItem
                    key={opt.key}
                    onClick={() => handleSelectClassification(opt.value)}
                    sx={{
                      borderRadius: 1.5,
                      mx: 0.5,
                      my: 0.25,
                      py: 1,
                      px: 1.5,
                      bgcolor: isSelected ? opt.bg : 'transparent',
                      fontWeight: isSelected ? 700 : 500,
                      '&:hover': {
                        bgcolor: opt.bg,
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {opt.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? opt.color : 'text.primary',
                            }}
                          >
                            {opt.label}
                          </Typography>
                          {opt.count !== null && opt.count !== undefined && (
                            <Chip
                              label={opt.count}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                bgcolor: isSelected ? opt.color : '#f1f5f9',
                                color: isSelected ? '#ffffff' : '#475569',
                              }}
                            />
                          )}
                        </Box>
                      }
                    />
                    {isSelected && (
                      <Check sx={{ fontSize: 18, ml: 1, color: opt.color }} />
                    )}
                  </MenuItem>
                );
              })}
            </Menu>
          </Box>
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

      {/* Export Raw Dump Modal */}
      <ExportRawDumpModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        currentFilters={{
          search,
          owner: ownerFilter === 'unassigned' ? undefined : ownerFilter,
          unassigned: ownerFilter === 'unassigned' ? 'true' : undefined,
          closureStatus: closureFilter,
          followUpType: followUpFilter,
          startDate: dateFilter === 'custom' ? customStart : (getDateRangeFromFilter(dateFilter)?.startDate),
          endDate: dateFilter === 'custom' ? customEnd : (getDateRangeFromFilter(dateFilter)?.endDate),
        }}
        filterCount={[search, ownerFilter, closureFilter, followUpFilter, dateFilter].filter(Boolean).length}
      />

      {/* 2. Secondary Filter Bar: Agent, Date, Status */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Grid container spacing={1.5} alignItems="center">
          {user?.role === 'ADMIN' && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Agent</InputLabel>
                <Select
                  value={ownerFilter}
                  label="Agent"
                  onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Agents</MenuItem>
                  <MenuItem value="unassigned">Unassigned Leads</MenuItem>
                  {agents.map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>{agent.fullName || agent.username}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12} sm={6} md={user?.role === 'ADMIN' ? 3 : 4}>
            <FormControl fullWidth size="small">
              <InputLabel>Date</InputLabel>
              <Select
                value={dateFilter}
                label="Date"
                onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Dates</MenuItem>
                {DATE_FILTERS.map((df) => (
                  <MenuItem key={df.value} value={df.value}>{df.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {dateFilter === 'custom' && (
            <>
              <Grid item xs={6} sm={3} md={2}>
                <CalendarDatePicker fullWidth size="small" label="From" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setPage(1); }} />
              </Grid>
              <Grid item xs={6} sm={3} md={2}>
                <CalendarDatePicker fullWidth size="small" label="To" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }} />
              </Grid>
            </>
          )}

          <Grid item xs={12} sm={6} md={user?.role === 'ADMIN' ? 3 : 4}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={closureFilter}
                label="Status"
                onChange={(e) => { setClosureFilter(e.target.value); setPage(1); }}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="OPEN">Open</MenuItem>
                <MenuItem value="WON">Won</MenuItem>
                <MenuItem value="LOST">Lost</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {hasFilters && (
            <Grid item xs={12} sm={6} md={user?.role === 'ADMIN' ? 3 : 4}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleClear}
                fullWidth
                sx={{
                  borderRadius: 2,
                  py: 0.8,
                  textTransform: 'none',
                  borderColor: 'error.main',
                  color: 'error.main',
                  fontWeight: 600,
                  '&:hover': {
                    borderColor: 'error.dark',
                    bgcolor: 'rgba(211, 47, 47, 0.04)',
                  },
                }}
              >
                <Clear fontSize="small" sx={{ mr: 0.5 }} /> Clear Filters
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
        <LeadTable leads={leads} loading={loading} onLeadDeleted={handleLeadDeleted} onLeadUpdated={handleLeadUpdated} />
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
                borderRadius: 1.5,
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
