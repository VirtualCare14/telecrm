import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Tooltip,
  Skeleton,
  Divider,
  Stack,
  Link,
} from '@mui/material';
import {
  Close,
  Search as SearchIcon,
  Clear,
  Refresh as RefreshIcon,
  Business as BusinessIcon,
  Whatshot,
  AcUnit,
  PhoneInTalk,
  Phone as PhoneIcon,
  Person as PersonIcon,
  Event as EventIcon,
  Schedule as ScheduleIcon,
  CheckCircle,
  Cancel,
  OpenInNew,
} from '@mui/icons-material';
import { useHospitalDetail } from '../context/HospitalDetailContext';
import { listLeads } from '../services/leadsService';
import { formatDate, formatTime, getFollowUpStatus } from '../utils/dateHelpers';

const CATEGORY_CONFIG = {
  all: {
    key: 'all',
    title: 'All Hospital Leads',
    shortLabel: 'All Leads',
    apiTemp: '',
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.08)',
    border: 'rgba(234, 88, 12, 0.28)',
    icon: <BusinessIcon sx={{ color: '#ea580c', fontSize: 24 }} />,
  },
  total: {
    key: 'all',
    title: 'All Hospital Leads',
    shortLabel: 'All Leads',
    apiTemp: '',
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.08)',
    border: 'rgba(234, 88, 12, 0.28)',
    icon: <BusinessIcon sx={{ color: '#ea580c', fontSize: 24 }} />,
  },
  hot: {
    key: 'hot',
    title: 'Hot Hospital Leads',
    shortLabel: 'Hot Leads',
    apiTemp: 'Hot',
    color: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.28)',
    icon: <Whatshot sx={{ color: '#dc2626', fontSize: 24 }} />,
  },
  warm: {
    key: 'warm',
    title: 'Warm Hospital Leads',
    shortLabel: 'Warm Leads',
    apiTemp: 'Warm',
    color: '#c2410c',
    bg: 'rgba(234, 88, 12, 0.08)',
    border: 'rgba(234, 88, 12, 0.28)',
    icon: <Typography component="span" sx={{ fontSize: 20, lineHeight: 1 }}>🟠</Typography>,
  },
  cold: {
    key: 'cold',
    title: 'Cold Hospital Leads',
    shortLabel: 'Cold Leads',
    apiTemp: 'Cold',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.08)',
    border: 'rgba(2, 132, 199, 0.28)',
    icon: <AcUnit sx={{ color: '#0284c7', fontSize: 24 }} />,
  },
};

