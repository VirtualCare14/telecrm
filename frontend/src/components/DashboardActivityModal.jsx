import React, { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import {
  Close,
  OpenInNew,
  Search,
  Refresh,
  FileDownload,
  Business,
  FilterAlt,
  Schedule,
  CheckCircle,
  Cancel,
  HelpOutline,
  PhoneInTalk,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useHospitalDetail } from '../context/HospitalDetailContext';
import {
  getDashboardMetricRecords,
  downloadDashboardMetricRecordsExport,
} from '../services/dashboardService';

function getStatusChip(status) {
  const s = String(status || '').toLowerCase();
  let color = 'default';
  let variant = 'outlined';
  let icon = null;

  if (s.includes('done') || s.includes('complete') || s === 'won') {
    color = 'success';
    icon = <CheckCircle sx={{ fontSize: 14 }} />;
  } else if (s.includes('cancel') || s.includes('lost') || s.includes('not done')) {
    color = 'error';
    icon = <Cancel sx={{ fontSize: 14 }} />;
  } else if (s.includes('schedule') || s.includes('follow') || s.includes('open')) {
    color = 'primary';
    icon = <Schedule sx={{ fontSize: 14 }} />;
  } else if (s.includes('overdue')) {
    color = 'error';
  } else {
    color = 'default';
  }

  return (
    <Chip
      size="small"
      label={status || 'Active'}
      color={color}
      icon={icon}
      variant={variant}
      sx={{
        fontWeight: 600,
        fontSize: '0.75rem',
        height: 22,
        borderRadius: 1.5,
      }}
    />
  );
}

function getDispositionChip(disposition) {
  const d = String(disposition || '').toLowerCase();
  let color = 'default';
  let icon = <PhoneInTalk sx={{ fontSize: 13 }} />;

  if (d.includes('connected') || d.includes('interested') || d.includes('demo requested') || d.includes('appointment')) {
    color = 'success';
  } else if (d.includes('not interested') || d.includes('wrong') || d.includes('switched off') || d.includes('cancel')) {
    color = 'error';
  } else if (d.includes('busy') || d.includes('call back') || d.includes('follow-up') || d.includes('no answer') || d.includes('not reachable')) {
    color = 'warning';
  } else if (d.includes('proposal') || d.includes('negotiation')) {
    color = 'info';
  }

  return (
    <Chip
      size="small"
      label={disposition || 'Call'}
      color={color}
      icon={icon}
      variant="outlined"
      sx={{
        fontWeight: 600,
        fontSize: '0.74rem',
        height: 22,
        borderRadius: 1.5,
      }}
    />
  );
}

export default function DashboardActivityModal({
  open,
  onClose,
  metric,
  metricLabel,
  icon,
  color = '#2563eb',
  dateParams,
  dateFilter,
  singleDate,
  selectedMonth,
  customStart,
  customEnd,
  filterAgentId,
  selectedAgentName,
  selectedDateLabel,
}) {
  const navigate = useNavigate();
  const { openHospitalDetail } = useHospitalDetail();
  const isCall = metric === 'calls';

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [uniqueHospitals, setUniqueHospitals] = useState(0);
  const [resolvedDateLabel, setResolvedDateLabel] = useState('');
  const [resolvedAgentLabel, setResolvedAgentLabel] = useState('');
  const [exportLoading, setExportLoading] = useState({ xlsx: false, csv: false });

  const buildQueryParams = useCallback(
    (targetPage = page, targetLimit = rowsPerPage, targetSearch = search) => {
      const params = {
        metric,
        page: targetPage + 1,
        limit: targetLimit,
        ...(dateParams || {}),
      };

      if (dateFilter) {
        if (dateFilter === 'custom') {
          if (customStart) params.startDate = customStart;
          if (customEnd) params.endDate = customEnd;
        } else if (dateFilter === 'single') {
          if (singleDate) {
            params.startDate = singleDate;
            params.endDate = singleDate;
          }
        } else if (dateFilter === 'month') {
          if (selectedMonth) params.month = selectedMonth;
        } else {
          params.dateFilter = dateFilter;
        }
      }

      if (filterAgentId) {
        params.agentId = filterAgentId;
      }

      if (targetSearch && targetSearch.trim()) {
        params.search = targetSearch.trim();
      }

      return params;
    },
    [metric, page, rowsPerPage, search, dateParams, dateFilter, customStart, customEnd, singleDate, selectedMonth, filterAgentId]
  );

  const fetchRecords = useCallback(
    async (targetPage = page, targetLimit = rowsPerPage, targetSearch = search) => {
      if (!open || !metric) return;
      setLoading(true);
      setError(null);
      try {
        const params = buildQueryParams(targetPage, targetLimit, targetSearch);
        const data = await getDashboardMetricRecords(params);
        if (data && data.success) {
          setRecords(data.records || []);
          setTotalRecords(data.totalRecords || 0);
          setUniqueHospitals(data.uniqueHospitals || 0);
          setResolvedDateLabel(data.dateLabel || selectedDateLabel || 'All Time');
          setResolvedAgentLabel(data.agentLabel || selectedAgentName || 'All Agents');
        } else {
          setRecords([]);
          setTotalRecords(0);
          setUniqueHospitals(0);
        }
      } catch (err) {
        console.error('Error fetching dashboard metric records:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load activity records');
      } finally {
        setLoading(false);
      }
    },
    [open, metric, buildQueryParams, page, rowsPerPage, search, selectedDateLabel, selectedAgentName]
  );

  // Re-fetch when modal opens or key filter inputs change
  useEffect(() => {
    if (open) {
      setPage(0);
      setSearch('');
      fetchRecords(0, rowsPerPage, '');
    }
  }, [open, metric, dateFilter, customStart, customEnd, singleDate, selectedMonth, filterAgentId, JSON.stringify(dateParams)]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    setPage(0);
    fetchRecords(0, rowsPerPage, val);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    fetchRecords(newPage, rowsPerPage, search);
  };

  const handleChangeRowsPerPage = (event) => {
    const newLimit = parseInt(event.target.value, 10);
    setRowsPerPage(newLimit);
    setPage(0);
    fetchRecords(0, newLimit, search);
  };

  const handleExport = async (format) => {
    setExportLoading((prev) => ({ ...prev, [format]: true }));
    try {
      const params = buildQueryParams(0, 10000, search);
      const res = await downloadDashboardMetricRecordsExport(params, format);

      const blob = new Blob([res.data], {
        type:
          format === 'csv'
            ? 'text/csv;charset=utf-8;'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${metric}_records_${new Date().toISOString().slice(0, 10)}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExportLoading((prev) => ({ ...prev, [format]: false }));
    }
  };

  const handleOpenLead = (leadId) => {
    if (!leadId) return;
    onClose();
    openHospitalDetail(leadId);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        },
      }}
    >
      {/* Modal Header */}
      <DialogTitle
        sx={{
          p: 2,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}15`,
              color: color,
              border: `1px solid ${color}35`,
            }}
          >
            {icon || <Business />}
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', fontSize: '1.15rem' }}>
                {metricLabel || 'Activity'} Records
              </Typography>
              <Chip
                id="activity-modal-header-date"
                label={resolvedDateLabel || selectedDateLabel || 'All Time'}
                size="small"
                sx={{
                  bgcolor: `${color}15`,
                  color: color,
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: 22,
                  border: `1px solid ${color}35`,
                }}
              />
              <Chip
                id="activity-modal-total-count"
                label={`${totalRecords} ${totalRecords === 1 ? 'Record' : 'Records'}`}
                size="small"
                sx={{
                  bgcolor: `${color}15`,
                  color: color,
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: 22,
                  border: `1px solid ${color}30`,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              Showing matching records for <b>{resolvedDateLabel || selectedDateLabel || 'All Time'}</b> • Agent: <b>{resolvedAgentLabel || selectedAgentName || 'All Agents'}</b>
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh List">
            <IconButton
              size="small"
              onClick={() => fetchRecords(page, rowsPerPage, search)}
              disabled={loading}
              sx={{ color: 'text.secondary' }}
            >
              <Refresh sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
            }}
          >
            <Close sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* Active Filter Context Banner */}
      <Box
        sx={{
          px: 2.5,
          py: 1.25,
          bgcolor: 'action.hover',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <FilterAlt sx={{ fontSize: 16 }} />
            <Typography variant="caption" fontWeight={600}>
              Active Dashboard Filters:
            </Typography>
          </Box>
          <Chip
            size="small"
            label={`Date: ${resolvedDateLabel || selectedDateLabel || 'All Time'}`}
            sx={{
              height: 24,
              fontSize: '0.73rem',
              fontWeight: 600,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
          <Chip
            size="small"
            label={`Agent: ${resolvedAgentLabel || selectedAgentName || 'All Agents'}`}
            sx={{
              height: 24,
              fontSize: '0.73rem',
              fontWeight: 600,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
          {uniqueHospitals > 0 && (
            <Chip
              size="small"
              label={`${uniqueHospitals} Unique Hospitals`}
              sx={{
                height: 24,
                fontSize: '0.73rem',
                fontWeight: 600,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            />
          )}
        </Box>

        {/* Export Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              exportLoading.xlsx ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <FileDownload sx={{ fontSize: 16 }} />
              )
            }
            onClick={() => handleExport('xlsx')}
            disabled={loading || totalRecords === 0 || exportLoading.xlsx}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              fontSize: '0.75rem',
              py: 0.5,
              px: 1.25,
            }}
          >
            Excel
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              exportLoading.csv ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <FileDownload sx={{ fontSize: 16 }} />
              )
            }
            onClick={() => handleExport('csv')}
            disabled={loading || totalRecords === 0 || exportLoading.csv}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              fontSize: '0.75rem',
              py: 0.5,
              px: 1.25,
            }}
          >
            CSV
          </Button>
        </Box>
      </Box>

      {/* Search Input Bar */}
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          id="activity-modal-search"
          size="small"
          placeholder="Filter by hospital name, lead ID, agent, remarks..."
          value={search}
          onChange={handleSearchChange}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            sx: { borderRadius: 2, fontSize: '0.85rem' },
          }}
        />
      </Box>

      {/* Content Area / Table */}
      <DialogContent sx={{ p: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Box sx={{ p: 2 }}>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => fetchRecords(page, rowsPerPage, search)}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          </Box>
        )}

        <TableContainer sx={{ flex: 1, maxHeight: 'calc(90vh - 280px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', width: 45 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 200 }}>Hospital Name</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 90 }}>Lead ID</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 160 }}>
                  {isCall ? 'Call Date & Time (IST)' : 'Date & Time (IST)'}
                </TableCell>
                {isCall && (
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 130 }}>Contact Number</TableCell>
                )}
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 140 }}>
                  {isCall ? 'Caller / Agent' : 'Assigned Agent'}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 130 }}>
                  {isCall ? 'Call Disposition' : 'Scheduled By'}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 100 }}>
                  {isCall ? 'Lead Status' : 'Status'}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 180 }}>
                  {isCall ? 'Call Remarks / Notes' : 'Remarks / Notes'}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 70, textAlign: 'center' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from(new Array(rowsPerPage > 10 ? 10 : rowsPerPage)).map((_, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Skeleton width={20} /></TableCell>
                    <TableCell><Skeleton width={180} /></TableCell>
                    <TableCell><Skeleton width={60} /></TableCell>
                    <TableCell><Skeleton width={110} /></TableCell>
                    {isCall && <TableCell><Skeleton width={90} /></TableCell>}
                    <TableCell><Skeleton width={80} /></TableCell>
                    <TableCell><Skeleton width={120} /></TableCell>
                    <TableCell><Skeleton width={100} /></TableCell>
                    <TableCell><Skeleton width={150} /></TableCell>
                    <TableCell><Skeleton width={40} /></TableCell>
                  </TableRow>
                ))
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isCall ? 10 : 9} sx={{ py: 6, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <HelpOutline sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.5 }} />
                      <Typography variant="body2" fontWeight={600} color="text.secondary">
                        {isCall ? 'No call records found' : 'No activity records found'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        No records match the current filter criteria ({resolvedDateLabel || selectedDateLabel}).
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((row, idx) => {
                  const rowIndex = page * rowsPerPage + idx + 1;
                  return (
                    <TableRow
                      key={row.id || idx}
                      hover
                      sx={{
                        '&:hover': { bgcolor: 'action.hover' },
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {rowIndex}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Click to view Lead Details">
                          <Box
                            onClick={() => handleOpenLead(row.leadId)}
                            sx={{
                              cursor: row.leadId ? 'pointer' : 'default',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              color: row.leadId ? 'primary.main' : 'text.primary',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              '&:hover': row.leadId ? { textDecoration: 'underline' } : {},
                            }}
                          >
                            <Business sx={{ fontSize: 16, opacity: 0.7 }} />
                            <span>{row.hospitalName || '—'}</span>
                          </Box>
                        </Tooltip>
                        {row.contactName && row.contactName !== 'N/A' && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.72rem' }}>
                            Contact: {row.contactName}
                          </Typography>
                        )}
                        {!isCall && row.contactPhone && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.72rem' }}>
                            {row.contactPhone}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.leadId ? (
                          <Chip
                            label={`#${row.leadNumber || row.leadId.slice(-5)}`}
                            size="small"
                            onClick={() => handleOpenLead(row.leadId)}
                            sx={{
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '0.72rem',
                              height: 22,
                              bgcolor: 'action.hover',
                              '&:hover': { bgcolor: 'action.selected' },
                            }}
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {row.dateFormatted || '—'}
                        </Typography>
                        {row.time && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                            {row.time}
                          </Typography>
                        )}
                      </TableCell>
                      {isCall && (
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {row.contactPhone && row.contactPhone !== 'N/A' ? (
                            <Chip
                              size="small"
                              icon={<PhoneInTalk sx={{ fontSize: 13 }} />}
                              label={row.contactPhone}
                              variant="outlined"
                              sx={{
                                fontWeight: 500,
                                fontSize: '0.74rem',
                                height: 22,
                                color: 'text.primary',
                                borderColor: 'divider',
                              }}
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      )}
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {row.callerName || row.assignedAgent || 'Unassigned'}
                        </Typography>
                        {row.assignedRole && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                            {row.assignedRole}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {isCall
                          ? getDispositionChip(row.disposition || row.scheduledBy)
                          : (row.scheduledBy || '—')}
                      </TableCell>
                      <TableCell>
                        {getStatusChip(row.leadStatus || row.status)}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', maxWidth: 220 }}>
                        <Tooltip title={row.remarks || ''}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: row.remarks ? 'text.primary' : 'text.disabled',
                            }}
                          >
                            {row.remarks || '—'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        {row.leadId ? (
                          <Tooltip title="View Lead Details">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenLead(row.leadId)}
                              sx={{
                                color: 'primary.main',
                                bgcolor: 'primary.lighter',
                                '&:hover': { bgcolor: 'primary.light', color: 'primary.dark' },
                              }}
                            >
                              <OpenInNew sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Footer */}
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={totalRecords}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
              fontSize: '0.8rem',
            },
          }}
        />
      </DialogContent>

      {/* Dialog Footer Actions */}
      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button
          onClick={onClose}
          variant="outlined"
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            color: 'text.secondary',
            borderColor: 'divider',
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
