import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Grid, Alert, Divider,
  FormControl, InputLabel, Select, MenuItem, Chip, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  CircularProgress, Table, TableBody, TableCell, TableRow, TableContainer
} from '@mui/material';
import {
  ArrowBack, Phone, Edit, Close, CheckCircle, Cancel, Send,
  PersonAdd, ContentCopy, Check as CheckIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  getLead, listCallLogs, createCallLog, listActivities, closeWon, closeLost, updateLead,
  getLeadContacts, addContact, setPrimaryContact, updateContact 
} from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { requestTransfer } from '../services/transferService';
import { formatDateTime } from '../utils/dateHelpers';
import { CALL_DISPOSITIONS, LOST_REASONS, LEAD_SOURCES, INDUSTRIES, ORGANIZATION_TYPES, SOFTWARE_OPTIONS } from '../utils/constants';

export default function LeadDetails() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);

  // State for various dialogs/modes
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [editSoftware, setEditSoftware] = useState({ existingSoftwareUsed: '', softwareName: '' });

  // Add Call Log
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [callData, setCallData] = useState({
    calledContactId: '', calledAt: new Date().toISOString().slice(0, 16),
    disposition: '', remark: '', followUpAt: '',
    existingSoftwareUsed: '', softwareName: '',
  });
  const [callError, setCallError] = useState(null);

  // Add Contact
  const [contactOpen, setContactOpen] = useState(false);
  const [contactData, setContactData] = useState({
    name: '', designation: '', phone: '', altPhone: '', email: '', setAsPrimary: false,
  });

  // Edit Contact
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactData, setEditContactData] = useState({ id: '', name: '', designation: '', phone: '', altPhone: '', email: '' });
  const [editContactError, setEditContactError] = useState(null);

  // Close Lead
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeMode, setCloseMode] = useState('won'); // 'won' or 'lost'
  const [closeData, setCloseData] = useState({ closingRemark: '', dealValue: '', product: '', lostReason: '' });

  // Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAgent, setTransferAgent] = useState('');
  const [agents, setAgents] = useState([]);

  const isOwnerOrAdmin = user?.role === 'ADMIN' || lead?.currentOwner?._id === user?.id;
  const canEdit = isOwnerOrAdmin && lead?.closureStatus === 'OPEN';

  const refresh = async () => {
    try {
      const [l, cs, logsData, acts] = await Promise.all([
        getLead(id), getLeadContacts(id), listCallLogs(id), listActivities(id)
      ]);
      setLead(l);
      setContacts(cs);
      setLogs(logsData);
      setActivities(acts);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load lead details');
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (lead) {
      setEditFields({
        organizationName: lead.organizationName || '',
        industry: lead.industry || '',
        organizationType: lead.organizationType || '',
        address: lead.address || '',
        leadSource: lead.leadSource || '',
        existingSoftwareUsed: lead.existingSoftwareUsed || '',
        softwareName: lead.softwareName || '',
      });
    }
  }, [lead]);

  useEffect(() => {
    if (lead && canEdit) {
      const loadAgents = async () => {
        try {
          const activeAgents = await getActiveAgents();
          const ownerId = lead.currentOwner?._id?.toString() || '';
          setAgents(activeAgents.filter((a) => a._id !== ownerId));
        } catch (e) { /* ignore */ }
      };
      loadAgents();
    }
  }, [lead, canEdit]);

  // Edit Lead
  const handleEditField = (f) => (e) => setEditFields((p) => ({ ...p, [f]: e.target.value }));
  const handleSaveEdit = async () => {
    setError(null); setFieldErrors({});
    try {
      await updateLead(id, editFields);
      setEditMode(false);
      await refresh();
    } catch (err) {
      if (err.validationErrors) setFieldErrors(err.validationErrors);
      else setError(err.response?.data?.message || 'Unable to update lead');
    }
  };

  // Add Call Log
  const handleAddCallLog = async () => {
    setCallError(null);
    if (!callData.calledContactId) { setCallError('Select a contact person'); return; }
    if (!callData.disposition) { setCallError('Select a disposition'); return; }
    if (!callData.remark) { setCallError('Remark is required'); return; }
    try {
      await createCallLog(id, {
        calledContactId: callData.calledContactId,
        calledAt: callData.calledAt || undefined,
        disposition: callData.disposition,
        remark: callData.remark,
        followUpAt: callData.followUpAt || undefined,
        existingSoftwareUsed: callData.existingSoftwareUsed || undefined,
        softwareName: callData.softwareName || undefined,
      });
      setCallLogOpen(false);
      setCallData({
        calledContactId: '', calledAt: new Date().toISOString().slice(0, 16),
        disposition: '', remark: '', followUpAt: '',
        existingSoftwareUsed: '', softwareName: '',
      });
      await refresh();
    } catch (err) {
      setCallError(err.response?.data?.message || 'Unable to add call log');
    }
  };

  // Add Contact
  const handleAddContact = async () => {
    setError(null);
    if (!contactData.name || !contactData.phone) { setError('Name and phone are required'); return; }
    try {
      await addContact(id, contactData);
      setContactOpen(false);
      setContactData({ name: '', designation: '', phone: '', altPhone: '', email: '', setAsPrimary: false });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to add contact');
    }
  };

  const handleSetPrimary = async (contactId) => {
    try {
      await setPrimaryContact(id, contactId);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to set primary contact');
    }
  };

  // Edit Contact
  const handleOpenEditContact = (c) => {
    setEditContactData({ id: c._id, name: c.name || '', designation: c.designation || '', phone: c.phone || '', altPhone: c.altPhone || '', email: c.email || '' });
    setEditContactError(null);
    setEditContactOpen(true);
  };

  const handleEditContactChange = (f) => (e) => setEditContactData((p) => ({ ...p, [f]: e.target.value }));

  const handleSaveEditContact = async () => {
    setEditContactError(null);
    try {
      await updateContact(id, editContactData.id, {
        name: editContactData.name,
        designation: editContactData.designation,
        phone: editContactData.phone,
        altPhone: editContactData.altPhone,
        email: editContactData.email,
      });
      setEditContactOpen(false);
      await refresh();
    } catch (err) {
      setEditContactError(err.response?.data?.message || 'Unable to update contact');
    }
  };

  // Close Lead
  const handleCloseLead = async () => {
    setError(null);
    try {
      if (closeMode === 'won') {
        await closeWon(id, { closingRemark: closeData.closingRemark, dealValue: closeData.dealValue || undefined, product: closeData.product || undefined });
      } else {
        await closeLost(id, { closingRemark: closeData.closingRemark, lostReason: closeData.lostReason });
      }
      setCloseOpen(false);
      setCloseData({ closingRemark: '', dealValue: '', product: '', lostReason: '' });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to close lead');
    }
  };

  // Transfer
  const handleTransfer = async () => {
    setError(null);
    try {
      await requestTransfer(id, transferAgent);
      setTransferOpen(false);
      setTransferAgent('');
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to request transfer');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!lead) return <Box sx={{ p: 3 }}><Alert severity="error">{error || 'Lead not found'}</Alert></Box>;

  const isClosed = lead.closureStatus !== 'OPEN';
  const closureInfo = isClosed ? `Closed as ${lead.closureStatus}` : 'Open';
  const ownerName = lead.currentOwner?.fullName || lead.currentOwner?.username || 'Unassigned';

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Button 
          startIcon={<ArrowBack />} 
          onClick={() => navigate('/leads')} 
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
          Lead Details
        </Typography>
        <Chip
          label={closureInfo}
          color={lead.closureStatus === 'WON' ? 'success' : lead.closureStatus === 'LOST' ? 'error' : 'default'}
          variant={isClosed ? 'filled' : 'outlined'}
          size="small"
          sx={{ fontWeight: 600, borderRadius: 1.5 }}
        />
        {lead.nextFollowUpAt && !isClosed && new Date(lead.nextFollowUpAt) < new Date() && (
          <Chip label="Overdue" color="error" size="small" sx={{ borderRadius: 1.5, animation: 'pulse 2s infinite' }} />
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {/* Quick Actions */}
      <Paper elevation={0} sx={{ 
        p: 1.5, 
        mb: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <Button size="small" startIcon={<Phone />} variant="contained" onClick={() => setCallLogOpen(true)} sx={{ borderRadius: 2, textTransform: 'none', boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)' }}>
                Add Call Log
              </Button>
              <Button size="small" startIcon={<PersonAdd />} variant="outlined" onClick={() => setContactOpen(true)} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Add Contact
              </Button>
              <Button size="small" startIcon={<Send />} variant="outlined" onClick={() => setTransferOpen(true)} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Transfer
              </Button>
              <Button size="small" startIcon={<CheckCircle />} color="success" variant="outlined" onClick={() => { setCloseMode('won'); setCloseOpen(true); }} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Close Won
              </Button>
              <Button size="small" startIcon={<Cancel />} color="error" variant="outlined" onClick={() => { setCloseMode('lost'); setCloseOpen(true); }} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Close Lost
              </Button>
            </>
          )}
          <Button 
            size="small" 
            startIcon={<Edit />} 
            variant={editMode ? "contained" : "text"} 
            onClick={() => setEditMode(!editMode)} 
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            {editMode ? 'Cancel Edit' : 'Edit'}
          </Button>
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Latest Disposition', value: lead.latestDisposition || '—', icon: '📋' },
          { label: 'Last Call', value: formatDateTime(lead.lastCalledAt), icon: '📞' },
          { label: 'Next Follow-up', value: formatDateTime(lead.nextFollowUpAt), icon: '📅', isOverdue: lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date() },
          { label: 'Owner', value: ownerName, icon: '👤' }
        ].map((card, idx) => (
          <Grid item xs={6} md={3} key={idx}>
            <Paper 
              elevation={0} 
              sx={{ 
                p: 2, 
                borderRadius: 3, 
                border: '1px solid', 
                borderColor: 'divider',
                bgcolor: 'background.paper',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                }
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {card.icon} {card.label}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ fontSize: 13, color: card.isOverdue ? 'error.main' : 'inherit' }}>
                {card.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', mb: 3 }}>
        <Tabs 
          value={tab} 
          onChange={(_, v) => setTab(v)} 
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider', 
            px: 2,
            bgcolor: '#f8f9fb',
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
          <Tab label="Overview" />
          <Tab label={`Contacts (${contacts.length})`} />
          <Tab label={`Call Trail (${logs.length})`} />
          <Tab label="Activity" />
          <Tab label="Transfer History" />
        </Tabs>

        {/* Tab 0: Overview */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>Organization Information</Typography>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, width: 140, fontSize: 13 }}>Organization</TableCell>
                        <TableCell>{editMode ? <TextField size="small" value={editFields.organizationName} onChange={handleEditField('organizationName')} fullWidth error={Boolean(fieldErrors.organizationName)} helperText={fieldErrors.organizationName} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /> : <Typography variant="body2" fontWeight={500}>{lead.organizationName}</Typography>}</TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Industry</TableCell>
                        <TableCell>{editMode ? <FormControl fullWidth size="small"><Select value={editFields.industry} onChange={handleEditField('industry')}>{INDUSTRIES.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}</Select></FormControl> : <Typography variant="body2">{lead.industry || '—'}</Typography>}</TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Type</TableCell>
                        <TableCell>{editMode ? <FormControl fullWidth size="small"><Select value={editFields.organizationType} onChange={handleEditField('organizationType')}>{ORGANIZATION_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select></FormControl> : <Typography variant="body2">{lead.organizationType || '—'}</Typography>}</TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Address</TableCell>
                        <TableCell>{editMode ? <TextField size="small" value={editFields.address} onChange={handleEditField('address')} fullWidth multiline rows={2} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /> : <Typography variant="body2">{lead.address || '—'}</Typography>}</TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Lead Source</TableCell>
                        <TableCell>{editMode ? <FormControl fullWidth size="small"><Select value={editFields.leadSource} onChange={handleEditField('leadSource')}>{LEAD_SOURCES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></FormControl> : <Typography variant="body2">{lead.leadSource || '—'}</Typography>}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>Software & Ownership</Typography>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, width: 140, fontSize: 13 }}>Software Used</TableCell>
                        <TableCell>{editMode ? <FormControl fullWidth size="small"><Select value={editFields.existingSoftwareUsed || ''} onChange={(e) => setEditFields(p => ({...p, existingSoftwareUsed: e.target.value}))}>{['', 'Yes', 'No', 'Unknown'].map(o => <MenuItem key={o} value={o}>{o || '—'}</MenuItem>)}</Select></FormControl> : <Typography variant="body2">{lead.existingSoftwareUsed || '—'}</Typography>}</TableCell>
                      </TableRow>
                      {editFields.existingSoftwareUsed === 'Yes' && editMode ? (
                        <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                          <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Software Name</TableCell>
                          <TableCell><TextField size="small" fullWidth value={editFields.softwareName || ''} onChange={(e) => setEditFields(p => ({...p, softwareName: e.target.value}))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></TableCell>
                        </TableRow>
                      ) : (
                        <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                          <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Software Name</TableCell>
                          <TableCell><Typography variant="body2">{lead.softwareName || '—'}</Typography></TableCell>
                        </TableRow>
                      )}
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Current Owner</TableCell>
                        <TableCell><Typography variant="body2" fontWeight={500}>{ownerName}</Typography></TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Created By</TableCell>
                        <TableCell><Typography variant="body2">{lead.createdBy?.fullName || lead.createdBy?.username || '—'}</Typography></TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Created At</TableCell>
                        <TableCell><Typography variant="body2">{formatDateTime(lead.createdAt)}</Typography></TableCell>
                      </TableRow>
                      <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Updated At</TableCell>
                        <TableCell><Typography variant="body2">{formatDateTime(lead.updatedAt)}</Typography></TableCell>
                      </TableRow>
                      {isClosed && (
                        <>
                          <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Closed By</TableCell>
                            <TableCell><Typography variant="body2">{lead.closedBy?.fullName || lead.closedBy?.username || '—'}</Typography></TableCell>
                          </TableRow>
                          <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Closed At</TableCell>
                            <TableCell><Typography variant="body2">{formatDateTime(lead.closedAt)}</Typography></TableCell>
                          </TableRow>
                          <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Closing Remark</TableCell>
                            <TableCell><Typography variant="body2">{lead.closingRemark || '—'}</Typography></TableCell>
                          </TableRow>
                          {lead.closureStatus === 'WON' && <><TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}><TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Deal Value</TableCell><TableCell><Typography variant="body2" fontWeight={600} color="success.main">{lead.dealValue ? `₹${lead.dealValue.toLocaleString()}` : '—'}</Typography></TableCell></TableRow>
                            <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}><TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Product</TableCell><TableCell><Typography variant="body2">{lead.product || '—'}</Typography></TableCell></TableRow></>}
                          {lead.closureStatus === 'LOST' && <TableRow sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}><TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Lost Reason</TableCell><TableCell><Typography variant="body2">{lead.lostReason || '—'}</Typography></TableCell></TableRow>}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                {editMode && (
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={handleSaveEdit} sx={{ borderRadius: 2, textTransform: 'none', boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)' }}>Save Changes</Button>
                    <Button variant="text" onClick={() => setEditMode(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
                  </Box>
                )}
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Tab 1: Contacts */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 2 }}>
              <Button size="small" variant="outlined" startIcon={<PersonAdd />} onClick={() => setContactOpen(true)} disabled={!canEdit} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Add Contact Person
              </Button>
            </Box>
            <Grid container spacing={2}>
              {contacts.length === 0 ? (
                <Grid item xs={12}><Typography color="text.secondary">No contacts found.</Typography></Grid>
              ) : contacts.map((c) => (
                <Grid item xs={12} sm={6} md={4} key={c._id}>
                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: c.isPrimary ? 'success.main' : 'divider', position: 'relative' }}>
                    {c.isPrimary && <Chip label="Primary" size="small" color="success" sx={{ position: 'absolute', top: 8, right: 8, height: 20, fontSize: 10 }} />}
                    <Typography variant="subtitle2" fontWeight={600}>{c.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{c.designation || '—'}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>📞 {c.phone}</Typography>
                    {c.altPhone && <Typography variant="body2">📞 {c.altPhone}</Typography>}
                    {c.email && <Typography variant="body2">✉️ {c.email}</Typography>}
                    {canEdit && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Button size="small" variant="text" color="primary" onClick={() => handleOpenEditContact(c)} sx={{ fontSize: 11 }}>
                          <Edit fontSize="small" sx={{ mr: 0.3 }} /> Edit
                        </Button>
                        {!c.isPrimary && (
                          <Button size="small" variant="text" color="success" onClick={() => handleSetPrimary(c._id)} sx={{ fontSize: 11 }}>
                            Set as Primary
                          </Button>
                        )}
                      </Box>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Tab 2: Call Trail */}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 2 }}>
              <Button size="small" variant="contained" startIcon={<Phone />} onClick={() => setCallLogOpen(true)} disabled={!canEdit} sx={{ borderRadius: 2, textTransform: 'none' }}>
                Add Call Log
              </Button>
            </Box>
            {logs.length === 0 ? (
              <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Typography sx={{ fontSize: 48, mb: 1 }}>📞</Typography>
                <Typography color="text.secondary" fontWeight={500}>No call logs yet. Start by adding one.</Typography>
              </Paper>
            ) : logs.map((log, idx) => (
              <Paper 
                key={log._id} 
                elevation={0} 
                sx={{ 
                  p: 2.5, 
                  mb: 2, 
                  borderRadius: 3, 
                  border: '1px solid', 
                  borderColor: 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: 'primary.main',
                  bgcolor: 'background.paper',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateX(4px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Chip label={`Call #${logs.length - idx}`} size="small" variant="outlined" sx={{ fontWeight: 600, borderRadius: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>{formatDateTime(log.createdAt)}</Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contact Called</Typography>
                    <Typography variant="body2" fontWeight={600}>{log.calledContact?.name || 'Unknown'}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Called At</Typography>
                    <Typography variant="body2">{formatDateTime(log.calledAt)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>By</Typography>
                    <Typography variant="body2">{log.user?.fullName || '—'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Disposition</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip label={log.disposition} size="small" color={log.disposition === 'Interested' || log.disposition === 'Connected' ? 'success' : log.disposition === 'Not Interested' ? 'error' : 'default'} variant="outlined" sx={{ fontWeight: 500, fontSize: 11, borderRadius: 1.5 }} />
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Remark</Typography>
                    <Typography variant="body2">{log.remark}</Typography>
                  </Grid>
                  {log.followUpAt && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Follow-up</Typography>
                      <Typography variant="body2" fontWeight={500}>{formatDateTime(log.followUpAt)}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            ))}
          </Box>
        )}

        {/* Tab 3: Activity */}
        {tab === 3 && (
          <Box sx={{ p: 3 }}>
            {activities.length === 0 ? (
              <Typography color="text.secondary">No activity recorded yet.</Typography>
            ) : activities.map((act) => (
              <Box key={act._id} sx={{ display: 'flex', gap: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{act.action}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    By {act.performedBy?.fullName || act.performedBy?.role || 'System'} • {formatDateTime(act.createdAt)}
                  </Typography>
                  {act.metadata && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {JSON.stringify(act.metadata).substring(0, 120)}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Tab 4: Transfer History */}
        {tab === 4 && (
          <Box sx={{ p: 3 }}>
            {activities.filter(a => a.action.includes('Transfer') || a.action.includes('Ownership')).length === 0 ? (
              <Typography color="text.secondary">No transfer activity recorded.</Typography>
            ) : activities.filter(a => a.action.includes('Transfer') || a.action.includes('Ownership')).map((act) => (
              <Box key={act._id} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" fontWeight={600}>{act.action}</Typography>
                <Typography variant="caption" color="text.secondary">
                  By {act.performedBy?.fullName || act.performedBy?.role || 'System'} • {formatDateTime(act.createdAt)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Add Call Log Dialog */}
      <Dialog open={callLogOpen} onClose={() => setCallLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Phone /> Add Call Log
          <IconButton sx={{ ml: 'auto' }} onClick={() => setCallLogOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {callError && <Alert severity="error" sx={{ mb: 2 }}>{callError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Contact Person Called</InputLabel>
                <Select value={callData.calledContactId} label="Contact Person Called" onChange={(e) => setCallData(p => ({ ...p, calledContactId: e.target.value }))}>
                  {contacts.map(c => (
                    <MenuItem key={c._id} value={c._id}>{c.name} {c.isPrimary ? '(Primary)' : ''} - {c.phone}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Call Date & Time" type="datetime-local" value={callData.calledAt} onChange={(e) => setCallData(p => ({ ...p, calledAt: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Disposition</InputLabel>
                <Select value={callData.disposition} label="Disposition" onChange={(e) => setCallData(p => ({ ...p, disposition: e.target.value }))}>
                  {CALL_DISPOSITIONS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth required label="Remark" multiline rows={3} value={callData.remark} onChange={(e) => setCallData(p => ({ ...p, remark: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Follow-up Date & Time" type="datetime-local" value={callData.followUpAt} onChange={(e) => setCallData(p => ({ ...p, followUpAt: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Existing Software</InputLabel>
                <Select value={callData.existingSoftwareUsed} label="Existing Software" onChange={(e) => setCallData(p => ({ ...p, existingSoftwareUsed: e.target.value }))}>
                  <MenuItem value=""><em>No change</em></MenuItem>
                  {SOFTWARE_OPTIONS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            {callData.existingSoftwareUsed === 'Yes' && (
              <Grid item xs={12}>
                <TextField fullWidth label="Software Name" value={callData.softwareName} onChange={(e) => setCallData(p => ({ ...p, softwareName: e.target.value }))} />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCallLogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddCallLog} sx={{ borderRadius: 2, textTransform: 'none' }}>Save Call Log</Button>
        </DialogActions>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={contactOpen} onClose={() => setContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonAdd /> Add Contact Person
          <IconButton sx={{ ml: 'auto' }} onClick={() => setContactOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}><TextField fullWidth required label="Full Name" value={contactData.name} onChange={(e) => setContactData(p => ({ ...p, name: e.target.value }))} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Designation" value={contactData.designation} onChange={(e) => setContactData(p => ({ ...p, designation: e.target.value }))} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth required label="Phone Number" value={contactData.phone} onChange={(e) => setContactData(p => ({ ...p, phone: e.target.value }))} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Alternate Phone" value={contactData.altPhone} onChange={(e) => setContactData(p => ({ ...p, altPhone: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Email" value={contactData.email} onChange={(e) => setContactData(p => ({ ...p, email: e.target.value }))} /></Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Set as Primary</InputLabel>
                <Select value={contactData.setAsPrimary ? 'yes' : 'no'} label="Set as Primary" onChange={(e) => setContactData(p => ({ ...p, setAsPrimary: e.target.value === 'yes' }))}>
                  <MenuItem value="no">No</MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setContactOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddContact} sx={{ borderRadius: 2, textTransform: 'none' }}>Add Contact</Button>
        </DialogActions>
      </Dialog>

      {/* Close Lead Dialog */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {closeMode === 'won' ? <CheckCircle color="success" /> : <Cancel color="error" />}
          Close as {closeMode === 'won' ? 'Won' : 'Lost'}
          <IconButton sx={{ ml: 'auto' }} onClick={() => setCloseOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth required label="Closing Remark" multiline rows={2} value={closeData.closingRemark} onChange={(e) => setCloseData(p => ({ ...p, closingRemark: e.target.value }))} />
            </Grid>
            {closeMode === 'won' && (
              <>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Deal Value" type="number" value={closeData.dealValue} onChange={(e) => setCloseData(p => ({ ...p, dealValue: e.target.value }))} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Product" value={closeData.product} onChange={(e) => setCloseData(p => ({ ...p, product: e.target.value }))} /></Grid>
              </>
            )}
            {closeMode === 'lost' && (
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Lost Reason</InputLabel>
                  <Select value={closeData.lostReason} label="Lost Reason" onChange={(e) => setCloseData(p => ({ ...p, lostReason: e.target.value }))}>
                    {LOST_REASONS.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCloseOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            color={closeMode === 'won' ? 'success' : 'error'}
            onClick={handleCloseLead}
            disabled={!closeData.closingRemark || (closeMode === 'lost' && !closeData.lostReason)}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Close as {closeMode === 'won' ? 'Won' : 'Lost'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={editContactOpen} onClose={() => setEditContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit /> Edit Contact Person
          <IconButton sx={{ ml: 'auto' }} onClick={() => setEditContactOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {editContactError && <Alert severity="error" sx={{ mb: 2 }}>{editContactError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Full Name" value={editContactData.name} onChange={handleEditContactChange('name')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Designation" value={editContactData.designation} onChange={handleEditContactChange('designation')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Phone Number" value={editContactData.phone} onChange={handleEditContactChange('phone')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Alternate Phone" value={editContactData.altPhone} onChange={handleEditContactChange('altPhone')} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Email" value={editContactData.email} onChange={handleEditContactChange('email')} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditContactOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEditContact} sx={{ borderRadius: 2, textTransform: 'none' }}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Send /> Request Transfer
          <IconButton sx={{ ml: 'auto' }} onClick={() => setTransferOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Transfer to Agent</InputLabel>
            <Select value={transferAgent} label="Transfer to Agent" onChange={(e) => setTransferAgent(e.target.value)}>
              <MenuItem value="">Select agent</MenuItem>
              {agents.map(a => <MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>)}
            </Select>
          </FormControl>
          {agents.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>No other active agents available.</Typography>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTransferOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleTransfer} disabled={!transferAgent || agents.length === 0} sx={{ borderRadius: 2, textTransform: 'none' }}>Send Request</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}