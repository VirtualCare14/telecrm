import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Alert, Grid, Paper, Chip, CircularProgress,
  Tab, Tabs, FormControl, InputLabel, Select, MenuItem, Checkbox,
  List, ListItem, ListItemText, ListItemIcon
} from '@mui/material';
import { CheckCircle, Cancel, ArrowBack, TransferWithinAStation } from '@mui/icons-material';
import { incomingRequests, outgoingRequests, approveRequest, rejectRequest, cancelRequest } from '../services/transferService';
import { getAgents } from '../services/agentService';
import { listLeads } from '../services/leadsService';
import { bulkTransferLeads } from '../services/adminService';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { formatDateTime } from '../utils/dateHelpers';

export default function TransferRequests() {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  // Bulk transfer state
  const [agents, setAgents] = useState([]);
  const [fromAgentId, setFromAgentId] = useState('');
  const [toAgentId, setToAgentId] = useState('');
  const [sourceLeads, setSourceLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkSuccess, setBulkSuccess] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const [incomingData, outgoingData] = await Promise.all([incomingRequests(), outgoingRequests()]);
      setIncoming(incomingData);
      setOutgoing(outgoingData);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load transfer requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

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
    } catch (err) {
      setBulkError(err.response?.data?.message || 'Unable to perform bulk transfer');
    } finally { setBulkLoading(false); }
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    try { await approveRequest(id); await fetchRequests(); }
    catch (err) { setError(err.response?.data?.message || 'Unable to approve'); }
    finally { setActionLoading(''); }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try { await rejectRequest(id); await fetchRequests(); }
    catch (err) { setError(err.response?.data?.message || 'Unable to reject'); }
    finally { setActionLoading(''); }
  };

  const handleCancel = async (id) => {
    setActionLoading(id);
    try { await cancelRequest(id); await fetchRequests(); }
    catch (err) { setError(err.response?.data?.message || 'Unable to cancel'); }
    finally { setActionLoading(''); }
  };

  const renderRequest = (request, isIncoming) => {
    const statusColors = { Pending: 'warning', Approved: 'success', Rejected: 'error', Cancelled: 'default' };
    return (
      <Paper key={request._id} elevation={0} sx={{ p: 2, mb: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', borderLeft: '4px solid', borderLeftColor: request.status === 'Pending' ? 'warning.main' : request.status === 'Approved' ? 'success.main' : 'error.main' }}>
        <Grid container spacing={1}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">{request.lead?.organizationName || 'Unknown'} (#{request.lead?.leadNumber || '—'})</Typography>
            <Typography variant="body2" color="text.secondary">
              {isIncoming ? `From: ${request.fromAgent?.fullName || request.fromAgent?.username || '—'}` : `To: ${request.toAgent?.fullName || request.toAgent?.username || '—'}`}
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
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {isIncoming && request.status === 'Pending' && (
                <>
                  <Button size="small" variant="contained" color="success" startIcon={<CheckCircle />} disabled={actionLoading === request._id} onClick={() => handleApprove(request._id)} sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}>
                    {actionLoading === request._id ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<Cancel />} disabled={actionLoading === request._id} onClick={() => handleReject(request._id)} sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}>
                    {actionLoading === request._id ? 'Rejecting...' : 'Reject'}
                  </Button>
                </>
              )}
              {!isIncoming && request.status === 'Pending' && (
                <Button size="small" variant="outlined" color="error" disabled={actionLoading === request._id} onClick={() => handleCancel(request._id)} sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 12 }}>
                  {actionLoading === request._id ? 'Cancelling...' : 'Cancel'}
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Button 
          startIcon={<ArrowBack />} 
          onClick={() => navigate(-1)} 
          sx={{ 
            textTransform: 'none',
            borderRadius: 2,
            '&:hover': {
              bgcolor: 'rgba(25, 118, 210, 0.08)'
            }
          }}
        >
          Back
        </Button>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Transfer Requests
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {bulkSuccess && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBulkSuccess(null)}>{bulkSuccess}</Alert>}
      {bulkError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBulkError(null)}>{bulkError}</Alert>}

      {/* Bulk Transfer Section - Admin Only */}
      {user?.role === 'ADMIN' && (
        <Paper elevation={0} sx={{ 
          p: 3, 
          mb: 3, 
          borderRadius: 3, 
          border: '1px solid', 
          borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TransferWithinAStation sx={{ color: 'primary.main' }} /> Bulk Transfer
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
                disabled={!fromAgentId || !toAgentId || bulkLoading} 
                onClick={handleBulkTransfer} 
                sx={{ 
                  borderRadius: 2, 
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                  '&:hover': {
                    boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)'
                  }
                }}
              >
                {bulkLoading ? 'Transferring...' : 'Execute Transfer'}
              </Button>
            </Grid>
          </Grid>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Select leads below or leave all selected to transfer all.</Typography>
          <Paper elevation={0} sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
            {loadingLeads ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
            : sourceLeads.length === 0 ? <Typography color="text.secondary" variant="body2">No leads for this agent.</Typography>
            : <List dense>{sourceLeads.map((lead) => (
                <ListItem key={lead._id} button onClick={() => handleToggleLead(lead._id)} sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                  <ListItemIcon><Checkbox edge="start" checked={selectedLeadIds.includes(lead._id)} size="small" /></ListItemIcon>
                  <ListItemText primary={`${lead.organizationName} (#${lead.leadNumber})`} secondary={lead.primaryContact?.name || ''} />
                </ListItem>
              ))}</List>}
          </Paper>
        </Paper>
      )}

      {/* Incoming/Outgoing tabs */}
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
              fontWeight: 500,
              fontSize: 14,
              '&.Mui-selected': {
                fontWeight: 600
              }
            }
          }}
          variant="fullWidth"
        >
          <Tab label={`Incoming (${incoming.length})`} />
          <Tab label={`Outgoing (${outgoing.length})`} />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          : tab === 0 ? (incoming.length === 0 ? <Typography color="text.secondary">No incoming requests.</Typography> : incoming.map((r) => renderRequest(r, true)))
          : (outgoing.length === 0 ? <Typography color="text.secondary">No outgoing requests.</Typography> : outgoing.map((r) => renderRequest(r, false)))}
        </Box>
      </Paper>
    </Box>
  );
}
