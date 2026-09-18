import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Button, Alert, Grid, Paper, Chip, CircularProgress,
  Tab, Tabs, FormControl, InputLabel, Select, MenuItem, Checkbox,
  List, ListItem, ListItemText, ListItemIcon, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, InputAdornment, Avatar, Tooltip, IconButton
} from '@mui/material';
import {
  CheckCircle, Cancel, ArrowBack, TransferWithinAStation, SwapHoriz,
  Search as SearchIcon, Clear, Visibility, History,
  Person, Comment as CommentIcon
} from '@mui/icons-material';
import {
  incomingRequests, outgoingRequests, approveRequest, rejectRequest,
  cancelRequest, getTransferHistory
} from '../services/transferService';
import { getAgents } from '../services/agentService';
import { listLeads } from '../services/leadsService';
import { bulkTransferLeads } from '../services/adminService';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { formatDateTime } from '../utils/dateHelpers';

export default function TransferRequests() {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0); // 0 = Transfer History, 1 = Incoming, 2 = Outgoing
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  // Bulk transfer state (Admin only)
  const [agents, setAgents] = useState([]);
  const [fromAgentId, setFromAgentId] = useState('');
  const [toAgentId, setToAgentId] = useState('');
  const [sourceLeads, setSourceLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkSuccess, setBulkSuccess] = useState(null);

  const fetchRequestsAndHistory = async () => {
    setLoading(true);
    setHistoryLoading(true);
    setError(null);
    try {
      const [incomingData, outgoingData, historyData] = await Promise.all([
        incomingRequests().catch(() => []),
        outgoingRequests().catch(() => []),
        getTransferHistory().catch(() => ({ transfers: [] }))
      ]);
      setIncoming(incomingData || []);
      setOutgoing(outgoingData || []);
      setHistory(historyData?.transfers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load transfer data');
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestsAndHistory();
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      const loadAgents = async () => {
        try { setAgents(await getAgents()); } catch (e) { console.error(e); }
      };
      loadAgents();
    }
  }, [user]);

  useEffect(() => {
    if (!fromAgentId) { setSourceLeads([]); setSelectedLeadIds([]); return; }
    const fetchSourceLeads = async () => {
      setLoadingLeads(true);
      try {
        const data = await listLeads({ owner: fromAgentId, limit: 100 });
        setSourceLeads(data.leads || []);
        setSelectedLeadIds([]);
      } catch (e) { console.error(e); }
      finally { setLoadingLeads(false); }
    };
    fetchSourceLeads();
  }, [fromAgentId]);

  const handleToggleLead = (leadId) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    if (sourceLeads.length > 0 && selectedLeadIds.length === sourceLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(sourceLeads.map((l) => l._id));
    }
  };

  const handleBulkTransfer = async () => {
    setBulkLoading(true); setBulkError(null); setBulkSuccess(null);
    try {
      const payload = { fromAgentId, toAgentId };
      if (selectedLeadIds.length > 0) payload.leadIds = selectedLeadIds;
      const result = await bulkTransferLeads(payload);
      setBulkSuccess(`Transferred ${result.count} lead(s) successfully.`);
      if (fromAgentId) {
        const data = await listLeads({ owner: fromAgentId, limit: 100 });
        setSourceLeads(data.leads || []);
      }
      setSelectedLeadIds([]);
      fetchRequestsAndHistory();
    } catch (err) {
      setBulkError(err.response?.data?.message || 'Unable to perform bulk transfer');
    } finally { setBulkLoading(false); }
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await approveRequest(id);
      await fetchRequestsAndHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to approve');
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      await rejectRequest(id);
      await fetchRequestsAndHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reject');
    } finally {
      setActionLoading('');
    }
  };

  const handleCancel = async (id) => {
    setActionLoading(id);
    try {
      await cancelRequest(id);
      await fetchRequestsAndHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to cancel');
    } finally {
      setActionLoading('');
    }
  };

  // Filter transfer history by search query
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.trim().toLowerCase();
    return history.filter((t) =>
      (t.organizationName && t.organizationName.toLowerCase().includes(q)) ||
      (t.leadNumber && t.leadNumber.toLowerCase().includes(q)) ||
      (t.previousOwner && t.previousOwner.toLowerCase().includes(q)) ||
      (t.transferredTo && t.transferredTo.toLowerCase().includes(q)) ||
      (t.transferredBy && t.transferredBy.toLowerCase().includes(q)) ||
      (t.currentOwner && t.currentOwner.toLowerCase().includes(q)) ||
      (t.reason && t.reason.toLowerCase().includes(q)) ||
      (t.status && t.status.toLowerCase().includes(q))
    );
  }, [history, searchQuery]);

  const renderRequest = (request, isIncoming) => {
    const statusColors = { Pending: 'warning', Approved: 'success', Rejected: 'error', Cancelled: 'default' };
    return (
      <Paper
        key={request._id}
        elevation={0}
        sx={{
          p: 2,
          mb: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderLeft: '4px solid',
          borderLeftColor: request.status === 'Pending' ? 'warning.main' : request.status === 'Approved' ? 'success.main' : 'error.main'
        }}
      >
        <Grid container spacing={1}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {request.lead?.organizationName || 'Unknown'}
              </Typography>
              <Chip label={`#${request.lead?.leadNumber || '—'}`} size="small" sx={{ height: 20, fontSize: 11 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {isIncoming
                ? `From: ${request.fromAgent?.fullName || request.fromAgent?.username || '—'}`
                : `To: ${request.toAgent?.fullName || request.toAgent?.username || '—'}`}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Box><Chip label={request.status} size="small" color={statusColors[request.status] || 'default'} sx={{ fontWeight: 600 }} /></Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">Requested</Typography>
            <Typography variant="body2">{formatDateTime(request.requestedAt)}</Typography>
          </Grid>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              {isIncoming && request.status === 'Pending' && (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircle />}
                    disabled={actionLoading === request._id}
                    onClick={() => handleApprove(request._id)}
                    sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}
                  >
                    {actionLoading === request._id ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<Cancel />}
                    disabled={actionLoading === request._id}
                    onClick={() => handleReject(request._id)}
                    sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}
                  >
                    {actionLoading === request._id ? 'Rejecting...' : 'Reject'}
                  </Button>
                </>
              )}
              {!isIncoming && request.status === 'Pending' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={actionLoading === request._id}
                  onClick={() => handleCancel(request._id)}
                  sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}
                >
                  {actionLoading === request._id ? 'Cancelling...' : 'Cancel'}
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
    );
  };

  const selectedFromAgent = agents.find((a) => a._id === fromAgentId);
  const selectedAgentName = selectedFromAgent?.fullName || selectedFromAgent?.username || 'Selected agent';
  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate(-1)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.08)' }
            }}
          >
            Back
          </Button>
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SwapHoriz sx={{ fontSize: 32, color: 'primary.main' }} />
              Transfer Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isAdmin ? 'Complete audit trail of all lead transfers across the system' : 'Track leads transferred by you and their current status'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {bulkSuccess && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBulkSuccess(null)}>{bulkSuccess}</Alert>}
      {bulkError && bulkError !== 'No leads found for transfer' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBulkError(null)}>{bulkError}</Alert>}

      {/* Bulk Transfer Section - Admin Only */}
      {isAdmin && (
        <Paper elevation={0} sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TransferWithinAStation sx={{ color: 'primary.main' }} /> Admin Bulk Transfer
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>From Agent</InputLabel>
                <Select value={fromAgentId} label="From Agent" onChange={(e) => setFromAgentId(e.target.value)} sx={{ borderRadius: 2 }}>
                  <MenuItem value="">Select agent</MenuItem>
                  {agents.map((a) => (<MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>To Agent</InputLabel>
                <Select value={toAgentId} label="To Agent" onChange={(e) => setToAgentId(e.target.value)} sx={{ borderRadius: 2 }}>
                  <MenuItem value="">Select agent</MenuItem>
                  {agents.filter((a) => a._id !== fromAgentId).map((a) => (<MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button
                variant="contained"
                disabled={!fromAgentId || !toAgentId || bulkLoading || sourceLeads.length === 0}
                onClick={handleBulkTransfer}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                  '&:hover': {
                    boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)'
                  }
                }}
              >
                {bulkLoading ? 'Transferring...' : 'Execute Bulk Transfer'}
              </Button>
            </Grid>
          </Grid>

          <Paper elevation={0} sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
            {loadingLeads ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
            ) : !fromAgentId ? (
              <Box sx={{ py: 2, textAlign: 'center' }}>
                <Typography color="text.secondary" variant="body2">Select an agent to view transferable leads.</Typography>
              </Box>
            ) : sourceLeads.length === 0 ? (
              <Box sx={{ py: 2, px: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedAgentName} currently has no active leads available for transfer.
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, mb: 1, borderBottom: '1px solid', borderColor: 'divider', px: 0.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={sourceLeads.length > 0 && selectedLeadIds.length === sourceLeads.length}
                        indeterminate={selectedLeadIds.length > 0 && selectedLeadIds.length < sourceLeads.length}
                        onChange={handleSelectAll}
                        sx={{ p: 0.5, mr: 0.5 }}
                      />
                    }
                    label={<Typography variant="body2" fontWeight={600} color="text.primary">Select All</Typography>}
                    sx={{ m: 0 }}
                  />
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {selectedLeadIds.length} of {sourceLeads.length} leads selected
                  </Typography>
                </Box>
                <List dense sx={{ p: 0 }}>
                  {sourceLeads.map((lead) => (
                    <ListItem key={lead._id} button onClick={() => handleToggleLead(lead._id)} sx={{ '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.04)' }, borderRadius: 1 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" checked={selectedLeadIds.includes(lead._id)} size="small" />
                      </ListItemIcon>
                      <ListItemText primary={`${lead.organizationName} (#${lead.leadNumber})`} secondary={lead.primaryContact?.name || ''} />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Paper>
        </Paper>
      )}

      {/* Main Tabs Container */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            bgcolor: 'background.paper',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              minHeight: 52,
              '&.Mui-selected': {
                color: 'primary.main',
              }
            }
          }}
        >
          <Tab
            icon={<History sx={{ fontSize: 18, mr: 0.75 }} />}
            iconPosition="start"
            label={`Transfer History (${history.length})`}
          />
          <Tab
            label={`Incoming Requests (${incoming.length})`}
          />
          <Tab
            label={`Outgoing Requests (${outgoing.length})`}
          />
        </Tabs>

        {/* TAB 0: TRANSFER HISTORY */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            {/* Search & Stats Bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
              <TextField
                size="small"
                placeholder="Search by Lead, Agent, Reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ width: { xs: '100%', sm: 320 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery('')}>
                        <Clear sx={{ fontSize: 18 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                  sx: { borderRadius: 2 }
                }}
              />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Showing {filteredHistory.length} {filteredHistory.length === 1 ? 'transfer' : 'transfers'}
              </Typography>
            </Box>

            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : filteredHistory.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <SwapHoriz sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.4, mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  No transfer records found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {searchQuery ? 'Try clearing your search query to see all transfers.' : 'No lead transfers have been recorded yet.'}
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: 'rgba(234, 88, 12, 0.04)' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Lead / Organization</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Transferred From</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Transferred To</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Transferred By</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Date & Time</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Reason / Remarks</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Current Owner</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13 }}>Status</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 13 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredHistory.map((item, index) => {
                      return (
                        <TableRow
                          key={item.id || `transfer-${index}`}
                          sx={{
                            '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.02)' },
                            transition: 'background-color 0.15s'
                          }}
                        >
                          {/* 1. Lead / Organization */}
                          <TableCell sx={{ py: 2 }}>
                            <Box>
                              <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{
                                  color: 'text.primary',
                                  cursor: 'pointer',
                                  '&:hover': { color: 'primary.main', textDecoration: 'underline' }
                                }}
                                onClick={() => navigate(`/leads/${item.leadId}`)}
                              >
                                {item.organizationName || 'Unknown Lead'}
                              </Typography>
                              <Chip
                                label={`#${item.leadNumber || '—'}`}
                                size="small"
                                sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(15, 23, 42, 0.08)', mt: 0.5 }}
                              />
                            </Box>
                          </TableCell>

                          {/* 2. Previous Owner */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 700, bgcolor: '#0284c7' }}>
                                {item.previousOwner?.[0]?.toUpperCase() || 'P'}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {item.previousOwner || 'Unassigned'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                  {item.previousOwnerRole || 'Agent'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>

                          {/* 3. Transferred To */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 700, bgcolor: '#ea580c' }}>
                                {item.transferredTo?.[0]?.toUpperCase() || 'T'}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {item.transferredTo || 'Agent'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                  {item.transferredToRole || 'Sales Agent'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>

                          {/* 4. Transferred By */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {item.transferredBy || 'System'}
                                </Typography>
                                <Chip
                                  label={item.transferredByRole || 'Calling Agent'}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: 9, fontWeight: 600, mt: 0.2 }}
                                />
                              </Box>
                            </Box>
                          </TableCell>

                          {/* 5. Transfer Date & Time */}
                          <TableCell>
                            <Typography variant="body2" fontWeight={500} sx={{ whiteSpace: 'nowrap' }}>
                              {formatDateTime(item.transferredAt)}
                            </Typography>
                          </TableCell>

                          {/* 6. Reason / Remarks */}
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Tooltip title={item.reason || item.remarks || 'No remarks'} arrow>
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                                <CommentIcon sx={{ fontSize: 15, color: 'text.secondary', mt: 0.2, flexShrink: 0 }} />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    fontSize: 12,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 180,
                                  }}
                                >
                                  {item.reason || item.remarks || '—'}
                                </Typography>
                              </Box>
                            </Tooltip>
                          </TableCell>

                          {/* 7. Current Owner */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Chip
                                label={item.currentOwner || 'Unassigned'}
                                size="small"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: 11,
                                  bgcolor: 'rgba(16, 185, 129, 0.1)',
                                  color: '#059669',
                                  border: '1px solid rgba(16, 185, 129, 0.3)'
                                }}
                              />
                            </Box>
                          </TableCell>

                          {/* 8. Transfer Status */}
                          <TableCell>
                            <Chip
                              label={item.status || 'Completed'}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: 11,
                                bgcolor: item.status === 'Completed' || item.status === 'Approved'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : item.status === 'Pending'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(239, 68, 68, 0.15)',
                                color: item.status === 'Completed' || item.status === 'Approved'
                                  ? '#059669'
                                  : item.status === 'Pending'
                                  ? '#d97706'
                                  : '#dc2626',
                              }}
                            />
                          </TableCell>

                          {/* Action Button: View Details */}
                          <TableCell align="center">
                            <Tooltip title="View Lead Details" arrow>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/leads/${item.leadId}`)}
                                sx={{
                                  color: 'primary.main',
                                  bgcolor: 'rgba(234, 88, 12, 0.08)',
                                  '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.18)' }
                                }}
                              >
                                <Visibility sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* TAB 1: INCOMING REQUESTS */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : incoming.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography color="text.secondary">No incoming transfer requests.</Typography>
              </Box>
            ) : (
              incoming.map((r) => renderRequest(r, true))
            )}
          </Box>
        )}

        {/* TAB 2: OUTGOING REQUESTS */}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : outgoing.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography color="text.secondary">No outgoing transfer requests.</Typography>
              </Box>
            ) : (
              outgoing.map((r) => renderRequest(r, false))
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
