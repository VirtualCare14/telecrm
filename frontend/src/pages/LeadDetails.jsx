import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Grid, Alert, Divider,
  FormControl, InputLabel, Select, MenuItem, Chip, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  CircularProgress, Avatar, Tooltip, Autocomplete
} from '@mui/material';
import {
  ArrowBack, Phone, Edit, Close, CheckCircle, Cancel, Send,
  PersonAdd, ContentCopy, Check as CheckIcon, Business, People,
  Person, AssignmentInd, CalendarMonth, History, Call,
  Schedule, Assessment, InfoOutlined, Email,
  LocationOn, Work, LaptopMac, Star, WarningAmber, CheckCircleOutline,
  DirectionsWalk, EmojiEvents
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  getLead, listCallLogs, createCallLog, listActivities, closeWon, closeLost, updateLead,
  getLeadContacts, addContact, setPrimaryContact, updateContact,
  listWalkIns, createWalkIn,
  listDemos, createDemo, updateDemoStatus,
  rescheduleFollowUp, completeFollowUp
} from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { requestTransfer } from '../services/transferService';
import { formatDateTime, formatDate, formatDateToYYYYMMDD, toLocalDatetimeInput, toISOFromLocalDatetime } from '../utils/dateHelpers';
import { CALL_DISPOSITIONS, LOST_REASONS, LEAD_SOURCES, INDUSTRIES, ORGANIZATION_TYPES, SOFTWARE_OPTIONS } from '../utils/constants';

// Helper for disposition color badge
const getDispositionStyle = (disposition) => {
  switch (disposition) {
    case 'Interested':
    case 'Connected':
    case 'Appointment Booked':
    case 'Demo Requested':
      return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'Call Back Later':
    case 'Follow-up Required':
    case 'Decision Maker Unavailable':
    case 'Referred to Another Person':
    case 'Proposal Discussion':
    case 'Negotiation':
      return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
    case 'Not Interested':
    case 'Wrong Number':
      return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
    case 'No Answer':
    case 'Busy':
    case 'Not Reachable':
    case 'Switched Off':
      return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
    default:
      return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
  }
};