export default function LeadCategoryListingModal({
  open,
  onClose,
  category = 'all',
  onSelectCategory,
  filterAgentId,
  counts = {},
}) {
  const { openHospitalDetail } = useHospitalDetail();

  const [activeCategory, setActiveCategory] = useState(() => (category || 'all').toLowerCase());
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Synchronize internal activeCategory when the prop changes
  useEffect(() => {
    const nextCat = (category || 'all').toLowerCase();
    setActiveCategory(nextCat === 'total' ? 'all' : nextCat);
    setPage(1);
  }, [category]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const currentConfig = useMemo(() => {
    const key = (activeCategory || 'all').toLowerCase();
    return CATEGORY_CONFIG[key] || CATEGORY_CONFIG.all;
  }, [activeCategory]);

  const fetchCategoryLeads = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      if (currentConfig.apiTemp) {
        params.temperature = currentConfig.apiTemp;
      }

      if (filterAgentId) {
        params.owner = filterAgentId;
      }

      const res = await listLeads(params);
      setLeads(res.leads || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load category leads:', err);
      setError(err.response?.data?.message || 'Failed to load hospital records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [open, page, limit, debouncedSearch, currentConfig, filterAgentId]);

  useEffect(() => {
    fetchCategoryLeads();
  }, [fetchCategoryLeads]);

  // Listen for background updates
  useEffect(() => {
    const handleUpdate = () => {
      if (open) {
        fetchCategoryLeads();
      }
    };
    window.addEventListener('telecrm:lead-updated', handleUpdate);
    return () => window.removeEventListener('telecrm:lead-updated', handleUpdate);
  }, [open, fetchCategoryLeads]);

  const handleCategorySwitch = (newCat) => {
    const cleanCat = newCat === 'total' ? 'all' : newCat;
    setActiveCategory(cleanCat);
    setPage(1);
    if (onSelectCategory) {
      onSelectCategory(cleanCat);
    }
  };

  const handleHospitalClick = (lead) => {
    openHospitalDetail(lead._id, lead);
  };

  const handleClearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        },
      }}
    >
      {/* ===================== MODAL HEADER ===================== */}
      <DialogTitle
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          {/* Left: Icon, Dynamic Title & Count */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: currentConfig.bg,
                border: `1px solid ${currentConfig.border}`,
                flexShrink: 0,
              }}
            >
              {currentConfig.icon}
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                  {currentConfig.title}
                </Typography>
                <Chip
                  label={`${total} ${total === 1 ? 'Record' : 'Records'}`}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    bgcolor: currentConfig.bg,
                    color: currentConfig.color,
                    border: `1px solid ${currentConfig.border}`,
                    height: 24,
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25 }}>
                Categorized hospital listings with contact details and follow-up status
              </Typography>
            </Box>
          </Box>

          {/* Right: Category Switcher Pills & Close Button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Chip
                label={`All (${counts.totalLeads ?? '—'})`}
                onClick={() => handleCategorySwitch('all')}
                variant={activeCategory === 'all' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderColor: '#ea580c',
                  color: activeCategory === 'all' ? '#ffffff' : '#ea580c',
                  bgcolor: activeCategory === 'all' ? '#ea580c' : 'transparent',
                  '&:hover': { bgcolor: activeCategory === 'all' ? '#c2410c' : 'rgba(234, 88, 12, 0.08)' },
                }}
                size="small"
              />
              <Chip
                label={`🔥 Hot (${counts.hotLeads ?? '—'})`}
                onClick={() => handleCategorySwitch('hot')}
                variant={activeCategory === 'hot' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderColor: '#dc2626',
                  color: activeCategory === 'hot' ? '#ffffff' : '#dc2626',
                  bgcolor: activeCategory === 'hot' ? '#dc2626' : 'transparent',
                  '&:hover': { bgcolor: activeCategory === 'hot' ? '#b91c1c' : 'rgba(239, 68, 68, 0.08)' },
                }}
                size="small"
              />
              <Chip
                label={`🟠 Warm (${counts.warmLeads ?? '—'})`}
                onClick={() => handleCategorySwitch('warm')}
                variant={activeCategory === 'warm' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderColor: '#c2410c',
                  color: activeCategory === 'warm' ? '#ffffff' : '#c2410c',
                  bgcolor: activeCategory === 'warm' ? '#c2410c' : 'transparent',
                  '&:hover': { bgcolor: activeCategory === 'warm' ? '#9a3412' : 'rgba(234, 88, 12, 0.08)' },
                }}
                size="small"
              />
              <Chip
                label={`❄️ Cold (${counts.coldLeads ?? '—'})`}
                onClick={() => handleCategorySwitch('cold')}
                variant={activeCategory === 'cold' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderColor: '#0284c7',
                  color: activeCategory === 'cold' ? '#ffffff' : '#0284c7',
                  bgcolor: activeCategory === 'cold' ? '#0284c7' : 'transparent',
                  '&:hover': { bgcolor: activeCategory === 'cold' ? '#0369a1' : 'rgba(2, 132, 199, 0.08)' },
                }}
                size="small"
              />
            </Stack>

            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: '#64748b',
                bgcolor: '#f1f5f9',
                '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' },
              }}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Mobile Category Switcher Pills */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 0.75, mt: 1.5, overflowX: 'auto', pb: 0.5 }}>
          <Chip
            label="All"
            onClick={() => handleCategorySwitch('all')}
            variant={activeCategory === 'all' ? 'filled' : 'outlined'}
            size="small"
            sx={{ fontWeight: 700, color: activeCategory === 'all' ? '#fff' : '#ea580c', bgcolor: activeCategory === 'all' ? '#ea580c' : 'transparent' }}
          />
          <Chip
            label="🔥 Hot"
            onClick={() => handleCategorySwitch('hot')}
            variant={activeCategory === 'hot' ? 'filled' : 'outlined'}
            size="small"
            sx={{ fontWeight: 700, color: activeCategory === 'hot' ? '#fff' : '#dc2626', bgcolor: activeCategory === 'hot' ? '#dc2626' : 'transparent' }}
          />
          <Chip
            label="🟠 Warm"
            onClick={() => handleCategorySwitch('warm')}
            variant={activeCategory === 'warm' ? 'filled' : 'outlined'}
            size="small"
            sx={{ fontWeight: 700, color: activeCategory === 'warm' ? '#fff' : '#c2410c', bgcolor: activeCategory === 'warm' ? '#c2410c' : 'transparent' }}
          />
          <Chip
            label="❄️ Cold"
            onClick={() => handleCategorySwitch('cold')}
            variant={activeCategory === 'cold' ? 'filled' : 'outlined'}
            size="small"
            sx={{ fontWeight: 700, color: activeCategory === 'cold' ? '#fff' : '#0284c7', bgcolor: activeCategory === 'cold' ? '#0284c7' : 'transparent' }}
          />
        </Box>
      </DialogTitle>

      {/* ===================== TOOLBAR (SEARCH & REFRESH) ===================== */}
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          bgcolor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <TextField
          size="small"
          placeholder="Search within listing (hospital, contact, phone)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#ea580c', fontSize: 19 }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch} edge="end">
                  <Clear fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            width: { xs: '100%', sm: 380 },
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: '#ffffff',
              fontSize: '0.875rem',
            },
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} sx={{ color: '#475569' }} /> : <RefreshIcon sx={{ fontSize: 17 }} />}
            onClick={fetchCategoryLeads}
            disabled={loading}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: '#475569',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              fontSize: '0.85rem',
              '&:hover': { borderColor: '#ea580c', color: '#ea580c', bgcolor: 'rgba(234, 88, 12, 0.04)' },
            }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* ===================== MODAL CONTENT & TABLE ===================== */}
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Alert severity="error" sx={{ m: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <TableContainer sx={{ flex: '1 1 auto', maxHeight: 'calc(85vh - 240px)' }}>
          <Table stickyHeader sx={{ minWidth: 950 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Hospital / Organization
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Lead ID
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Contact Person
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Contact Number
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Lead Temperature
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Latest Disposition
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Assigned Owner
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', bgcolor: '#f1f5f9', color: '#475569', py: 1.25 }}>
                  Follow-up Status
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    <TableCell><Skeleton width={180} height={24} /></TableCell>
                    <TableCell><Skeleton width={70} height={24} /></TableCell>
                    <TableCell><Skeleton width={120} height={24} /></TableCell>
                    <TableCell><Skeleton width={110} height={24} /></TableCell>
                    <TableCell><Skeleton width={80} height={24} /></TableCell>
                    <TableCell><Skeleton width={120} height={24} /></TableCell>
                    <TableCell><Skeleton width={110} height={24} /></TableCell>
                    <TableCell><Skeleton width={100} height={24} /></TableCell>
                  </TableRow>
                ))
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center' }}>
                    <Box sx={{ maxWidth: 360, mx: 'auto' }}>
                      <BusinessIcon sx={{ fontSize: 44, color: '#cbd5e1', mb: 1 }} />
                      <Typography variant="body1" fontWeight={700} sx={{ color: '#475569' }}>
                        No {currentConfig.title.toLowerCase()} found
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.5 }}>
                        {debouncedSearch
                          ? `No records matching "${debouncedSearch}" in this category.`
                          : 'There are currently no hospital records matching this classification.'}
                      </Typography>
                      {debouncedSearch && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleClearSearch}
                          sx={{ mt: 1.5, borderRadius: 2, textTransform: 'none', fontSize: '0.8rem' }}
                        >
                          Clear Search
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const contact = lead.primaryContact || (lead.contacts && lead.contacts[0]) || {};
                  const contactName = contact.name || lead.contactPersonName || '—';
                  const contactPhone = contact.phone || lead.phone || '—';
                  const leadIdText = lead.leadNumber ? `#${lead.leadNumber}` : `#${lead._id.slice(-5)}`;
                  const temp = (lead.leadTemperature || lead.temperature || '').toLowerCase();
                  const ownerName = lead.currentOwner?.fullName || lead.currentOwner?.username || lead.assignedToName || 'Unassigned';

                  const followUpInfo = getFollowUpStatus(lead.nextFollowUpAt, lead.closureStatus);

                  return (
                    <TableRow
                      key={lead._id}
                      hover
                      sx={{
                        '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.03)' },
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Hospital Name (Clickable -> Opens Hospital Details Drawer) */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Link
                          component="button"
                          variant="body2"
                          onClick={() => handleHospitalClick(lead)}
                          sx={{
                            fontWeight: 700,
                            color: '#0f172a',
                            textAlign: 'left',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            textDecoration: 'none',
                            '&:hover': { color: '#ea580c', textDecoration: 'underline' },
                          }}
                        >
                          <BusinessIcon sx={{ fontSize: 16, color: '#ea580c', flexShrink: 0 }} />
                          <span>{lead.organizationName}</span>
                          <OpenInNew sx={{ fontSize: 13, color: '#94a3b8', ml: 0.25 }} />
                        </Link>
                      </TableCell>

                      {/* Lead ID */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={leadIdText}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            bgcolor: '#f1f5f9',
                            color: '#475569',
                          }}
                        />
                      </TableCell>

                      {/* Contact Person */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                          {contactName}
                        </Typography>
                      </TableCell>

                      {/* Contact Number */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PhoneIcon sx={{ fontSize: 14, color: '#64748b' }} />
                          <Typography variant="body2" sx={{ color: '#475569', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                            {contactPhone}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Lead Temperature */}
                      <TableCell sx={{ py: 1.25 }}>
                        {temp === 'hot' ? (
                          <Chip
                            label="🔥 Hot"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              bgcolor: 'rgba(239, 68, 68, 0.1)',
                              color: '#dc2626',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                            }}
                          />
                        ) : temp === 'warm' ? (
                          <Chip
                            label="🟠 Warm"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              bgcolor: 'rgba(234, 88, 12, 0.1)',
                              color: '#c2410c',
                              border: '1px solid rgba(234, 88, 12, 0.3)',
                            }}
                          />
                        ) : temp === 'cold' ? (
                          <Chip
                            label="❄️ Cold"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              bgcolor: 'rgba(2, 132, 199, 0.1)',
                              color: '#0284c7',
                              border: '1px solid rgba(2, 132, 199, 0.3)',
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* Latest Disposition */}
                      <TableCell sx={{ py: 1.25 }}>
                        {lead.latestDisposition ? (
                          <Chip
                            label={lead.latestDisposition}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              borderColor: '#cbd5e1',
                              color: '#334155',
                              bgcolor: '#ffffff',
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* Assigned Owner */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PersonIcon sx={{ fontSize: 14, color: '#64748b' }} />
                          <Typography variant="body2" sx={{ color: '#334155', fontSize: '0.82rem', fontWeight: 500 }}>
                            {ownerName}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Follow-up Status */}
                      <TableCell sx={{ py: 1.25 }}>
                        {lead.nextFollowUpAt ? (
                          <Box>
                            <Chip
                              label={followUpInfo.label}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                bgcolor: followUpInfo.bg,
                                color: followUpInfo.color,
                                border: `1px solid ${followUpInfo.border}`,
                                mb: 0.25,
                              }}
                            />
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>
                              {formatDate(lead.nextFollowUpAt)} {formatTime(lead.nextFollowUpAt)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                            None scheduled
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ===================== PAGINATION ===================== */}
        <TablePagination
          component="div"
          count={total}
          page={page - 1}
          onPageChange={(_, newPage) => setPage(newPage + 1)}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => {
            setLimit(parseInt(e.target.value, 10));
            setPage(1);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
          sx={{
            borderTop: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
            flexShrink: 0,
          }}
        />
      </DialogContent>

      {/* ===================== DIALOG ACTIONS ===================== */}
      <DialogActions sx={{ px: 2.5, py: 1.5, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: '#64748b' }}>
          Showing <strong>{leads.length}</strong> of <strong>{total}</strong> {currentConfig.shortLabel.toLowerCase()}
        </Typography>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            bgcolor: '#ea580c',
            borderRadius: 2,
            px: 2.5,
            py: 0.65,
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': { bgcolor: '#c2410c' },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