// Helper for Demo status color badge
const getDemoStatusStyle = (status) => {
  switch (status) {
    case 'Done':
      return { color: '#059669', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'Not Done':
      return { color: '#dc2626', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
    case 'Planned':
    default:
      return { color: '#2563eb', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
  }
};

export default function LeadDetails() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [walkIns, setWalkIns] = useState([]);
  const [demos, setDemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyTab, setHistoryTab] = useState(0);
  const [copiedPhone, setCopiedPhone] = useState(null);

  // Edit Mode for Lead Information
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});

  // Add Call Log Modal
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [callData, setCallData] = useState({
    calledContactId: '',
    calledAt: toLocalDatetimeInput(new Date()),
    disposition: '',
    remark: '',
    followUpAt: '',
    existingSoftwareUsed: '',
    softwareName: '',
  });
  const [callError, setCallError] = useState(null);

  // Record Walk-in Modal State
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInData, setWalkInData] = useState({
    walkInDate: formatDateToYYYYMMDD(new Date()),
    walkInTime: '11:00',
    remark: '',
  });
  const [walkInError, setWalkInError] = useState(null);
  const [savingWalkIn, setSavingWalkIn] = useState(false);

  // Demo Modal State (for Sales Agent & Admin - Requirements 1, 2, 3, 7)
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoData, setDemoData] = useState({
    demoDate: formatDateToYYYYMMDD(new Date()),
    demoTime: '15:00',
    status: 'Planned',
    remarks: '',
  });
  const [editingDemoId, setEditingDemoId] = useState(null);
  const [demoError, setDemoError] = useState(null);
  const [savingDemo, setSavingDemo] = useState(false);

  // Reschedule Follow-up Modal State
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({
    followUpDate: '',
    followUpTime: '10:00',
    remarks: '',
  });
  const [rescheduleError, setRescheduleError] = useState(null);
  const [savingReschedule, setSavingReschedule] = useState(false);

  // Complete Follow-up Modal State
  const [completeFollowUpOpen, setCompleteFollowUpOpen] = useState(false);
  const [completeRemarks, setCompleteRemarks] = useState('');
  const [completeError, setCompleteError] = useState(null);
  const [savingComplete, setSavingComplete] = useState(false);

  // Add Contact Modal
  const [contactOpen, setContactOpen] = useState(false);
  const [contactData, setContactData] = useState({
    name: '', designation: '', phone: '', altPhone: '', email: '', setAsPrimary: false,
  });

  // Edit Contact Modal
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactData, setEditContactData] = useState({ id: '', name: '', designation: '', phone: '', altPhone: '', email: '' });
  const [editContactError, setEditContactError] = useState(null);

  // Close Lead Modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeMode, setCloseMode] = useState('won'); // 'won' or 'lost'
  const [closeData, setCloseData] = useState({ closingRemark: '', dealValue: '', product: '', lostReason: '' });
  const [closeError, setCloseError] = useState(null);
  const [savingClose, setSavingClose] = useState(false);

  // Transfer Modal
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAgent, setTransferAgent] = useState('');
  const [agents, setAgents] = useState([]);

  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');
  const ownerId = (lead?.currentOwner?._id || lead?.currentOwner)?._id || (lead?.currentOwner?._id || lead?.currentOwner);
  const currentUserId = user?.id || user?._id;
  const isOwnerOrAdmin = isAdmin || (ownerId && currentUserId && ownerId.toString() === currentUserId.toString());
  const canEdit = isOwnerOrAdmin && lead?.closureStatus === 'OPEN';
  const isSalesAgent = user?.agentRole?.toLowerCase() === 'sales agent';
  const isCallingAgent = !isAdmin && !isSalesAgent;

  const refresh = async () => {
    try {
      const [l, cs, logsData, acts, walkInsData, demosData] = await Promise.all([
        getLead(id), getLeadContacts(id), listCallLogs(id), listActivities(id), listWalkIns(id).catch(() => []), listDemos(id).catch(() => [])
      ]);
      setLead(l);
      setContacts(cs);
      setLogs(logsData);
      setActivities(acts);
      setWalkIns(walkInsData || []);
      setDemos(demosData || []);
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

  // Copy phone helper
  const handleCopy = (phone) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Lead Edit Handlers
  const handleEditField = (f) => (e) => setEditFields((p) => ({ ...p, [f]: e.target.value }));
  const handleSaveEdit = async () => {
    setError(null);
    setFieldErrors({});
    try {
      await updateLead(id, editFields);
      setEditMode(false);
      await refresh();
    } catch (err) {
      if (err.validationErrors) setFieldErrors(err.validationErrors);
      else setError(err.response?.data?.message || 'Unable to update lead');
    }
  };

  // Call Log Handlers
  const handleOpenCallLog = () => {
    setCallError(null);
    const defaultContact = lead?.primaryContact || (contacts.length > 0 ? contacts[0] : null);
    setCallData({
      calledContactId: defaultContact?._id || '',
      calledContactName: defaultContact?.name || '',
      calledContactPhone: defaultContact?.phone || '',
      calledAt: toLocalDatetimeInput(new Date()),
      disposition: '',
      remark: '',
      followUpAt: '',
      existingSoftwareUsed: lead?.existingSoftwareUsed || '',
      softwareName: lead?.softwareName || '',
    });
    setCallLogOpen(true);
  };

  const handleAddCallLog = async () => {
    setCallError(null);
    if (!callData.calledContactId && !callData.calledContactName) {
      setCallError('Please select or type a contact person');
      return;
    }
    if (!callData.disposition) { setCallError('Select a disposition'); return; }
    if (!callData.remark) { setCallError('Remark is required'); return; }
    try {
      await createCallLog(id, {
        calledContactId: callData.calledContactId || undefined,
        calledContactName: callData.calledContactName || undefined,
        calledContactPhone: callData.calledContactPhone || undefined,
        calledAt: toISOFromLocalDatetime(callData.calledAt) || new Date().toISOString(),
        disposition: callData.disposition,
        remark: callData.remark,
        followUpAt: toISOFromLocalDatetime(callData.followUpAt),
        existingSoftwareUsed: callData.existingSoftwareUsed || undefined,
        softwareName: callData.softwareName || undefined,
      });
      setCallLogOpen(false);
      setCallData({
        calledContactId: '',
        calledContactName: '',
        calledContactPhone: '',
        calledAt: toLocalDatetimeInput(new Date()),
        disposition: '',
        remark: '',
        followUpAt: '',
        existingSoftwareUsed: '',
        softwareName: '',
      });
      await refresh();
    } catch (err) {
      setCallError(err.response?.data?.message || 'Unable to add call log');
    }
  };

  // Walk-in Handlers
  const handleOpenWalkIn = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    setWalkInData({
      walkInDate: formatDateToYYYYMMDD(new Date()),
      walkInTime: `${hours}:${mins}`,
      remark: '',
    });
    setWalkInError(null);
    setWalkInOpen(true);
  };

  const handleCloseWalkIn = () => {
    if (savingWalkIn) return;
    setWalkInOpen(false);
    setWalkInError(null);
  };

  const handleSaveWalkIn = async () => {
    if (!walkInData.walkInDate) {
      setWalkInError('Walk-in date is required');
      return;
    }
    if (!walkInData.walkInTime) {
      setWalkInError('Walk-in time is required');
      return;
    }
    if (!walkInData.remark.trim()) {
      setWalkInError('Walk-in remark is required');
      return;
    }
    setSavingWalkIn(true);
    setWalkInError(null);
    try {
      await createWalkIn(id, {
        walkInDate: walkInData.walkInDate,
        walkInTime: walkInData.walkInTime,
        remark: walkInData.remark.trim(),
      });
      setWalkInOpen(false);
      await refresh();
    } catch (err) {
      setWalkInError(err.response?.data?.message || 'Unable to record walk-in');
    } finally {
      setSavingWalkIn(false);
    }
  };

  // Demo Handlers (Requirements 1, 2, 3, 4, 5, 7)
  const handleOpenDemo = (demoToEdit = null) => {
    setDemoError(null);
    if (demoToEdit && demoToEdit._id) {
      setEditingDemoId(demoToEdit._id);
      setDemoData({
        demoDate: formatDateToYYYYMMDD(new Date(demoToEdit.demoDate)),
        demoTime: demoToEdit.demoTime || '15:00',
        status: demoToEdit.status || 'Planned',
        remarks: demoToEdit.remarks || '',
      });
    } else if (lead?.latestDemo?.demoId) {
      setEditingDemoId(lead.latestDemo.demoId);
      setDemoData({
        demoDate: formatDateToYYYYMMDD(new Date(lead.latestDemo.demoDate)),
        demoTime: lead.latestDemo.demoTime || '15:00',
        status: lead.latestDemo.status || 'Planned',
        remarks: lead.latestDemo.remarks || '',
      });
    } else {
      setEditingDemoId(null);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDemoData({
        demoDate: formatDateToYYYYMMDD(tomorrow),
        demoTime: '15:00',
        status: 'Planned',
        remarks: '',
      });
    }
    setDemoOpen(true);
  };

  const handleCloseDemo = () => {
    if (savingDemo) return;
    setDemoOpen(false);
    setEditingDemoId(null);
    setDemoError(null);
  };

  const handleSaveDemo = async () => {
    if (!demoData.demoDate) {
      setDemoError('Demo date is required');
      return;
    }
    if (!demoData.demoTime) {
      setDemoError('Demo time is required');
      return;
    }

    // Requirement 4: Require Demo Remarks/Notes when marking a Demo as Done or Not Done
    if ((demoData.status === 'Done' || demoData.status === 'Not Done') && !demoData.remarks.trim()) {
      setDemoError('Demo remarks/notes are required when marking a demo as Done or Not Done');
      return;
    }

    // Requirement 7: Do not allow a future scheduled Demo to be marked Done before its scheduled time
    if (demoData.status === 'Done') {
      const parts = demoData.demoDate.substring(0, 10).split('-').map(Number);
      const [h, m] = demoData.demoTime.split(':').map(Number);
      const scheduledDateTime = new Date(parts[0], parts[1] - 1, parts[2], h || 0, m || 0, 0, 0);
      if (scheduledDateTime > new Date()) {
        setDemoError('Cannot mark a scheduled demo as Done before its scheduled date and time');
        return;
      }
    }

    setSavingDemo(true);
    setDemoError(null);
    try {
      if (editingDemoId) {
        await updateDemoStatus(id, editingDemoId, {
          status: demoData.status,
          remarks: demoData.remarks.trim(),
          demoDate: demoData.demoDate,
          demoTime: demoData.demoTime,
        });
      } else {
        await createDemo(id, {
          demoDate: demoData.demoDate,
          demoTime: demoData.demoTime,
          status: 'Planned', // Requirement 2: initial status is always Planned
          remarks: demoData.remarks.trim(),
        });
      }
      setDemoOpen(false);
      setEditingDemoId(null);
      await refresh();
    } catch (err) {
      setDemoError(err.response?.data?.message || 'Unable to save demo');
    } finally {
      setSavingDemo(false);
    }
  };

  // Reschedule Follow-up Handlers
  const handleOpenReschedule = () => {
    let initialDate = '';
    let initialTime = '10:00';
    if (lead?.nextFollowUpAt) {
      const dt = new Date(lead.nextFollowUpAt);
      if (!isNaN(dt.getTime())) {
        initialDate = formatDateToYYYYMMDD(dt);
        const hours = String(dt.getHours()).padStart(2, '0');
        const mins = String(dt.getMinutes()).padStart(2, '0');
        initialTime = `${hours}:${mins}`;
      }
    }
    if (!initialDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      initialDate = formatDateToYYYYMMDD(tomorrow);
    }
    setRescheduleData({
      followUpDate: initialDate,
      followUpTime: initialTime,
      remarks: '',
    });
    setRescheduleError(null);
    setRescheduleOpen(true);
  };

  const handleCloseReschedule = () => {
    if (savingReschedule) return;
    setRescheduleOpen(false);
    setRescheduleError(null);
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleData.followUpDate) {
      setRescheduleError('Please select a follow-up date');
      return;
    }
    setSavingReschedule(true);
    setRescheduleError(null);
    try {
      await rescheduleFollowUp(id, {
        followUpDate: rescheduleData.followUpDate,
        followUpTime: rescheduleData.followUpTime || '10:00',
        remarks: rescheduleData.remarks || undefined,
      });
      setRescheduleOpen(false);
      await refresh();
    } catch (err) {
      setRescheduleError(err.response?.data?.message || 'Unable to reschedule follow-up');
    } finally {
      setSavingReschedule(false);
    }
  };

  // Complete Follow-up Handlers
  const handleOpenCompleteFollowUp = () => {
    setCompleteRemarks('');
    setCompleteError(null);
    setCompleteFollowUpOpen(true);
  };

  const handleCloseCompleteFollowUp = () => {
    if (savingComplete) return;
    setCompleteFollowUpOpen(false);
    setCompleteError(null);
  };

  const handleSaveCompleteFollowUp = async () => {
    setSavingComplete(true);
    setCompleteError(null);
    try {
      await completeFollowUp(id, {
        remarks: completeRemarks ? completeRemarks.trim() : undefined,
      });
      setCompleteFollowUpOpen(false);
      await refresh();
    } catch (err) {
      setCompleteError(err.response?.data?.message || 'Unable to complete follow-up');
    } finally {
      setSavingComplete(false);
    }
  };

  // Contact Handlers
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

  // Close Lead Handlers
  const handleCloseLead = async () => {
    setError(null);
    setCloseError(null);
    setSavingClose(true);
    try {
      if (closeMode === 'won') {
        await closeWon(id, {
          closingRemark: closeData.closingRemark,
          dealValue: closeData.dealValue || undefined,
          product: closeData.product || undefined
        });
      } else {
        await closeLost(id, {
          closingRemark: closeData.closingRemark,
          lostReason: closeData.lostReason
        });
      }
      setCloseOpen(false);
      setCloseData({ closingRemark: '', dealValue: '', product: '', lostReason: '' });
      await refresh();
    } catch (err) {
      setCloseError(err.response?.data?.message || 'Unable to close lead');
    } finally {
      setSavingClose(false);
    }
  };

  // Transfer Handlers
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
        <CircularProgress sx={{ color: 'primary.main' }} />
      </Box>
    );
  }

  if (!lead) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error || 'Lead not found'}</Alert>
      </Box>
    );
  }

  const isClosed = lead.closureStatus !== 'OPEN';
  const followUpStatus = (() => {
    if (!lead.nextFollowUpAt) {
      return {
        label: 'No Follow-up Scheduled',
        shortLabel: 'None',
        color: 'text.secondary',
        chipBg: 'rgba(148, 163, 184, 0.1)',
        chipColor: 'text.secondary',
        borderColor: 'divider',
        isOverdue: false,
        isDueToday: false,
        isUpcoming: false,
      };
    }
    if (isClosed) {
      return {
        label: 'Lead Closed',
        shortLabel: 'Lead Closed',
        color: 'text.secondary',
        chipBg: 'rgba(148, 163, 184, 0.1)',
        chipColor: 'text.secondary',
        borderColor: 'divider',
        isOverdue: false,
        isDueToday: false,
        isUpcoming: false,
      };
    }

    const now = new Date();
    const target = new Date(lead.nextFollowUpAt);
    if (isNaN(target.getTime())) {
      return {
        label: 'Invalid Date',
        shortLabel: 'None',
        color: 'text.secondary',
        chipBg: 'rgba(148, 163, 184, 0.1)',
        chipColor: 'text.secondary',
        borderColor: 'divider',
        isOverdue: false,
        isDueToday: false,
        isUpcoming: false,
      };
    }

    const nowDateStr = formatDateToYYYYMMDD(now);
    const targetDateStr = formatDateToYYYYMMDD(target);

    if (target < now) {
      return {
        label: 'Overdue',
        shortLabel: 'Overdue',
        color: 'error.main',
        chipBg: 'rgba(239, 68, 68, 0.15)',
        chipColor: '#ef4444',
        borderColor: 'rgba(239, 68, 68, 0.4)',
        isOverdue: true,
        isDueToday: targetDateStr === nowDateStr,
        isUpcoming: false,
      };
    } else if (targetDateStr === nowDateStr) {
      return {
        label: 'Due Today',
        shortLabel: 'Due Today',
        color: '#f59e0b',
        chipBg: 'rgba(245, 158, 11, 0.15)',
        chipColor: '#f59e0b',
        borderColor: 'rgba(245, 158, 11, 0.4)',
        isOverdue: false,
        isDueToday: true,
        isUpcoming: false,
      };
    } else {
      return {
        label: 'Upcoming',
        shortLabel: 'Upcoming',
        color: 'info.main',
        chipBg: 'rgba(56, 189, 248, 0.15)',
        chipColor: '#38bdf8',
        borderColor: 'rgba(56, 189, 248, 0.4)',
        isOverdue: false,
        isDueToday: false,
        isUpcoming: true,
      };
    }
  })();
  const isOverdue = followUpStatus.isOverdue;
  const isUpcoming = followUpStatus.isUpcoming;
  const isDueToday = followUpStatus.isDueToday;
  const ownerName = lead.currentOwner?.fullName || lead.currentOwner?.username || 'Unassigned';
  const primaryContact = lead.primaryContact || contacts.find((c) => c.isPrimary) || contacts[0];
  const transferActivities = activities.filter((a) => a.action.includes('Transfer') || a.action.includes('Ownership'));
  const dispStyle = getDispositionStyle(lead.latestDisposition);

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header & Quick Actions Bar */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          {/* Title Area */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              startIcon={<ArrowBack />}
              onClick={() => navigate(isAdmin ? '/leads' : '/agent')}
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                color: 'text.secondary',
                bgcolor: '#f8fafc',
                border: '1px solid',
                borderColor: 'divider',
                px: 1.5,
                '&:hover': {
                  bgcolor: 'rgba(234, 88, 12, 0.08)',
                  color: 'primary.main',
                  borderColor: 'primary.main',
                },
              }}
            >
              Back
            </Button>

            <Chip
              label={lead.leadNumber || 'Lead'}
              sx={{
                fontWeight: 700,
                fontSize: 13,
                bgcolor: 'rgba(234, 88, 12, 0.1)',
                color: 'primary.main',
                border: '1px solid rgba(234, 88, 12, 0.25)',
                borderRadius: 1.5,
              }}
            />

            <Typography variant="h5" fontWeight={700} sx={{ color: 'text.primary', letterSpacing: -0.5 }}>
              {lead.organizationName}
            </Typography>

            {/* Status Chip */}
            <Chip
              label={lead.closureStatus}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: 11,
                borderRadius: 1.5,
                bgcolor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.15)' : lead.closureStatus === 'LOST' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 88, 12, 0.12)',
                color: lead.closureStatus === 'WON' ? 'success.main' : lead.closureStatus === 'LOST' ? 'error.main' : 'primary.main',
                border: '1px solid',
                borderColor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.3)' : lead.closureStatus === 'LOST' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 88, 12, 0.3)',
              }}
            />

            {/* Overdue Alert Chip */}
            {isOverdue && (
              <Chip
                icon={<WarningAmber sx={{ fontSize: '14px !important', color: '#ef4444' }} />}
                label="Follow-up Overdue"
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: 11,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              />
            )}

            {/* Due Today Alert Chip */}
            {isDueToday && !isOverdue && (
              <Chip
                icon={<Schedule sx={{ fontSize: '14px !important', color: '#f59e0b' }} />}
                label="Follow-up Due Today"
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: 11,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              />
            )}
          </Box>

          {/* Quick Actions Buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canEdit && (
              <>
                <Button
                  size="small"
                  startIcon={<Phone />}
                  variant="contained"
                  onClick={handleOpenCallLog}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    bgcolor: 'primary.main',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
                    '&:hover': {
                      bgcolor: 'primary.dark',
                    },
                  }}
                >
                  Add Call Log
                </Button>
                <Button
                  size="small"
                  startIcon={<PersonAdd />}
                  variant="outlined"
                  onClick={() => setContactOpen(true)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    borderColor: 'divider',
                    color: 'text.primary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      color: 'primary.main',
                    },
                  }}
                >
                  Add Contact
                </Button>
                <Button
                  size="small"
                  startIcon={<Send />}
                  variant="outlined"
                  onClick={() => setTransferOpen(true)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    borderColor: 'divider',
                    color: 'text.primary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      color: 'primary.main',
                    },
                  }}
                >
                  Transfer
                </Button>
                {!isCallingAgent && (
                  <>
                    <Button
                      size="small"
                      startIcon={<CheckCircleOutline />}
                      variant="outlined"
                      color="success"
                      onClick={() => { setCloseMode('won'); setCloseOpen(true); }}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        '&:hover': {
                          borderColor: 'success.main',
                          bgcolor: 'rgba(16, 185, 129, 0.08)',
                        },
                      }}
                    >
                      Close Won
                    </Button>
                    <Button
                      size="small"
                      startIcon={<Cancel />}
                      variant="outlined"
                      color="error"
                      onClick={() => { setCloseMode('lost'); setCloseOpen(true); }}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        '&:hover': {
                          borderColor: 'error.main',
                          bgcolor: 'rgba(239, 68, 68, 0.08)',
                        },
                      }}
                    >
                      Close Lost
                    </Button>
                  </>
                )}
              </>
            )}
            {canEdit && (isSalesAgent || isAdmin) && (
              <Button
                size="small"
                startIcon={<DirectionsWalk />}
                variant="contained"
                onClick={handleOpenWalkIn}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  bgcolor: '#059669',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                  '&:hover': { bgcolor: '#047857' },
                }}
              >
                Record Walk-in
              </Button>
            )}
            {canEdit && (isSalesAgent || isAdmin) && (
              <Button
                size="small"
                startIcon={<LaptopMac />}
                variant="contained"
                onClick={() => handleOpenDemo()}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  bgcolor: '#4f46e5',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                  '&:hover': { bgcolor: '#4338ca' },
                }}
              >
                {lead.latestDemo ? 'Update Demo' : 'Schedule Demo'}
              </Button>
            )}
            {isOwnerOrAdmin && (
              <Button
                size="small"
                startIcon={<Edit />}
                variant={editMode ? 'contained' : 'outlined'}
                color={editMode ? 'primary' : 'inherit'}
                onClick={() => setEditMode(!editMode)}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  borderColor: 'divider',
                  ...(editMode ? { bgcolor: 'primary.main', color: 'primary.contrastText' } : {}),
                }}
              >
                {editMode ? 'Cancel Edit' : 'Edit Lead'}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      {/* At-a-Glance Summary KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Card 1: Status & Latest Disposition */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                Status & Disposition
              </Typography>
              <Assessment sx={{ fontSize: 18, color: 'primary.main' }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={lead.latestDisposition || 'No Calls Yet'}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: 11,
                    borderRadius: 1.5,
                    bgcolor: dispStyle.bg,
                    color: dispStyle.color,
                    border: `1px solid ${dispStyle.border}`,
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Last Call: {formatDateTime(lead.lastCalledAt)}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Card 2: Follow-up Details */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: followUpStatus.borderColor,
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                Next Follow-up
              </Typography>
              <CalendarMonth sx={{ fontSize: 18, color: followUpStatus.color }} />
            </Box>
            <Box>
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{
                  color: followUpStatus.color,
                  mb: 0.5,
                  fontSize: 13,
                }}
              >
                {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : 'No Follow-up Scheduled'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip
                  label={followUpStatus.shortLabel}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: 10,
                    height: 20,
                    borderRadius: 1,
                    bgcolor: followUpStatus.chipBg,
                    color: followUpStatus.chipColor,
                  }}
                />
                {lead.nextFollowUpAt && !isClosed && canEdit && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<CheckCircle sx={{ fontSize: 12 }} />}
                      onClick={handleOpenCompleteFollowUp}
                      sx={{
                        fontSize: 11,
                        textTransform: 'none',
                        py: 0.2,
                        px: 0.75,
                        minWidth: 'auto',
                        borderRadius: 1.5,
                        fontWeight: 600,
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        color: '#059669',
                        '&:hover': {
                          bgcolor: 'rgba(16, 185, 129, 0.08)',
                          borderColor: '#059669',
                        },
                      }}
                    >
                      Complete
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<Edit sx={{ fontSize: 11 }} />}
                      onClick={handleOpenReschedule}
                      sx={{
                        fontSize: 11,
                        textTransform: 'none',
                        p: 0,
                        minWidth: 'auto',
                        color: 'primary.main',
                        fontWeight: 600,
                        '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                      }}
                    >
                      Edit / Reschedule
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Card 3: Assignment / Owner */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                Assigned Owner
              </Typography>
              <AssignmentInd sx={{ fontSize: 18, color: 'primary.main' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  fontSize: 14,
                  fontWeight: 700,
                  bgcolor: 'rgba(234, 88, 12, 0.12)',
                  color: 'primary.main',
                  border: '1px solid rgba(234, 88, 12, 0.25)',
                }}
              >
                {ownerName.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary' }}>
                  {ownerName}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {lead.currentOwner ? 'Active Agent' : 'Needs Assignment'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Card 4: Primary Contact */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                Primary Contact
              </Typography>
              <Person sx={{ fontSize: 18, color: 'primary.main' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary', mb: 0.3 }}>
                {primaryContact?.name || 'No Contact Person'}
              </Typography>
              {primaryContact?.phone ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="primary.main" fontWeight={500} sx={{ fontSize: 13 }}>
                    {primaryContact.phone}
                  </Typography>
                  <Tooltip title={copiedPhone === primaryContact.phone ? 'Copied!' : 'Copy phone'}>
                    <IconButton size="small" onClick={() => handleCopy(primaryContact.phone)} sx={{ p: 0.3, color: 'text.secondary' }}>
                      {copiedPhone === primaryContact.phone ? <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  No phone available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Card 5: Latest Walk-in (Requirement 5) */}
        {lead.latestWalkIn?.walkInDate && (
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={0}
              sx={{
                p: 2.2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'rgba(5, 150, 105, 0.3)',
                bgcolor: 'rgba(5, 150, 105, 0.02)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                  Latest Walk-in
                </Typography>
                <DirectionsWalk sx={{ fontSize: 18, color: '#059669' }} />
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={700} sx={{ color: '#059669', mb: 0.5, fontSize: 13 }}>
                  {formatDate(lead.latestWalkIn.walkInDate)} • {lead.latestWalkIn.walkInTime}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.latestWalkIn.remark || 'In-person visit'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10, display: 'block', mt: 0.5 }}>
                  Recorded by: {lead.latestWalkIn.salesAgentName || 'Sales Agent'}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Card 6: Latest Demo (Requirements 1, 6) */}
        {lead.latestDemo?.demoDate && (
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={0}
              sx={{
                p: 2.2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'rgba(99, 102, 241, 0.3)',
                bgcolor: 'rgba(99, 102, 241, 0.02)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                  Latest Demo
                </Typography>
                <LaptopMac sx={{ fontSize: 18, color: '#4f46e5' }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#4f46e5', fontSize: 13 }}>
                    {formatDate(lead.latestDemo.demoDate)} • {lead.latestDemo.demoTime}
                  </Typography>
                  <Chip
                    label={lead.latestDemo.status}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      fontSize: 10,
                      height: 20,
                      ...getDemoStatusStyle(lead.latestDemo.status),
                    }}
                  />
                </Box>
                {lead.latestDemo.remarks && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.latestDemo.remarks}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10, display: 'block', mt: 0.5 }}>
                  {lead.latestDemo.updatedByName ? `Updated by: ${lead.latestDemo.updatedByName}` : `Scheduled by: ${lead.latestDemo.salesAgentName || 'Sales Agent'}`}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Card 7: Outcome Details (when lead is WON or LOST) */}
        {isClosed && (
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={0}
              sx={{
                p: 2.2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                bgcolor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                  Final Outcome
                </Typography>
                {lead.closureStatus === 'WON' ? (
                  <CheckCircle sx={{ fontSize: 18, color: '#059669' }} />
                ) : (
                  <Cancel sx={{ fontSize: 18, color: '#dc2626' }} />
                )}
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    icon={lead.closureStatus === 'WON' ? <EmojiEvents sx={{ fontSize: '13px !important' }} /> : <Cancel sx={{ fontSize: '13px !important' }} />}
                    label={lead.closureStatus === 'WON' ? 'Closed Won' : 'Closed Lost'}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      fontSize: 11,
                      height: 22,
                      bgcolor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: lead.closureStatus === 'WON' ? '#059669' : '#dc2626',
                      border: `1px solid ${lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}
                  />
                  {lead.dealValue && (
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#059669', fontSize: 13 }}>
                      ₹{Number(lead.dealValue).toLocaleString()}
                    </Typography>
                  )}
                  {lead.lostReason && (
                    <Typography variant="caption" fontWeight={600} sx={{ color: '#dc2626' }}>
                      Reason: {lead.lostReason}
                    </Typography>
                  )}
                </Box>
                {lead.closingRemark && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{lead.closingRemark}"
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10, display: 'block', mt: 0.5 }}>
                  Closed: {formatDate(lead.closedAt || lead.updatedAt)}{lead.closedBy?.fullName || lead.closedBy?.username ? ` • by ${lead.closedBy.fullName || lead.closedBy.username}` : ''}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Main Content Grid: Detailed Sections */}
      <Grid container spacing={3}>
        {/* LEFT COLUMN: Section 1 (Lead Info) & Section 2 (Contact Info) */}
        <Grid item xs={12} lg={7}>
          {/* Section 1: Lead Information */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(234, 88, 12, 0.12)',
                    color: 'primary.main',
                  }}
                >
                  <Business sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                  Lead Information
                </Typography>
              </Box>

              {isOwnerOrAdmin && !editMode && (
                <Button
                  size="small"
                  startIcon={<Edit />}
                  onClick={() => setEditMode(true)}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 2,
                    fontSize: 12,
                    color: 'text.secondary',
                    '&:hover': { color: 'primary.main' },
                  }}
                >
                  Edit Details
                </Button>
              )}
            </Box>

            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Organization Name
                </Typography>
                {editMode ? (
                  <TextField
                    size="small"
                    fullWidth
                    value={editFields.organizationName}
                    onChange={handleEditField('organizationName')}
                    error={Boolean(fieldErrors.organizationName)}
                    helperText={fieldErrors.organizationName}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                ) : (
                  <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary' }}>
                    {lead.organizationName || '—'}
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Lead Number
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: 'primary.main' }}>
                  {lead.leadNumber || '—'}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Industry
                </Typography>
                {editMode ? (
                  <FormControl fullWidth size="small">
                    <Select value={editFields.industry} onChange={handleEditField('industry')} sx={{ borderRadius: 2 }}>
                      <MenuItem value="">Select Industry</MenuItem>
                      {INDUSTRIES.map((i) => (
                        <MenuItem key={i} value={i}>{i}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {lead.industry || '—'}
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Organization Type
                </Typography>
                {editMode ? (
                  <FormControl fullWidth size="small">
                    <Select value={editFields.organizationType} onChange={handleEditField('organizationType')} sx={{ borderRadius: 2 }}>
                      <MenuItem value="">Select Type</MenuItem>
                      {ORGANIZATION_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>{t}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {lead.organizationType || '—'}
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Lead Source
                </Typography>
                {editMode ? (
                  <FormControl fullWidth size="small">
                    <Select value={editFields.leadSource} onChange={handleEditField('leadSource')} sx={{ borderRadius: 2 }}>
                      <MenuItem value="">Select Source</MenuItem>
                      {LEAD_SOURCES.map((s) => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Chip
                    label={lead.leadSource || 'Unknown'}
                    size="small"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 500,
                      bgcolor: '#f1f5f9',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  />
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Software Used
                </Typography>
                {editMode ? (
                  <FormControl fullWidth size="small">
                    <Select
                      value={editFields.existingSoftwareUsed || ''}
                      onChange={(e) => setEditFields((p) => ({ ...p, existingSoftwareUsed: e.target.value }))}
                      sx={{ borderRadius: 2 }}
                    >
                      {['', 'Yes', 'No', 'Unknown'].map((o) => (
                        <MenuItem key={o} value={o}>{o || 'Select option'}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {lead.existingSoftwareUsed ? `${lead.existingSoftwareUsed}${lead.softwareName ? ` (${lead.softwareName})` : ''}` : '—'}
                  </Typography>
                )}
              </Grid>

              {editMode && editFields.existingSoftwareUsed === 'Yes' && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                    Software Name
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Enter existing software name"
                    value={editFields.softwareName || ''}
                    onChange={(e) => setEditFields((p) => ({ ...p, softwareName: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Grid>
              )}

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                  Address
                </Typography>
                {editMode ? (
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Full address"
                    value={editFields.address}
                    onChange={handleEditField('address')}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                    {lead.address || '—'}
                  </Typography>
                )}
              </Grid>
            </Grid>

            {editMode && (
              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setEditMode(false)}
                  sx={{ borderRadius: 2, textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveEdit}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    bgcolor: 'primary.main',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
                    '&:hover': { bgcolor: 'primary.dark' },
                  }}
                >
                  Save Changes
                </Button>
              </Box>
            )}
          </Paper>

          {/* Section 2: Contact Information */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(234, 88, 12, 0.12)',
                    color: 'primary.main',
                  }}
                >
                  <People sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                  Contact Information ({contacts.length})
                </Typography>
              </Box>

              {canEdit && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PersonAdd />}
                  onClick={() => setContactOpen(true)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: 12,
                    borderColor: 'divider',
                    color: 'primary.main',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(234, 88, 12, 0.08)' },
                  }}
                >
                  Add Contact
                </Button>
              )}
            </Box>

            {contacts.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary" variant="body2">
                  No contact persons added yet.
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {contacts.map((contact) => {
                  const isPrim = contact.isPrimary || contact._id === lead.primaryContact?._id;
                  return (
                    <Grid item xs={12} sm={6} key={contact._id}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.2,
                          borderRadius: 2.5,
                          border: '1px solid',
                          borderColor: isPrim ? 'rgba(234, 88, 12, 0.4)' : 'divider',
                          bgcolor: isPrim ? 'rgba(234, 88, 12, 0.04)' : '#ffffff',
                          position: 'relative',
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: isPrim ? 'primary.main' : '#cbd5e1',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary' }}>
                              {contact.name}
                            </Typography>
                            {isPrim && (
                              <Chip
                                icon={<Star sx={{ fontSize: '12px !important', color: '#ffffff' }} />}
                                label="Primary"
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  bgcolor: 'primary.main',
                                  color: '#ffffff',
                                  borderRadius: 1,
                                }}
                              />
                            )}
                          </Box>
                        </Box>

                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          {contact.designation || 'No Designation'}
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Phone sx={{ fontSize: 14, color: 'primary.main' }} />
                            <Typography variant="body2" sx={{ fontSize: 13, color: 'text.primary' }}>
                              {contact.phone}
                            </Typography>
                            <Tooltip title={copiedPhone === contact.phone ? 'Copied!' : 'Copy phone'}>
                              <IconButton size="small" onClick={() => handleCopy(contact.phone)} sx={{ p: 0.2, color: 'text.secondary' }}>
                                {copiedPhone === contact.phone ? <CheckIcon sx={{ fontSize: 12, color: 'success.main' }} /> : <ContentCopy sx={{ fontSize: 12 }} />}
                              </IconButton>
                            </Tooltip>
                          </Box>

                          {contact.altPhone && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                Alt: {contact.altPhone}
                              </Typography>
                            </Box>
                          )}

                          {contact.email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Email sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {contact.email}
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        {canEdit && (
                          <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<Edit sx={{ fontSize: 12 }} />}
                              onClick={() => handleOpenEditContact(contact)}
                              sx={{ fontSize: 11, textTransform: 'none', color: 'text.secondary', p: 0.5 }}
                            >
                              Edit
                            </Button>
                            {!isPrim && (
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => handleSetPrimary(contact._id)}
                                sx={{ fontSize: 11, textTransform: 'none', color: 'primary.main', p: 0.5 }}
                              >
                                Set as Primary
                              </Button>
                            )}
                          </Box>
                        )}
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Paper>
        </Grid>

        {/* RIGHT COLUMN: Section 3 (Assignment/Owner), Section 4 (Status & Disposition), Section 5 (Follow-up) */}
        <Grid item xs={12} lg={5}>
          {/* Section 3: Assignment & Owner */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(234, 88, 12, 0.12)',
                    color: 'primary.main',
                  }}
                >
                  <AssignmentInd sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                  Assignment & Ownership
                </Typography>
              </Box>

              {canEdit && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Send sx={{ fontSize: 12 }} />}
                  onClick={() => setTransferOpen(true)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: 11,
                    borderColor: 'divider',
                    color: 'primary.main',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  Reassign
                </Button>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Current Owner
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: 'rgba(234, 88, 12, 0.12)',
                      color: 'primary.main',
                    }}
                  >
                    {ownerName.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary' }}>
                    {ownerName}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ borderColor: 'divider' }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Created By
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {lead.createdBy?.fullName || lead.createdBy?.username || 'System'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Created Date
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {formatDateTime(lead.createdAt)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Last Updated
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {formatDateTime(lead.updatedAt)}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Section 4: Current Status & Latest Disposition */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(234, 88, 12, 0.12)',
                  color: 'primary.main',
                }}
              >
                <Assessment sx={{ fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                Current Status & Disposition
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Lead Lifecycle Status
                </Typography>
                <Chip
                  label={lead.closureStatus}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    borderRadius: 1.5,
                    bgcolor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.15)' : lead.closureStatus === 'LOST' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 88, 12, 0.12)',
                    color: lead.closureStatus === 'WON' ? 'success.main' : lead.closureStatus === 'LOST' ? 'error.main' : 'primary.main',
                    border: '1px solid',
                    borderColor: lead.closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.3)' : lead.closureStatus === 'LOST' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 88, 12, 0.3)',
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Latest Call Disposition
                </Typography>
                <Chip
                  label={lead.latestDisposition || 'None'}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: 11,
                    borderRadius: 1.5,
                    bgcolor: dispStyle.bg,
                    color: dispStyle.color,
                    border: `1px solid ${dispStyle.border}`,
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Last Contacted
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {formatDateTime(lead.lastCalledAt)}
                </Typography>
              </Box>

              {isClosed && (
                <>
                  <Divider sx={{ borderColor: 'divider' }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Closed By
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                      {lead.closedBy?.fullName || lead.closedBy?.username || '—'}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Closed Date
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                      {formatDateTime(lead.closedAt)}
                    </Typography>
                  </Box>

                  {lead.closingRemark && (
                    <Box sx={{ py: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.3 }}>
                        Closing Remark
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.primary', fontStyle: 'italic' }}>
                        "{lead.closingRemark}"
                      </Typography>
                    </Box>
                  )}

                  {lead.closureStatus === 'WON' && (
                    <>
                      {lead.dealValue && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={500}>
                            Deal Value
                          </Typography>
                          <Typography variant="body2" fontWeight={700} sx={{ color: 'success.main' }}>
                            ₹{Number(lead.dealValue).toLocaleString('en-IN')}
                          </Typography>
                        </Box>
                      )}
                      {lead.product && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={500}>
                            Product
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.primary' }}>
                            {lead.product}
                          </Typography>
                        </Box>
                      )}
                    </>
                  )}

                  {lead.closureStatus === 'LOST' && lead.lostReason && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        Lost Reason
                      </Typography>
                      <Chip
                        label={lead.lostReason}
                        size="small"
                        sx={{
                          fontWeight: 500,
                          fontSize: 11,
                          bgcolor: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  )}
                </>
              )}

              {canEdit && (
                <Box sx={{ mt: 1, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                    onClick={() => { setCloseMode('won'); setCloseOpen(true); }}
                    fullWidth
                    sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
                  >
                    Close as Won
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    startIcon={<Cancel sx={{ fontSize: 14 }} />}
                    onClick={() => { setCloseMode('lost'); setCloseOpen(true); }}
                    fullWidth
                    sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
                  >
                    Close as Lost
                  </Button>
                </Box>
              )}
            </Box>
          </Paper>

          {/* Section 5: Follow-up Details */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: followUpStatus.borderColor,
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: isOverdue ? 'rgba(239, 68, 68, 0.12)' : isDueToday ? 'rgba(245, 158, 11, 0.12)' : 'rgba(234, 88, 12, 0.12)',
                    color: followUpStatus.color,
                  }}
                >
                  <CalendarMonth sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                  Follow-up Details
                </Typography>
              </Box>

              {canEdit && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {lead.nextFollowUpAt && !isClosed && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircle sx={{ fontSize: 12 }} />}
                      onClick={handleOpenCompleteFollowUp}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontSize: 11,
                        bgcolor: '#059669',
                        color: '#ffffff',
                        boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                        '&:hover': { bgcolor: '#047857' },
                      }}
                    >
                      Complete
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={lead.nextFollowUpAt ? <Edit sx={{ fontSize: 12 }} /> : <Schedule sx={{ fontSize: 12 }} />}
                    onClick={lead.nextFollowUpAt ? handleOpenReschedule : handleOpenCallLog}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontSize: 11,
                      borderColor: 'divider',
                      color: 'primary.main',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    {lead.nextFollowUpAt ? 'Reschedule' : 'Set Follow-up'}
                  </Button>
                </Box>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Next Follow-up
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ color: followUpStatus.color }}
                >
                  {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : 'No follow-up set'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  Follow-up Status
                </Typography>
                <Chip
                  label={followUpStatus.shortLabel}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: 11,
                    borderRadius: 1.5,
                    bgcolor: followUpStatus.chipBg,
                    color: followUpStatus.chipColor,
                    border: '1px solid',
                    borderColor: followUpStatus.borderColor,
                  }}
                />
              </Box>

              {logs.length > 0 && logs[0].followUpAt && (
                <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.3 }}>
                    Last Scheduled Note
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, fontStyle: 'italic' }}>
                    "{logs[0].remark}"
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* FULL WIDTH: Section 6 (Activity & Call History) */}
        <Grid item xs={12}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            {/* Section Header with Tabs */}
            <Box sx={{ p: 2.5, pb: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'rgba(234, 88, 12, 0.12)',
                      color: 'primary.main',
                    }}
                  >
                    <History sx={{ fontSize: 18 }} />
                  </Box>
                  <Typography variant="h6" fontWeight={700} sx={{ fontSize: 16 }}>
                    Activity & Call History
                  </Typography>
                </Box>

                {canEdit && historyTab === 0 && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Phone />}
                    onClick={handleOpenCallLog}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontSize: 12,
                      bgcolor: 'primary.main',
                      color: '#ffffff',
                      '&:hover': { bgcolor: 'primary.dark' },
                    }}
                  >
                    Add Call Log
                  </Button>
                )}
              </Box>

              <Tabs
                value={historyTab}
                onChange={(_, v) => setHistoryTab(v)}
                sx={{
                  '& .MuiTabs-indicator': {
                    bgcolor: 'primary.main',
                    height: 3,
                    borderRadius: '3px 3px 0 0',
                  },
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    minHeight: 44,
                    color: 'text.secondary',
                    '&.Mui-selected': {
                      color: 'primary.main',
                    },
                  },
                }}
              >
                <Tab label={`Call Trail (${logs.length})`} />
                <Tab label={`Activity Log (${activities.length})`} />
                <Tab label={`Transfer History (${transferActivities.length})`} />
                <Tab label={`Walk-in Visits (${walkIns.length})`} />
                <Tab label={`Product Demos (${demos.length})`} />
              </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ p: 3 }}>
              {/* Tab 0: Call Trail */}
              {historyTab === 0 && (
                <Box>
                  {logs.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <Phone sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                      <Typography color="text.secondary" variant="body2">
                        No call logs recorded yet.
                      </Typography>
                      {canEdit && (
                        <Button
                          size="small"
                          startIcon={<Phone />}
                          variant="outlined"
                          onClick={handleOpenCallLog}
                          sx={{ mt: 2, borderRadius: 2, textTransform: 'none', borderColor: 'divider', color: 'primary.main' }}
                        >
                          Log First Call
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {logs.map((log, idx) => {
                        const logDispStyle = getDispositionStyle(log.disposition);
                        return (
                          <Paper
                            key={log._id}
                            elevation={0}
                            sx={{
                              p: 2.2,
                              borderRadius: 2.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderLeft: '4px solid',
                              borderLeftColor: logDispStyle.color,
                              bgcolor: '#f8fafc',
                              transition: 'all 0.2s',
                              '&:hover': {
                                bgcolor: 'rgba(234, 88, 12, 0.04)',
                                borderColor: 'rgba(234, 88, 12, 0.3)',
                                borderLeftColor: logDispStyle.color,
                              },
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                                <Chip
                                  label={`Call #${logs.length - idx}`}
                                  size="small"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 10,
                                    borderRadius: 1,
                                    bgcolor: '#e2e8f0',
                                    color: 'text.secondary',
                                  }}
                                />
                                <Chip
                                  label={log.disposition}
                                  size="small"
                                  sx={{
                                    fontWeight: 600,
                                    fontSize: 11,
                                    borderRadius: 1.5,
                                    bgcolor: logDispStyle.bg,
                                    color: logDispStyle.color,
                                    border: `1px solid ${logDispStyle.border}`,
                                  }}
                                />
                              </Box>

                              <Typography variant="caption" color="text.secondary">
                                {formatDateTime(log.calledAt || log.createdAt)}
                              </Typography>
                            </Box>

                            <Grid container spacing={2} sx={{ mb: 1 }}>
                              <Grid item xs={12} sm={4}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Contact Person Called
                                </Typography>
                                <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary' }}>
                                  {log.calledContact?.name || log.calledContactName || 'Unknown Contact'}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Called By
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                  {log.user?.fullName || log.user?.username || '—'}
                                </Typography>
                              </Grid>
                              {log.followUpAt && (
                                <Grid item xs={12} sm={4}>
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    Next Follow-up Set
                                  </Typography>
                                  <Typography variant="body2" fontWeight={600} sx={{ color: 'info.main' }}>
                                    {formatDateTime(log.followUpAt)}
                                  </Typography>
                                </Grid>
                              )}
                            </Grid>

                            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: '#e2e8f0' }}>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.3 }}>
                                Remark
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.5 }}>
                                {log.remark}
                              </Typography>
                            </Box>

                            {log.followUpAt && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                <Schedule sx={{ fontSize: 14, color: 'info.main' }} />
                                <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600 }}>
                                  Follow-up Scheduled: {formatDateTime(log.followUpAt)}
                                </Typography>
                              </Box>
                            )}
                          </Paper>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              )}

              {/* Tab 1: Activity Log */}
              {historyTab === 1 && (
                <Box>
                  {activities.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <Typography color="text.secondary" variant="body2">
                        No activity recorded yet.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {activities.map((act) => (
                        <Paper
                          key={act._id}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: '#f8fafc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={600} sx={{ color: 'text.primary' }}>
                              {act.action}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              By {act.performedBy?.fullName || act.performedBy?.role || 'System'}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(act.createdAt)}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              )}

              {/* Tab 2: Transfer History */}
              {historyTab === 2 && (
                <Box>
                  {transferActivities.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <Typography color="text.secondary" variant="body2">
                        No transfer history recorded for this lead.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {transferActivities.map((act) => (
                        <Paper
                          key={act._id}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: '#f8fafc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={600} sx={{ color: 'primary.main' }}>
                              {act.action}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              By {act.performedBy?.fullName || act.performedBy?.role || 'System'}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(act.createdAt)}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              )}

              {/* Tab 3: Walk-in Visits (Requirement 5) */}
              {historyTab === 3 && (
                <Box>
                  {walkIns.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <DirectionsWalk sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                      <Typography color="text.secondary" variant="body2">
                        No walk-in visits recorded yet.
                      </Typography>
                      {canEdit && (isSalesAgent || isAdmin) && (
                        <Button
                          size="small"
                          startIcon={<DirectionsWalk />}
                          variant="outlined"
                          onClick={handleOpenWalkIn}
                          sx={{ mt: 2, borderRadius: 2, textTransform: 'none', borderColor: 'divider', color: '#059669' }}
                        >
                          Record First Walk-in
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {walkIns.map((w) => (
                        <Paper
                          key={w._id}
                          elevation={0}
                          sx={{
                            p: 2.5,
                            borderRadius: 2.5,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar sx={{ width: 34, height: 34, bgcolor: 'rgba(5, 150, 105, 0.12)', color: '#059669' }}>
                                <DirectionsWalk sx={{ fontSize: 18 }} />
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle2" fontWeight={700}>
                                  Walk-in Visit
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Recorded by {w.salesAgent?.fullName || w.salesAgent?.username || 'Sales Agent'}
                                </Typography>
                              </Box>
                            </Box>
                            <Chip
                              label={`${formatDate(w.walkInDate)} • ${w.walkInTime}`}
                              size="small"
                              sx={{
                                fontWeight: 600,
                                fontSize: 11,
                                height: 22,
                                bgcolor: 'rgba(5, 150, 105, 0.12)',
                                color: '#059669',
                                border: '1px solid rgba(5, 150, 105, 0.3)',
                              }}
                            />
                          </Box>
                          <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                            <Typography variant="body2" sx={{ color: '#334155', whiteSpace: 'pre-line' }}>
                              {w.remark}
                            </Typography>
                          </Paper>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              )}

              {/* Tab 4: Product Demos (Requirements 1, 2, 3, 6, 7) */}
              {historyTab === 4 && (
                <Box>
                  {demos.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <LaptopMac sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                      <Typography color="text.secondary" variant="body2">
                        No product demos scheduled or recorded yet.
                      </Typography>
                      {canEdit && (isSalesAgent || isAdmin) && (
                        <Button
                          size="small"
                          startIcon={<LaptopMac />}
                          variant="outlined"
                          onClick={() => handleOpenDemo()}
                          sx={{ mt: 2, borderRadius: 2, textTransform: 'none', borderColor: 'divider', color: '#4f46e5' }}
                        >
                          Schedule First Demo
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {demos.map((d) => {
                        const dStyle = getDemoStatusStyle(d.status);
                        return (
                          <Paper
                            key={d._id}
                            elevation={0}
                            sx={{
                              p: 2.5,
                              borderRadius: 2.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              bgcolor: 'background.paper',
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar sx={{ width: 34, height: 34, bgcolor: 'rgba(79, 70, 229, 0.12)', color: '#4f46e5' }}>
                                  <LaptopMac sx={{ fontSize: 18 }} />
                                </Avatar>
                                <Box>
                                  <Typography variant="subtitle2" fontWeight={700}>
                                    Product Demo
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {d.updatedBy ? `Updated by ${d.updatedBy.fullName || d.updatedBy.username}` : `Scheduled by ${d.salesAgent?.fullName || d.salesAgent?.username || 'Sales Agent'}`}
                                  </Typography>
                                </Box>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={`${formatDate(d.demoDate)} • ${d.demoTime}`}
                                  size="small"
                                  sx={{
                                    fontWeight: 600,
                                    fontSize: 11,
                                    height: 22,
                                    bgcolor: 'rgba(79, 70, 229, 0.12)',
                                    color: '#4f46e5',
                                    border: '1px solid rgba(79, 70, 229, 0.3)',
                                  }}
                                />
                                <Chip
                                  label={d.status}
                                  size="small"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 11,
                                    height: 22,
                                    bgcolor: dStyle.bg,
                                    color: dStyle.color,
                                    border: `1px solid ${dStyle.border}`,
                                  }}
                                />
                                {canEdit && (isSalesAgent || isAdmin) && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleOpenDemo(d)}
                                    sx={{
                                      minWidth: 'auto',
                                      py: 0.25,
                                      px: 1,
                                      fontSize: 11,
                                      borderRadius: 1.5,
                                      textTransform: 'none',
                                      borderColor: '#cbd5e1',
                                      color: '#475569',
                                      '&:hover': {
                                        borderColor: '#4f46e5',
                                        color: '#4f46e5',
                                        bgcolor: 'rgba(79, 70, 229, 0.04)',
                                      },
                                    }}
                                  >
                                    Update Status
                                  </Button>
                                )}
                              </Box>
                            </Box>
                            {d.remarks && (
                              <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                                <Typography variant="body2" sx={{ color: '#334155', whiteSpace: 'pre-line' }}>
                                  {d.remarks}
                                </Typography>
                              </Paper>
                            )}
                          </Paper>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Add Call Log Dialog */}
      <Dialog
        open={callLogOpen}
        onClose={() => setCallLogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <Phone sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Add Call Log
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={() => setCallLogOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {callError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{callError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <Autocomplete
                freeSolo
                size="small"
                options={contacts}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  if (!option) return '';
                  return `${option.name}${option.isPrimary ? ' (Primary)' : ''} - ${option.phone}`;
                }}
                isOptionEqualToValue={(option, value) => {
                  if (typeof value === 'string') return option.name === value;
                  return option._id === value._id;
                }}
                value={
                  contacts.find((c) => c._id === callData.calledContactId) ||
                  callData.calledContactName ||
                  null
                }
                onChange={(event, newValue) => {
                  if (!newValue) {
                    setCallData((p) => ({ ...p, calledContactId: '', calledContactName: '', calledContactPhone: '' }));
                  } else if (typeof newValue === 'string') {
                    const matched = contacts.find((c) => c.name.toLowerCase() === newValue.toLowerCase());
                    if (matched) {
                      setCallData((p) => ({ ...p, calledContactId: matched._id, calledContactName: matched.name, calledContactPhone: matched.phone }));
                    } else {
                      setCallData((p) => ({ ...p, calledContactId: '', calledContactName: newValue }));
                    }
                  } else if (newValue._id) {
                    setCallData((p) => ({
                      ...p,
                      calledContactId: newValue._id,
                      calledContactName: newValue.name,
                      calledContactPhone: newValue.phone,
                    }));
                  }
                }}
                onInputChange={(event, newInputValue, reason) => {
                  if (reason === 'input') {
                    const matched = contacts.find(
                      (c) =>
                        c.name.toLowerCase() === newInputValue.toLowerCase() ||
                        `${c.name}${c.isPrimary ? ' (Primary)' : ''} - ${c.phone}`.toLowerCase() === newInputValue.toLowerCase()
                    );
                    if (matched) {
                      setCallData((p) => ({
                        ...p,
                        calledContactId: matched._id,
                        calledContactName: matched.name,
                        calledContactPhone: matched.phone,
                      }));
                    } else {
                      setCallData((p) => ({
                        ...p,
                        calledContactId: '',
                        calledContactName: newInputValue,
                      }));
                    }
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Contact Person Called"
                    placeholder="Select or type contact person..."
                    helperText={
                      !callData.calledContactId && callData.calledContactName
                        ? 'New contact name (will be saved for this lead)'
                        : contacts.length === 0
                        ? 'No saved contacts. Type contact person name above.'
                        : 'Select or type to search / add contact'
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option._id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', py: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontSize={13} fontWeight={option.isPrimary ? 600 : 500}>
                          {option.name}
                        </Typography>
                        {option.isPrimary && (
                          <Chip label="Primary" size="small" color="primary" sx={{ height: 18, fontSize: 10, fontWeight: 600 }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {option.phone} {option.designation ? `• ${option.designation}` : ''}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
            </Grid>

            {!callData.calledContactId && Boolean(callData.calledContactName) && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Contact Phone"
                  placeholder="Enter phone number (optional)"
                  value={callData.calledContactPhone || ''}
                  onChange={(e) => setCallData((p) => ({ ...p, calledContactPhone: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            )}

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Call Date & Time"
                type="datetime-local"
                value={callData.calledAt}
                onChange={(e) => setCallData((p) => ({ ...p, calledAt: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required size="small">
                <InputLabel>Disposition</InputLabel>
                <Select
                  value={callData.disposition}
                  label="Disposition"
                  onChange={(e) => setCallData((p) => ({ ...p, disposition: e.target.value }))}
                  sx={{ borderRadius: 2 }}
                >
                  {CALL_DISPOSITIONS.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Call Remark"
                multiline
                rows={3}
                placeholder="Details about the call conversation, objections, requirements..."
                value={callData.remark}
                onChange={(e) => setCallData((p) => ({ ...p, remark: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Next Follow-up / Appointment"
                type="datetime-local"
                value={callData.followUpAt}
                onChange={(e) => setCallData((p) => ({ ...p, followUpAt: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                helperText="Schedule next follow-up date"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Existing Software</InputLabel>
                <Select
                  value={callData.existingSoftwareUsed}
                  label="Existing Software"
                  onChange={(e) => setCallData((p) => ({ ...p, existingSoftwareUsed: e.target.value }))}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value=""><em>No change</em></MenuItem>
                  {SOFTWARE_OPTIONS.map((o) => (
                    <MenuItem key={o} value={o}>{o}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {callData.existingSoftwareUsed === 'Yes' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Software Name"
                  placeholder="Software currently in use"
                  value={callData.softwareName}
                  onChange={(e) => setCallData((p) => ({ ...p, softwareName: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setCallLogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddCallLog}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            Save Call Log
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <PersonAdd sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Add Contact Person
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={() => setContactOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Full Name"
                value={contactData.name}
                onChange={(e) => setContactData((p) => ({ ...p, name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Designation"
                value={contactData.designation}
                onChange={(e) => setContactData((p) => ({ ...p, designation: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Phone Number"
                value={contactData.phone}
                onChange={(e) => setContactData((p) => ({ ...p, phone: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Alternate Phone"
                value={contactData.altPhone}
                onChange={(e) => setContactData((p) => ({ ...p, altPhone: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Email Address"
                value={contactData.email}
                onChange={(e) => setContactData((p) => ({ ...p, email: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Set as Primary Contact</InputLabel>
                <Select
                  value={contactData.setAsPrimary ? 'yes' : 'no'}
                  label="Set as Primary Contact"
                  onChange={(e) => setContactData((p) => ({ ...p, setAsPrimary: e.target.value === 'yes' }))}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="no">No</MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setContactOpen(false)} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddContact}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            Add Contact
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog
        open={editContactOpen}
        onClose={() => setEditContactOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <Edit sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Edit Contact Person
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={() => setEditContactOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {editContactError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{editContactError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Full Name"
                value={editContactData.name}
                onChange={handleEditContactChange('name')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Designation"
                value={editContactData.designation}
                onChange={handleEditContactChange('designation')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Phone Number"
                value={editContactData.phone}
                onChange={handleEditContactChange('phone')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Alternate Phone"
                value={editContactData.altPhone}
                onChange={handleEditContactChange('altPhone')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Email Address"
                value={editContactData.email}
                onChange={handleEditContactChange('email')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setEditContactOpen(false)} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEditContact}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close Lead Dialog */}
      <Dialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          {closeMode === 'won' ? <CheckCircle color="success" /> : <Cancel color="error" />}
          <Typography variant="h6" fontWeight={700}>
            Close Lead as {closeMode === 'won' ? 'Won' : 'Lost'}
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={() => setCloseOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {closeError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setCloseError(null)}>
              {closeError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required={closeMode === 'lost' && !closeData.lostReason}
                label={closeMode === 'won' ? 'Closing Notes / Remarks (Optional)' : 'Closing Remark / Notes *'}
                multiline
                rows={3}
                placeholder={
                  closeMode === 'won'
                    ? 'Optional notes regarding closing this lead...'
                    : 'Reason or notes regarding closing this lead...'
                }
                value={closeData.closingRemark}
                onChange={(e) => setCloseData((p) => ({ ...p, closingRemark: e.target.value }))}
                helperText={
                  closeMode === 'won'
                    ? 'Optional for Won leads'
                    : 'Remark or reason is required when marking lead as Lost'
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            {closeMode === 'won' && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Deal Value (₹)"
                    type="number"
                    value={closeData.dealValue}
                    onChange={(e) => setCloseData((p) => ({ ...p, dealValue: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Product / Service"
                    value={closeData.product}
                    onChange={(e) => setCloseData((p) => ({ ...p, product: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Grid>
              </>
            )}
            {closeMode === 'lost' && (
              <Grid item xs={12}>
                <FormControl fullWidth required size="small">
                  <InputLabel>Lost Reason</InputLabel>
                  <Select
                    value={closeData.lostReason}
                    label="Lost Reason"
                    onChange={(e) => setCloseData((p) => ({ ...p, lostReason: e.target.value }))}
                    sx={{ borderRadius: 2 }}
                  >
                    {LOST_REASONS.map((r) => (
                      <MenuItem key={r} value={r}>{r}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setCloseOpen(false)} disabled={savingClose} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={closeMode === 'won' ? 'success' : 'error'}
            onClick={handleCloseLead}
            disabled={savingClose || (closeMode === 'lost' && !closeData.closingRemark?.trim() && !closeData.lostReason)}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            {savingClose ? 'Saving...' : `Confirm Close as ${closeMode === 'won' ? 'Won' : 'Lost'}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <Send sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Reassign / Transfer Lead
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={() => setTransferOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <FormControl fullWidth sx={{ mt: 1 }} size="small">
            <InputLabel>Transfer to Agent</InputLabel>
            <Select
              value={transferAgent}
              label="Transfer to Agent"
              onChange={(e) => setTransferAgent(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">Select agent</MenuItem>
              {agents.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.fullName || a.username}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {agents.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              No other active agents available.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setTransferOpen(false)} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleTransfer}
            disabled={!transferAgent || agents.length === 0}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            Send Transfer Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Record Customer Walk-in Modal (for Sales Agent & Admin) */}
      <Dialog
        open={walkInOpen}
        onClose={handleCloseWalkIn}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <DirectionsWalk sx={{ color: '#059669' }} />
          <Typography variant="h6" fontWeight={700}>
            Record Customer Walk-in
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={handleCloseWalkIn}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {walkInError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{walkInError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                type="date"
                label="Walk-in Date *"
                value={walkInData.walkInDate}
                onChange={(e) => setWalkInData((p) => ({ ...p, walkInDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                type="time"
                label="Walk-in Time *"
                value={walkInData.walkInTime}
                onChange={(e) => setWalkInData((p) => ({ ...p, walkInTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={3}
                label="Walk-in Remarks *"
                placeholder="Enter customer visit summary, in-person discussions, clinic requirements..."
                value={walkInData.remark}
                onChange={(e) => setWalkInData((p) => ({ ...p, remark: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleCloseWalkIn} disabled={savingWalkIn} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveWalkIn}
            disabled={savingWalkIn}
            startIcon={savingWalkIn ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: '#059669',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              '&:hover': { bgcolor: '#047857' },
            }}
          >
            {savingWalkIn ? 'Saving...' : 'Save Walk-in'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product Demo Modal (for Sales Agent & Admin - Requirements 1, 2, 3, 7) */}
      <Dialog
        open={demoOpen}
        onClose={handleCloseDemo}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <LaptopMac sx={{ color: '#4f46e5' }} />
          <Typography variant="h6" fontWeight={700}>
            {editingDemoId ? 'Update Product Demo' : 'Schedule Product Demo'}
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={handleCloseDemo}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {demoError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{demoError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                type="date"
                label="Demo Date *"
                value={demoData.demoDate}
                onChange={(e) => setDemoData((p) => ({ ...p, demoDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                type="time"
                label="Demo Time *"
                value={demoData.demoTime}
                onChange={(e) => setDemoData((p) => ({ ...p, demoTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            {(() => {
              const isFuture = (() => {
                if (!demoData.demoDate || !demoData.demoTime) return false;
                const parts = demoData.demoDate.substring(0, 10).split('-').map(Number);
                const [h, m] = demoData.demoTime.split(':').map(Number);
                const d = new Date(parts[0], parts[1] - 1, parts[2], h || 0, m || 0, 0, 0);
                return d > new Date();
              })();

              return (
                <>
                  <Grid item xs={12}>
                    <FormControl fullWidth size="small" required>
                      <InputLabel id="lead-details-demo-status-label">Demo Status *</InputLabel>
                      <Select
                        labelId="lead-details-demo-status-label"
                        label="Demo Status *"
                        value={demoData.status}
                        onChange={(e) => setDemoData((p) => ({ ...p, status: e.target.value }))}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="Planned">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label="Planned" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' }} />
                            <Typography variant="body2" color="text.secondary">(Scheduled for future)</Typography>
                          </Box>
                        </MenuItem>
                        <MenuItem value="Done" disabled={isFuture}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label="Done" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(16, 185, 129, 0.12)', color: '#059669' }} />
                            <Typography variant="body2" color="text.secondary">
                              {isFuture ? '(Cannot mark Done before scheduled time)' : '(Demo completed successfully)'}
                            </Typography>
                          </Box>
                        </MenuItem>
                        <MenuItem value="Not Done">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label="Not Done" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }} />
                            <Typography variant="body2" color="text.secondary">(Customer absent / cancelled)</Typography>
                          </Box>
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  {demoData.status === 'Done' && isFuture && (
                    <Grid item xs={12}>
                      <Alert severity="warning" sx={{ borderRadius: 2 }}>
                        Cannot mark as Done: The scheduled demo time is in the future ({demoData.demoDate} at {demoData.demoTime}). A demo cannot be marked Done before its scheduled date and time.
                      </Alert>
                    </Grid>
                  )}
                </>
              );
            })()}

            <Grid item xs={12}>
              <TextField
                fullWidth
                required={demoData.status === 'Done' || demoData.status === 'Not Done'}
                multiline
                rows={3}
                label={
                  demoData.status === 'Done' || demoData.status === 'Not Done'
                    ? 'Demo Remarks / Notes * (Required)'
                    : 'Demo Remarks / Notes'
                }
                placeholder={
                  demoData.status === 'Done'
                    ? 'Enter demo outcome, modules demonstrated, customer feedback, next steps... (Required)'
                    : demoData.status === 'Not Done'
                    ? 'Enter reason demo was not done (customer unavailable, cancelled, rescheduled)... (Required)'
                    : 'Enter product modules to cover, customer requirements, special notes...'
                }
                value={demoData.remarks}
                onChange={(e) => setDemoData((p) => ({ ...p, remarks: e.target.value }))}
                helperText={
                  demoData.status === 'Done' || demoData.status === 'Not Done'
                    ? 'Remarks are mandatory when marking demo as Done or Not Done'
                    : ''
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleCloseDemo} disabled={savingDemo} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveDemo}
            disabled={savingDemo}
            startIcon={savingDemo ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: '#4f46e5',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
              '&:hover': { bgcolor: '#4338ca' },
            }}
          >
            {savingDemo ? 'Saving...' : editingDemoId ? 'Update Demo' : 'Save Demo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reschedule Follow-up Modal */}
      <Dialog
        open={rescheduleOpen}
        onClose={handleCloseReschedule}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <CalendarMonth sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: 17 }}>
            Edit / Reschedule Follow-up
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={handleCloseReschedule}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {rescheduleError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{rescheduleError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                type="date"
                label="Follow-up Date *"
                value={rescheduleData.followUpDate}
                onChange={(e) => setRescheduleData((p) => ({ ...p, followUpDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="time"
                label="Follow-up Time"
                value={rescheduleData.followUpTime}
                onChange={(e) => setRescheduleData((p) => ({ ...p, followUpTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Remarks (Optional)"
                placeholder="Reason for rescheduling or notes for next follow-up call..."
                value={rescheduleData.remarks}
                onChange={(e) => setRescheduleData((p) => ({ ...p, remarks: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleCloseReschedule} disabled={savingReschedule} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveReschedule}
            disabled={savingReschedule}
            startIcon={savingReschedule ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            {savingReschedule ? 'Saving...' : 'Save Follow-up'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Complete Follow-up Modal Dialog */}
      <Dialog
        open={completeFollowUpOpen}
        onClose={handleCloseCompleteFollowUp}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
          <CheckCircle sx={{ color: '#059669' }} />
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: 17 }}>
            Complete Follow-up
          </Typography>
          <IconButton sx={{ ml: 'auto', color: 'text.secondary' }} onClick={handleCloseCompleteFollowUp}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {completeError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{completeError}</Alert>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Mark the follow-up scheduled for <strong>{lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : 'this lead'}</strong> as completed? It will be cleared from upcoming/overdue lists and preserved in activity history.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            label="Completion Remarks / Notes (Optional)"
            placeholder="Enter outcome of the follow-up, discussion points, customer response..."
            value={completeRemarks}
            onChange={(e) => setCompleteRemarks(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleCloseCompleteFollowUp} disabled={savingComplete} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCompleteFollowUp}
            disabled={savingComplete}
            startIcon={savingComplete ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: '#059669',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              '&:hover': { bgcolor: '#047857' },
            }}
          >
            {savingComplete ? 'Completing...' : 'Confirm Complete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}