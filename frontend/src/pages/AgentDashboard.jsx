import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Avatar,
  Chip,
  Divider,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  ListItemIcon,
  ListItemText,
  Pagination,
  IconButton,
  Tooltip,
  Skeleton,
  InputAdornment,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Person,
  Logout as LogoutIcon,
  BadgeOutlined,
  Search as SearchIcon,
  Clear,
  Visibility,
  ContentCopy,
  Check as CheckIcon,
  Phone as PhoneIcon,
  PhoneInTalk,
  Business as BusinessIcon,
  Event as EventIcon,
  AccessTime as AccessTimeIcon,
  Refresh as RefreshIcon,
  WarningAmber as WarningIcon,
  Close as CloseIcon,
  DirectionsWalk,
  LaptopMac,
  EmojiEvents,
  Cancel,
  Schedule,
  CalendarMonth,
  CheckCircle,
  Add,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/authService';
import { getAgentDashboard } from '../services/dashboardService';
import { listLeads, createCallLog, createWalkIn, createDemo, updateDemoStatus, closeWon, closeLost } from '../services/leadsService';
import { formatDate, formatTime, isOverdue, isUpcoming, formatDateToYYYYMMDD, getFollowUpStatus } from '../utils/dateHelpers';
import { CALL_DISPOSITIONS, LOST_REASONS } from '../utils/constants';
import { getNextAction } from '../utils/nextActionHelper';
import { getLeadActionMenuItems } from '../utils/leadActionHelper';
import KpiCard from '../components/dashboard/KpiCard';
import TodayActionsSection from '../components/dashboard/TodayActionsSection';
import RecentActivitySection from '../components/dashboard/RecentActivitySection';

// Helper for demo status badges
const getDemoStatusStyle = (status) => {
  switch (status) {
    case 'Done':
      return { color: '#059669', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'Planned':
      return { color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)', border: 'rgba(37, 99, 235, 0.3)' };
    case 'Not Done':
      return { color: '#dc2626', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
    default:
      return { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' };
  }
};

// Helper for disposition badges
const getDispositionStyle = (disposition) => {
  switch (disposition) {
    case 'Interested':
    case 'Connected':
    case 'Appointment Booked':
    case 'Demo Requested':
      return { color: '#059669', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'Call Back Later':
    case 'Follow-up Required':
    case 'Decision Maker Unavailable':
    case 'Referred to Another Person':
    case 'Proposal Discussion':
    case 'Negotiation':
      return { color: '#0284c7', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
    case 'Not Interested':
    case 'Wrong Number':
      return { color: '#dc2626', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
    case 'No Answer':
    case 'Busy':
    case 'Not Reachable':
    case 'Switched Off':
      return { color: '#d97706', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
    default:
      return { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' };
  }
};

export default function AgentDashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  // State
  const [leads, setLeads] = useState([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Copy feedback
  const [copiedId, setCopiedId] = useState(null);

  // Record Call Modal State
  const [recordCallOpen, setRecordCallOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [callDisposition, setCallDisposition] = useState('');
  const [callRemark, setCallRemark] = useState('');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [savingCall, setSavingCall] = useState(false);
  const [callError, setCallError] = useState(null);
  const [snackbarMessage, setSnackbarMessage] = useState(null);

  // Walk-in Modal State (for Sales Agent)
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [selectedWalkInLead, setSelectedWalkInLead] = useState(null);
  const [walkInDate, setWalkInDate] = useState('');
  const [walkInTime, setWalkInTime] = useState('11:00');
  const [walkInRemark, setWalkInRemark] = useState('');
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [walkInError, setWalkInError] = useState(null);

  // Demo Modal State (for Sales Agent - Requirements 1, 2, 3, 7)
  const [demoOpen, setDemoOpen] = useState(false);
  const [selectedDemoLead, setSelectedDemoLead] = useState(null);
  const [existingDemo, setExistingDemo] = useState(null);
  const [demoDate, setDemoDate] = useState('');
  const [demoTime, setDemoTime] = useState('15:00');
  const [demoStatus, setDemoStatus] = useState('Planned');
  const [demoRemarks, setDemoRemarks] = useState('');
  const [savingDemo, setSavingDemo] = useState(false);
  const [demoError, setDemoError] = useState(null);

  // Outcome Modal State (for Sales Agent - Win/Lost outcome workflow)
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [selectedOutcomeLead, setSelectedOutcomeLead] = useState(null);
  const [outcomeType, setOutcomeType] = useState('WON'); // 'WON' or 'LOST'
  const [outcomeRemark, setOutcomeRemark] = useState('');
  const [outcomeDealValue, setOutcomeDealValue] = useState('');
  const [outcomeProduct, setOutcomeProduct] = useState('');
  const [outcomeLostReason, setOutcomeLostReason] = useState('Budget Constraints');
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState(null);

  // Action Dropdown Menu State
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const [actionMenuLead, setActionMenuLead] = useState(null);

  const handleOpenActionMenu = (event, lead) => {
    event.stopPropagation();
    setActionMenuAnchorEl(event.currentTarget);
    setActionMenuLead(lead);
  };

  const handleCloseActionMenu = () => {
    setActionMenuAnchorEl(null);
    setActionMenuLead(null);
  };

  // Dashboard & Work Overview State (Requirements 2, 3, 5)
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [todayActions, setTodayActions] = useState({
    overdue: [],
    todayFollowups: [],
    todayDemos: [],
    todayWalkIns: [],
    otherActions: [],
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await getAgentDashboard();
      if (res && res.summary) {
        setDashboardSummary(res.summary);
      }
      if (res && res.todayActions) {
        setTodayActions(res.todayActions);
      }
      if (res && res.recentActivities) {
        setRecentActivities(res.recentActivities);
      }
    } catch (err) {
      console.error('Failed to load agent dashboard overview', err);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const fetchMyLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (followUpFilter) params.followUpType = followUpFilter;

      const res = await listLeads(params);
      let fetchedLeads = res.leads || [];

      // Client-side disposition filter if specified
      if (dispositionFilter) {
        fetchedLeads = fetchedLeads.filter(
          (l) => (l.latestDisposition || '').toLowerCase() === dispositionFilter.toLowerCase()
        );
      }

      setLeads(fetchedLeads);
      setTotalLeads(res.total || 0);
      setTotalPages(res.totalPages || Math.ceil((res.total || 0) / pageSize) || 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, dispositionFilter, followUpFilter]);

  useEffect(() => {
    fetchMyLeads();
  }, [fetchMyLeads]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      // ignore
    }
    clearAuth();
    navigate('/login');
  };

  const handleCopyPhone = (e, phone, id) => {
    e.stopPropagation();
    if (!phone || phone === '—') return;
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Open Record Call Dialog
  const handleOpenRecordCall = (
    lead,
    prefillFollowUp = false,
    prefillDate = '',
    prefillTime = '10:00',
    defaultDisposition = ''
  ) => {
    setSelectedLead(lead);
    setCallDisposition(defaultDisposition || (prefillFollowUp ? 'Follow-up Required' : ''));
    setCallRemark('');
    setScheduleFollowUp(Boolean(prefillFollowUp));
    if (prefillFollowUp) {
      if (prefillDate) {
        setFollowUpDate(prefillDate);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setFollowUpDate(formatDateToYYYYMMDD(tomorrow));
      }
      setFollowUpTime(prefillTime || '10:00');
    } else {
      setFollowUpDate('');
      setFollowUpTime('10:00');
    }
    setCallError(null);
    setRecordCallOpen(true);
  };

  // Close Record Call Dialog
  const handleCloseRecordCall = () => {
    if (savingCall) return;
    setRecordCallOpen(false);
    setSelectedLead(null);
    setCallError(null);
  };

  // Save Call Record
  const handleSaveRecordCall = async () => {
    if (!callDisposition) {
      setCallError('Please select a Call Disposition');
      return;
    }
    if (!callRemark.trim()) {
      setCallError('Please enter Call Remarks');
      return;
    }

    let followUpAt = undefined;
    if (scheduleFollowUp) {
      if (!followUpDate) {
        setCallError('Please select a Follow-up Date');
        return;
      }
      const timeStr = followUpTime || '10:00';
      const combined = new Date(`${followUpDate}T${timeStr}:00`);
      if (isNaN(combined.getTime())) {
        setCallError('Please enter a valid Follow-up Date and Time');
        return;
      }
      followUpAt = combined.toISOString();
    }

    setSavingCall(true);
    setCallError(null);
    try {
      await createCallLog(selectedLead._id, {
        calledContactId: selectedLead.primaryContact?._id,
        calledContactName: selectedLead.primaryContact?.name || selectedLead.organizationName || 'Primary Contact',
        disposition: callDisposition,
        remark: callRemark.trim(),
        followUpAt,
      });
      setSnackbarMessage(
        scheduleFollowUp
          ? 'Call recorded and follow-up scheduled successfully!'
          : 'Call interaction recorded successfully!'
      );
      setRecordCallOpen(false);
      setSelectedLead(null);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
    } catch (err) {
      setCallError(err.response?.data?.message || 'Failed to record call');
    } finally {
      setSavingCall(false);
    }
  };

  // Open Walk-in Dialog (for Sales Agent)
  const handleOpenWalkIn = (lead) => {
    setSelectedWalkInLead(lead);
    setWalkInDate(formatDateToYYYYMMDD(new Date()));
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    setWalkInTime(`${hours}:${mins}`);
    setWalkInRemark('');
    setWalkInError(null);
    setWalkInOpen(true);
  };

  // Close Walk-in Dialog
  const handleCloseWalkIn = () => {
    if (savingWalkIn) return;
    setWalkInOpen(false);
    setSelectedWalkInLead(null);
    setWalkInError(null);
  };

  // Save Walk-in Record
  const handleSaveWalkIn = async () => {
    if (!walkInDate) {
      setWalkInError('Please select a Walk-in Date');
      return;
    }
    if (!walkInTime) {
      setWalkInError('Please enter a Walk-in Time');
      return;
    }
    if (!walkInRemark.trim()) {
      setWalkInError('Please enter Walk-in Remarks');
      return;
    }

    setSavingWalkIn(true);
    setWalkInError(null);
    try {
      await createWalkIn(selectedWalkInLead._id, {
        walkInDate,
        walkInTime,
        remark: walkInRemark.trim(),
      });
      setSnackbarMessage('Walk-in recorded successfully!');
      setWalkInOpen(false);
      setSelectedWalkInLead(null);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
    } catch (err) {
      setWalkInError(err.response?.data?.message || 'Failed to record walk-in');
    } finally {
      setSavingWalkIn(false);
    }
  };

  // Open Demo Dialog (for Sales Agent / Actions Menu)
  const handleOpenDemo = (lead, targetStatus = null) => {
    setSelectedDemoLead(lead);
    setDemoError(null);
    if (lead.latestDemo) {
      setExistingDemo(lead.latestDemo);
      setDemoDate(formatDateToYYYYMMDD(new Date(lead.latestDemo.demoDate)));
      setDemoTime(lead.latestDemo.demoTime || '15:00');
      setDemoStatus(targetStatus || lead.latestDemo.status || 'Planned');
      setDemoRemarks(lead.latestDemo.remarks || '');
    } else {
      setExistingDemo(null);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDemoDate(formatDateToYYYYMMDD(tomorrow));
      setDemoTime('15:00');
      setDemoStatus(targetStatus || 'Planned');
      setDemoRemarks('');
    }
    setDemoOpen(true);
  };

  // Close Demo Dialog
  const handleCloseDemo = () => {
    if (savingDemo) return;
    setDemoOpen(false);
    setSelectedDemoLead(null);
    setExistingDemo(null);
    setDemoError(null);
  };

  // Save / Update Demo Record
  const handleSaveDemo = async () => {
    if (!demoDate) {
      setDemoError('Please select a Demo Date');
      return;
    }
    if (!demoTime) {
      setDemoError('Please enter a Demo Time');
      return;
    }

    // Requirement 4: Require Demo Remarks/Notes when marking a Demo as Done or Not Done
    if ((demoStatus === 'Done' || demoStatus === 'Not Done') && !demoRemarks.trim()) {
      setDemoError('Demo remarks/notes are required when marking a demo as Done or Not Done');
      return;
    }

    // Requirement 7: Do not allow a future scheduled Demo to be marked Done before its scheduled time
    if (demoStatus === 'Done') {
      const parts = demoDate.substring(0, 10).split('-').map(Number);
      const [h, m] = demoTime.split(':').map(Number);
      const scheduledDateTime = new Date(parts[0], parts[1] - 1, parts[2], h || 0, m || 0, 0, 0);
      if (scheduledDateTime > new Date()) {
        setDemoError('Cannot mark a scheduled demo as Done before its scheduled date and time');
        return;
      }
    }

    setSavingDemo(true);
    setDemoError(null);
    try {
      if (existingDemo && existingDemo.demoId) {
        await updateDemoStatus(selectedDemoLead._id, existingDemo.demoId, {
          status: demoStatus,
          remarks: demoRemarks.trim(),
          demoDate,
          demoTime,
        });
        setSnackbarMessage(
          demoStatus === 'Done'
            ? 'Demo marked as Done successfully!'
            : demoStatus === 'Not Done'
            ? 'Demo marked as Not Done.'
            : 'Demo details updated successfully!'
        );
      } else {
        await createDemo(selectedDemoLead._id, {
          demoDate,
          demoTime,
          status: 'Planned', // Requirement 2: initial status is always Planned
          remarks: demoRemarks.trim(),
        });
        setSnackbarMessage('Demo scheduled successfully!');
      }
      setDemoOpen(false);
      setSelectedDemoLead(null);
      setExistingDemo(null);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
    } catch (err) {
      setDemoError(err.response?.data?.message || 'Failed to save demo');
    } finally {
      setSavingDemo(false);
    }
  };

  // Open Outcome Dialog (for Sales Agent)
  const handleOpenOutcome = (lead, defaultType = 'WON') => {
    setSelectedOutcomeLead(lead);
    setOutcomeType(defaultType);
    setOutcomeRemark('');
    setOutcomeDealValue(lead.dealValue ? String(lead.dealValue) : '');
    setOutcomeProduct(lead.product || '');
    setOutcomeLostReason('Budget Constraints');
    setOutcomeError(null);
    setOutcomeOpen(true);
  };

  // Close Outcome Dialog
  const handleCloseOutcome = () => {
    if (savingOutcome) return;
    setOutcomeOpen(false);
    setSelectedOutcomeLead(null);
    setOutcomeError(null);
  };

  // Save Outcome Record
  const handleSaveOutcome = async () => {
    if (outcomeType === 'LOST' && !outcomeRemark.trim() && !outcomeLostReason.trim()) {
      setOutcomeError('Please enter an Outcome Remark or reason for marking this lead as Lost');
      return;
    }

    setSavingOutcome(true);
    setOutcomeError(null);
    try {
      if (outcomeType === 'WON') {
        await closeWon(selectedOutcomeLead._id, {
          closingRemark: outcomeRemark.trim(),
          dealValue: outcomeDealValue ? Number(outcomeDealValue) : undefined,
          product: outcomeProduct.trim() || undefined,
        });
        setSnackbarMessage(`Lead #${selectedOutcomeLead.leadNumber} successfully closed as WON! 🎉`);
      } else {
        await closeLost(selectedOutcomeLead._id, {
          closingRemark: outcomeRemark.trim(),
          lostReason: outcomeLostReason.trim() || 'Other',
        });
        setSnackbarMessage(`Lead #${selectedOutcomeLead.leadNumber} marked as LOST.`);
      }
      setOutcomeOpen(false);
      setSelectedOutcomeLead(null);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
    } catch (err) {
      setOutcomeError(err.response?.data?.message || `Failed to set outcome as ${outcomeType}`);
    } finally {
      setSavingOutcome(false);
    }
  };

  const agentName = user?.fullName || user?.username || 'Agent';
  const agentRole = user?.agentRole || 'Calling Agent';
  const isSalesAgent = agentRole?.toLowerCase() === 'sales agent';

  // Handle Dynamic Next Action Click
  const handleNextActionClick = (e, lead) => {
    e.stopPropagation();
    const nextAction = getNextAction(lead);

    if (nextAction.action === 'demo') {
      handleOpenDemo(lead);
    } else if (nextAction.action === 'outcome') {
      if (isSalesAgent) {
        handleOpenOutcome(lead, lead.latestDemo?.status === 'Done' ? 'WON' : undefined);
      } else {
        handleOpenRecordCall(lead);
      }
    } else if (nextAction.action === 'schedule_followup') {
      setSelectedLead(lead);
      setCallDisposition('Interested');
      setCallRemark('');
      setScheduleFollowUp(true);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFollowUpDate(formatDateToYYYYMMDD(tomorrow));
      setFollowUpTime('10:00');
      setCallError(null);
      setRecordCallOpen(true);
    } else if (nextAction.action === 'record_call') {
      handleOpenRecordCall(lead);
    } else {
      navigate(`/leads/${lead._id}`);
    }
  };

  // Handle Today's Actions queue dynamic action clicks
  const handleTodayActionTrigger = (actionType, lead) => {
    if (!lead) return;
    if (actionType === 'demo') {
      handleOpenDemo(lead);
    } else if (actionType === 'outcome') {
      if (isSalesAgent) {
        handleOpenOutcome(lead, lead.latestDemo?.status === 'Done' ? 'WON' : undefined);
      } else {
        handleOpenRecordCall(lead);
      }
    } else if (actionType === 'schedule_followup') {
      setSelectedLead(lead);
      setCallDisposition('Interested');
      setCallRemark('');
      setScheduleFollowUp(true);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFollowUpDate(formatDateToYYYYMMDD(tomorrow));
      setFollowUpTime('10:00');
      setCallError(null);
      setRecordCallOpen(true);
    } else if (actionType === 'record_call' || actionType === 'followup_now') {
      handleOpenRecordCall(lead);
    } else {
      navigate(`/leads/${lead._id}`);
    }
  };

  // Handle Action selection from the row dropdown menu
  const handleSelectAction = (actionKey) => {
    const lead = actionMenuLead;
    handleCloseActionMenu();
    if (!lead) return;

    switch (actionKey) {
      case 'call_now':
        handleOpenRecordCall(lead, false);
        break;
      case 'schedule_followup': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        handleOpenRecordCall(lead, true, formatDateToYYYYMMDD(tomorrow), '10:00', 'Follow-up Required');
        break;
      }
      case 'reschedule_followup': {
        const existingDate = lead.nextFollowUpAt ? formatDateToYYYYMMDD(new Date(lead.nextFollowUpAt)) : '';
        const existingTime = lead.nextFollowUpAt ? formatTime(lead.nextFollowUpAt) : '10:00';
        handleOpenRecordCall(lead, true, existingDate, existingTime, 'Follow-up Required');
        break;
      }
      case 'followup_now':
        handleOpenRecordCall(lead, false, '', '10:00', 'Connected');
        break;
      case 'record_walkin':
        handleOpenWalkIn(lead);
        break;
      case 'schedule_demo':
        handleOpenDemo(lead, 'Planned');
        break;
      case 'reschedule_demo':
        handleOpenDemo(lead, 'Planned');
        break;
      case 'mark_demo_done':
        handleOpenDemo(lead, 'Done');
        break;
      case 'mark_demo_not_done':
        handleOpenDemo(lead, 'Not Done');
        break;
      case 'close_won':
        handleOpenOutcome(lead, 'WON');
        break;
      case 'close_lost':
        handleOpenOutcome(lead, 'LOST');
        break;
      case 'view_lead':
        navigate(`/leads/${lead._id}`);
        break;
      default:
        break;
    }
  };

  const renderActionMenuIcon = (key) => {
    switch (key) {
      case 'call_now':
        return <PhoneInTalk sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'schedule_followup':
        return <EventIcon sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'reschedule_followup':
        return <Schedule sx={{ fontSize: 16, color: '#d97706' }} />;
      case 'followup_now':
        return <PhoneInTalk sx={{ fontSize: 16, color: '#ea580c' }} />;
      case 'record_walkin':
        return <DirectionsWalk sx={{ fontSize: 16, color: '#059669' }} />;
      case 'schedule_demo':
        return <LaptopMac sx={{ fontSize: 16, color: '#6366f1' }} />;
      case 'reschedule_demo':
        return <CalendarMonth sx={{ fontSize: 16, color: '#6366f1' }} />;
      case 'mark_demo_done':
        return <CheckCircle sx={{ fontSize: 16, color: '#059669' }} />;
      case 'mark_demo_not_done':
        return <Cancel sx={{ fontSize: 16, color: '#dc2626' }} />;
      case 'close_won':
        return <EmojiEvents sx={{ fontSize: 16, color: '#059669' }} />;
      case 'close_lost':
        return <Cancel sx={{ fontSize: 16, color: '#dc2626' }} />;
      case 'view_lead':
      default:
        return <Visibility sx={{ fontSize: 16, color: '#64748b' }} />;
    }
  };

  const renderNextActionIcon = (key) => {
    switch (key) {
      case 'closed_won':
        return <EmojiEvents sx={{ fontSize: 14 }} />;
      case 'closed_lost':
        return <Cancel sx={{ fontSize: 14 }} />;
      case 'followup_now':
        return <WarningIcon sx={{ fontSize: 14 }} />;
      case 'attend_demo':
        return <LaptopMac sx={{ fontSize: 14 }} />;
      case 'close_deal':
      case 'followup_closure':
        return <EmojiEvents sx={{ fontSize: 14 }} />;
      case 'call_scheduled_time':
      case 'followup_scheduled':
        return <Schedule sx={{ fontSize: 14 }} />;
      case 'schedule_followup':
        return <EventIcon sx={{ fontSize: 14 }} />;
      case 'call_now':
      default:
        return <PhoneInTalk sx={{ fontSize: 14 }} />;
    }
  };

  // Quick stats derived from real data (Requirements 5, 6, 7)
  // Only OPEN leads can be counted as scheduled, upcoming, or overdue follow-ups
  const scheduledCount = leads.filter((l) => l.nextFollowUpAt && l.closureStatus === 'OPEN').length;
  const overdueCount = leads.filter((l) => l.nextFollowUpAt && isOverdue(l.nextFollowUpAt, l.closureStatus)).length;
  const upcomingCount = leads.filter((l) => l.nextFollowUpAt && l.closureStatus === 'OPEN' && isUpcoming(l.nextFollowUpAt, l.closureStatus)).length;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Top Banner / Calling Agent Workspace Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            bgcolor: 'primary.main',
          },
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              sx={{
                width: 52,
                height: 52,
                bgcolor: 'primary.main',
                color: '#ffffff',
                fontSize: 22,
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)',
              }}
            >
              {agentName.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                Welcome, {agentName}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Chip
                  icon={<BadgeOutlined sx={{ fontSize: '15px !important' }} />}
                  label={agentRole}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    bgcolor: 'rgba(234, 88, 12, 0.1)',
                    color: 'primary.main',
                    border: '1px solid',
                    borderColor: 'rgba(234, 88, 12, 0.25)',
                    fontSize: 12,
                    height: 24,
                  }}
                />
                <Chip
                  label={agentRole?.toLowerCase() === 'sales agent' ? 'Sales Workspace' : 'Calling Workspace'}
                  size="small"
                  sx={{
                    fontWeight: 500,
                    bgcolor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    fontSize: 11,
                    height: 24,
                  }}
                />
              </Stack>
            </Box>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => navigate('/leads/create')}
              sx={{
                borderRadius: 2,
                px: 2,
                py: 0.75,
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)',
                },
              }}
            >
              Create Lead
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              sx={{
                borderRadius: 2,
                px: 2,
                py: 0.75,
                fontWeight: 600,
                textTransform: 'none',
                borderColor: '#fca5a5',
                '&:hover': {
                  borderColor: '#ef4444',
                  bgcolor: 'rgba(239, 68, 68, 0.06)',
                },
              }}
            >
              Logout
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Today / Action Summary (7 Metrics - Requirement 2) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(1, 1fr)',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
            lg: 'repeat(7, 1fr)',
          },
          gap: 1.5,
          mb: 3,
        }}
      >
        <KpiCard
          title="My Total Leads"
          value={dashboardSummary ? dashboardSummary.totalLeads : totalLeads}
          icon={<BusinessIcon />}
          color="#ea580c"
          loading={dashboardLoading}
          onClick={() => { setSearch(''); setFollowUpFilter(''); setDispositionFilter(''); setPage(1); }}
        />
        <KpiCard
          title="Today's Follow-ups"
          value={dashboardSummary ? dashboardSummary.todayFollowups : 0}
          icon={<Schedule />}
          color="#0284c7"
          loading={dashboardLoading}
          onClick={() => { setFollowUpFilter('today'); setPage(1); }}
        />
        <KpiCard
          title="Overdue Follow-ups"
          value={dashboardSummary ? dashboardSummary.overdueFollowups : 0}
          icon={<WarningIcon />}
          color="#dc2626"
          loading={dashboardLoading}
          onClick={() => { setFollowUpFilter('overdue'); setPage(1); }}
        />
        <KpiCard
          title="Today's Scheduled Demos"
          value={dashboardSummary ? dashboardSummary.todayDemos : 0}
          icon={<LaptopMac />}
          color="#4f46e5"
          loading={dashboardLoading}
        />
        <KpiCard
          title="Today's Walk-ins"
          value={dashboardSummary ? dashboardSummary.todayWalkIns : 0}
          icon={<DirectionsWalk />}
          color="#059669"
          loading={dashboardLoading}
        />
        <KpiCard
          title="Won Leads"
          value={dashboardSummary ? dashboardSummary.wonLeads : 0}
          icon={<EmojiEvents />}
          color="#10b981"
          loading={dashboardLoading}
        />
        <KpiCard
          title="Lost Leads"
          value={dashboardSummary ? dashboardSummary.lostLeads : 0}
          icon={<Cancel />}
          color="#64748b"
          loading={dashboardLoading}
        />
      </Box>

      {/* Today's Actions Queue (Requirement 3) */}
      <TodayActionsSection
        todayActions={todayActions}
        loading={dashboardLoading}
        onActionClick={handleTodayActionTrigger}
        onCopyPhone={handleCopyPhone}
        copiedId={copiedId}
        navigate={navigate}
        agentRole={agentRole}
      />

      {/* "My Leads" Module */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Module Header & Filters */}
        <Box sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                My Leads
              </Typography>
              <Chip
                label={`${totalLeads} ${totalLeads === 1 ? 'Lead' : 'Leads'}`}
                size="small"
                color="primary"
                sx={{ fontWeight: 600, height: 24 }}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={fetchMyLeads}
                sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
              >
                Refresh
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate('/leads/create')}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                  '&:hover': {
                    boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)',
                  },
                }}
              >
                Create Lead
              </Button>
            </Box>
          </Box>

          {/* Search & Filter Controls */}
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search lead, contact or phone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setSearch(''); setPage(1); }}>
                        <Clear fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={6} sm={3} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Latest Disposition</InputLabel>
                <Select
                  value={dispositionFilter}
                  label="Latest Disposition"
                  onChange={(e) => { setDispositionFilter(e.target.value); setPage(1); }}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Dispositions</MenuItem>
                  {CALL_DISPOSITIONS.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} sm={3} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Follow-up Status</InputLabel>
                <Select
                  value={followUpFilter}
                  label="Follow-up Status"
                  onChange={(e) => { setFollowUpFilter(e.target.value); setPage(1); }}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Follow-ups</MenuItem>
                  <MenuItem value="upcoming">Upcoming</MenuItem>
                  <MenuItem value="overdue">Overdue</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {(search || dispositionFilter || followUpFilter) && (
              <Grid item xs={12} sm="auto">
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={() => { setSearch(''); setDispositionFilter(''); setFollowUpFilter(''); setPage(1); }}
                  sx={{ borderRadius: 2, textTransform: 'none', color: '#64748b' }}
                >
                  Clear Filters
                </Button>
              </Grid>
            )}
          </Grid>
        </Box>

        {/* My Leads Table */}
        <TableContainer sx={{ minHeight: 340 }}>
          <Table sx={{ minWidth: 1250 }}>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Lead / Organization
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Contact Name
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Contact Number
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Latest Disposition
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Latest Call Remarks
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Last Activity
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Next Follow-up
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Follow-up Status
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Latest Walk-in
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Demo Date/Time
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Demo Status
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Outcome
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, color: '#475569', py: 1.5 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(13)].map((_, j) => (
                      <TableCell key={j} sx={{ py: 2 }}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 8 }}>
                    <BusinessIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="subtitle1" fontWeight={600} color="#475569">
                      No leads found
                    </Typography>
                    <Typography variant="body2" color="#94a3b8">
                      {search || dispositionFilter || followUpFilter
                        ? 'Try adjusting your search criteria or clearing filters'
                        : 'No leads are currently assigned to you'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const dispStyle = getDispositionStyle(lead.latestDisposition);
                  const hasFollowUp = !!lead.nextFollowUpAt;
                  const isOpen = lead.closureStatus === 'OPEN';
                  const followUpStatusObj = getFollowUpStatus(lead.nextFollowUpAt, lead.closureStatus);
                  const followUpDate = hasFollowUp ? formatDate(lead.nextFollowUpAt) : '—';
                  const followUpTime = hasFollowUp ? formatTime(lead.nextFollowUpAt) : '';
                  const contactName = lead.primaryContact?.name || '—';
                  const contactPhone = lead.primaryContact?.phone || '—';
                  const remarks = lead.latestRemark || '—';
                  const lastActivityTime = lead.lastActivityAt || lead.updatedAt;

                  return (
                    <TableRow
                      key={lead._id}
                      hover
                      onClick={() => navigate(`/leads/${lead._id}`)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.04)' },
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* 1. Lead / Organization */}
                      <TableCell sx={{ py: 1.75 }}>
                        <Typography fontWeight={600} fontSize={13} sx={{ color: '#0f172a', lineHeight: 1.3 }}>
                          {lead.organizationName}
                        </Typography>
                        <Chip
                          label={`#${lead.leadNumber}`}
                          size="small"
                          sx={{
                            mt: 0.5,
                            height: 18,
                            fontSize: 10,
                            fontWeight: 700,
                            bgcolor: 'rgba(234, 88, 12, 0.08)',
                            color: 'primary.main',
                            border: '1px solid rgba(234, 88, 12, 0.2)',
                          }}
                        />
                      </TableCell>

                      {/* 2. Contact Name */}
                      <TableCell sx={{ fontSize: 13, color: '#334155', py: 1.75 }}>
                        {contactName}
                      </TableCell>

                      {/* 3. Contact Number */}
                      <TableCell sx={{ fontSize: 13, color: '#334155', py: 1.75 }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography fontSize={13} fontWeight={500}>
                            {contactPhone}
                          </Typography>
                          {contactPhone !== '—' && (
                            <Tooltip title={copiedId === lead._id ? 'Copied!' : 'Copy Phone'}>
                              <IconButton
                                size="small"
                                onClick={(e) => handleCopyPhone(e, contactPhone, lead._id)}
                                sx={{
                                  p: 0.25,
                                  color: copiedId === lead._id ? 'success.main' : '#94a3b8',
                                  '&:hover': { color: 'primary.main' },
                                }}
                              >
                                {copiedId === lead._id ? (
                                  <CheckIcon sx={{ fontSize: 14 }} />
                                ) : (
                                  <ContentCopy sx={{ fontSize: 14 }} />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>

                      {/* 4. Latest Disposition */}
                      <TableCell sx={{ py: 1.75 }}>
                        {lead.latestDisposition ? (
                          <Chip
                            label={lead.latestDisposition}
                            size="small"
                            sx={{
                              fontSize: 11,
                              fontWeight: 600,
                              height: 22,
                              bgcolor: dispStyle.bg,
                              color: dispStyle.color,
                              border: `1px solid ${dispStyle.border}`,
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            New Lead
                          </Typography>
                        )}
                      </TableCell>

                      {/* 5. Latest Call Remarks */}
                      <TableCell sx={{ fontSize: 12, color: '#64748b', maxWidth: 180, py: 1.75 }}>
                        <Tooltip title={remarks !== '—' ? remarks : ''} placement="top">
                          <Typography
                            fontSize={12}
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 180,
                              fontStyle: remarks === '—' ? 'normal' : 'italic',
                            }}
                          >
                            {remarks}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* 6. Last Activity Date/Time */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {lastActivityTime ? (
                          <Box>
                            <Typography fontSize={12} fontWeight={500} color="#334155">
                              {formatDate(lastActivityTime)}
                            </Typography>
                            <Typography fontSize={11} color="#94a3b8">
                              {formatTime(lastActivityTime)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 7. Next Follow-up Date/Time */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {hasFollowUp ? (
                          <Box>
                            <Typography fontSize={12} fontWeight={500} color="#334155">
                              {followUpDate}
                            </Typography>
                            {followUpTime && (
                              <Typography fontSize={11} color="#64748b">
                                {followUpTime}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 8. Follow-up Status */}
                      <TableCell sx={{ py: 1.75, whiteSpace: 'nowrap' }}>
                        {hasFollowUp ? (
                          <Chip
                            label={followUpStatusObj.label}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: 11,
                              fontWeight: 700,
                              bgcolor: followUpStatusObj.bg,
                              color: followUpStatusObj.color,
                              border: `1px solid ${followUpStatusObj.border}`,
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 9. Latest Walk-in (Unified 13 columns - all agents) */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {lead.latestWalkIn?.walkInDate ? (
                          <Box>
                            <Chip
                              icon={<DirectionsWalk sx={{ fontSize: '13px !important' }} />}
                              label={`${formatDate(lead.latestWalkIn.walkInDate)}${lead.latestWalkIn.walkInTime ? ` • ${lead.latestWalkIn.walkInTime}` : ''}`}
                              size="small"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                height: 22,
                                bgcolor: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                mb: lead.latestWalkIn.remark ? 0.5 : 0,
                              }}
                            />
                            {lead.latestWalkIn.remark && (
                              <Tooltip title={lead.latestWalkIn.remark} placement="top">
                                <Typography
                                  fontSize={11}
                                  sx={{
                                    color: '#64748b',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 150,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  {lead.latestWalkIn.remark}
                                </Typography>
                              </Tooltip>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 10. Demo Date/Time */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {lead.latestDemo?.demoDate ? (
                          <Box>
                            <Typography fontSize={12} fontWeight={500} color="#334155">
                              {formatDate(lead.latestDemo.demoDate)}
                            </Typography>
                            {lead.latestDemo.demoTime && (
                              <Typography fontSize={11} color="#64748b">
                                {lead.latestDemo.demoTime}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 11. Demo Status */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {lead.latestDemo?.status ? (
                          <Box>
                            {(() => {
                              const dStyle = getDemoStatusStyle(lead.latestDemo.status);
                              return (
                                <Chip
                                  label={lead.latestDemo.status}
                                  size="small"
                                  sx={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    height: 22,
                                    bgcolor: dStyle.bg,
                                    color: dStyle.color,
                                    border: `1px solid ${dStyle.border}`,
                                    mb: lead.latestDemo.remarks ? 0.5 : 0,
                                  }}
                                />
                              );
                            })()}
                            {lead.latestDemo.remarks && (
                              <Tooltip title={lead.latestDemo.remarks} placement="top">
                                <Typography
                                  fontSize={11}
                                  sx={{
                                    color: '#64748b',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 150,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  {lead.latestDemo.remarks}
                                </Typography>
                              </Tooltip>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* 12. Outcome */}
                      <TableCell sx={{ fontSize: 12, py: 1.75, whiteSpace: 'nowrap' }}>
                        {lead.closureStatus === 'WON' ? (
                          <Tooltip
                            title={`Closed Won on ${formatDate(lead.closedAt || lead.updatedAt)}${lead.closingRemark ? ` • "${lead.closingRemark}"` : ''}${lead.dealValue ? ` • Deal Value: ₹${Number(lead.dealValue).toLocaleString()}` : ''}`}
                            placement="top"
                          >
                            <Chip
                              icon={<EmojiEvents sx={{ fontSize: '13px !important' }} />}
                              label="Won"
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: 11,
                                height: 22,
                                bgcolor: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                              }}
                            />
                          </Tooltip>
                        ) : lead.closureStatus === 'LOST' ? (
                          <Tooltip
                            title={`Closed Lost on ${formatDate(lead.closedAt || lead.updatedAt)}${lead.lostReason ? ` • Reason: ${lead.lostReason}` : ''}${lead.closingRemark ? ` • "${lead.closingRemark}"` : ''}`}
                            placement="top"
                          >
                            <Chip
                              icon={<Cancel sx={{ fontSize: '13px !important' }} />}
                              label="Lost"
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: 11,
                                height: 22,
                                bgcolor: 'rgba(239, 68, 68, 0.12)',
                                color: '#dc2626',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                            />
                          </Tooltip>
                        ) : (
                          <Chip
                            label="Open"
                            size="small"
                            sx={{
                              fontWeight: 600,
                              fontSize: 11,
                              height: 22,
                              bgcolor: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #cbd5e1',
                            }}
                          />
                        )}
                      </TableCell>

                      {/* 13. Action Dropdown & Open */}
                      <TableCell align="center" sx={{ py: 1.75, whiteSpace: 'nowrap' }}>
                        <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                          {/* Action Dropdown Button */}
                          <Button
                            size="small"
                            variant="contained"
                            endIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
                            onClick={(e) => handleOpenActionMenu(e, lead)}
                            sx={{
                              borderRadius: 1.5,
                              textTransform: 'none',
                              fontSize: 12,
                              fontWeight: 700,
                              py: 0.45,
                              px: 1.5,
                              bgcolor: 'primary.main',
                              color: '#ffffff',
                              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
                              '&:hover': {
                                bgcolor: 'primary.dark',
                                boxShadow: '0 4px 10px rgba(234, 88, 12, 0.35)',
                              },
                            }}
                          >
                            Action
                          </Button>

                          {/* Open / View Lead Button */}
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Visibility sx={{ fontSize: 14 }} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/leads/${lead._id}`);
                            }}
                            sx={{
                              borderRadius: 1.5,
                              textTransform: 'none',
                              fontSize: 12,
                              fontWeight: 600,
                              py: 0.45,
                              px: 1.25,
                              borderColor: '#cbd5e1',
                              color: '#334155',
                              '&:hover': {
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                bgcolor: 'rgba(234, 88, 12, 0.08)',
                              },
                            }}
                          >
                            Open
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <Box
            sx={{
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13 }}>
              Showing {leads.length} of {totalLeads} assigned leads
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(e, p) => setPage(p)}
              color="primary"
              shape="rounded"
              size="small"
            />
          </Box>
        )}
      </Paper>

      {/* Recent Activity Timeline (Requirement 5) */}
      <RecentActivitySection
        activities={recentActivities}
        loading={dashboardLoading}
        navigate={navigate}
      />

      {/* Contextual Action Dropdown Menu for Leads Table */}
      <Menu
        anchorEl={actionMenuAnchorEl}
        open={Boolean(actionMenuAnchorEl && actionMenuLead)}
        onClose={handleCloseActionMenu}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: {
            minWidth: 210,
            borderRadius: 2.5,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
            py: 0.5,
            border: '1px solid #e2e8f0',
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {actionMenuLead && (() => {
          const items = getLeadActionMenuItems(actionMenuLead);
          const menuElements = [];
          let lastCategory = null;

          items.forEach((item, index) => {
            const currentGroup = (item.category === 'call' || item.category === 'followup') ? 'call_group' : item.category;
            if (lastCategory && lastCategory !== currentGroup) {
              menuElements.push(<Divider key={`action-div-${index}`} sx={{ my: 0.5, borderColor: '#f1f5f9' }} />);
            }
            lastCategory = currentGroup;

            menuElements.push(
              <MenuItem
                key={item.key}
                onClick={() => handleSelectAction(item.key)}
                sx={{
                  py: 0.9,
                  px: 2,
                  fontSize: 13,
                  fontWeight: item.highlight ? 700 : 500,
                  color: item.color || '#334155',
                  bgcolor: item.highlight ? 'rgba(234, 88, 12, 0.06)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  '&:hover': {
                    bgcolor: item.color ? `${item.color}14` : 'rgba(234, 88, 12, 0.08)',
                    color: item.color || 'primary.main',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 26, color: item.color || '#64748b' }}>
                  {renderActionMenuIcon(item.key)}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: 13,
                    fontWeight: item.highlight ? 700 : 500,
                  }}
                />
              </MenuItem>
            );
          });

          return menuElements;
        })()}
      </Menu>

      {/* Record Call Dialog Modal with Optional Schedule Follow-up (Requirements 1, 2, 3) */}
      <Dialog
        open={recordCallOpen}
        onClose={handleCloseRecordCall}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, p: 1 }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)' }}>
              <PhoneInTalk sx={{ fontSize: 20, color: '#ffffff' }} />
            </Avatar>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
              Record Call Interaction
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleCloseRecordCall} sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
          {callError && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
              {callError}
            </Alert>
          )}

          {/* Lead Information */}
          {selectedLead && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                Lead Information
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Lead / Organization:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedLead.organizationName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    #{selectedLead.leadNumber}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Name:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedLead.primaryContact?.name || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Number:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedLead.primaryContact?.phone || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Address:
                  </Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ color: '#334155' }}>
                    {selectedLead.address || '—'}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Input Fields */}
          <Stack spacing={2.5}>
            <FormControl fullWidth required size="small">
              <InputLabel id="call-disposition-label">Call Disposition *</InputLabel>
              <Select
                labelId="call-disposition-label"
                label="Call Disposition *"
                value={callDisposition}
                onChange={(e) => setCallDisposition(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {CALL_DISPOSITIONS.map((disp) => (
                  <MenuItem key={disp} value={disp}>
                    {disp}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              required
              multiline
              rows={3}
              label="Call Remarks *"
              placeholder="Enter customer response, discussion summary, notes..."
              value={callRemark}
              onChange={(e) => setCallRemark(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* Optional Schedule Follow-up Section (Requirements 1, 2, 3) */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: scheduleFollowUp ? 'rgba(234, 88, 12, 0.04)' : '#f8fafc',
                border: '1px solid',
                borderColor: scheduleFollowUp ? 'rgba(234, 88, 12, 0.3)' : '#e2e8f0',
                transition: 'all 0.2s ease',
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={scheduleFollowUp}
                    onChange={(e) => {
                      setScheduleFollowUp(e.target.checked);
                      if (e.target.checked && !followUpDate) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        setFollowUpDate(formatDateToYYYYMMDD(tomorrow));
                        if (!followUpTime) setFollowUpTime('10:00');
                      }
                    }}
                    color="primary"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EventIcon sx={{ fontSize: 18, color: scheduleFollowUp ? 'primary.main' : '#64748b' }} />
                    <Typography fontWeight={600} fontSize={13} sx={{ color: '#0f172a' }}>
                      Schedule Follow-up (Optional)
                    </Typography>
                  </Box>
                }
              />

              {scheduleFollowUp && (
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      required
                      size="small"
                      type="date"
                      label="Follow-up Date *"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ min: formatDateToYYYYMMDD(new Date()) }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      required
                      size="small"
                      type="time"
                      label="Follow-up Time *"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  </Grid>
                </Grid>
              )}
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCloseRecordCall}
            disabled={savingCall}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveRecordCall}
            disabled={savingCall}
            startIcon={savingCall ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
            }}
          >
            {savingCall ? 'Saving...' : 'Save Call'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Record Customer Walk-in Modal (for Sales Agent - Requirements 1, 2, 3) */}
      <Dialog
        open={walkInOpen}
        onClose={handleCloseWalkIn}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'rgba(5, 150, 105, 0.12)', color: '#059669', width: 40, height: 40 }}>
              <DirectionsWalk sx={{ fontSize: 22 }} />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                Record Customer Walk-in
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Log in-person customer visit and discussion notes
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={handleCloseWalkIn} size="small" sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ pt: 2.5 }}>
          {walkInError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {walkInError}
            </Alert>
          )}

          {/* Lead Information */}
          {selectedWalkInLead && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                Lead Information
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Lead / Organization:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedWalkInLead.organizationName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    #{selectedWalkInLead.leadNumber}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Name:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedWalkInLead.primaryContact?.name || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Number:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedWalkInLead.primaryContact?.phone || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Address:
                  </Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ color: '#334155' }}>
                    {selectedWalkInLead.address || '—'}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Input Fields */}
          <Stack spacing={2.5}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  size="small"
                  type="date"
                  label="Walk-in Date *"
                  value={walkInDate}
                  onChange={(e) => setWalkInDate(e.target.value)}
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
                  value={walkInTime}
                  onChange={(e) => setWalkInTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            <TextField
              fullWidth
              required
              multiline
              rows={3}
              label="Walk-in Remarks *"
              placeholder="Enter in-person customer discussion notes, clinic requirements, visit outcome..."
              value={walkInRemark}
              onChange={(e) => setWalkInRemark(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCloseWalkIn}
            disabled={savingWalkIn}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleSaveWalkIn}
            disabled={savingWalkIn}
            startIcon={savingWalkIn ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              bgcolor: '#059669',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              '&:hover': { bgcolor: '#047857' },
            }}
          >
            {savingWalkIn ? 'Saving...' : 'Save Walk-in'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Demo Scheduling & Tracking Dialog Modal (Requirements 1, 2, 3, 4, 5, 7) */}
      <Dialog
        open={demoOpen}
        onClose={handleCloseDemo}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.12)', color: '#4f46e5', width: 40, height: 40 }}>
              <LaptopMac sx={{ fontSize: 22 }} />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                {existingDemo ? 'Update Product Demo' : 'Schedule Product Demo'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {existingDemo
                  ? 'Update demo schedule, mark as Done or Not Done'
                  : 'Schedule an interactive software walkthrough'}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={handleCloseDemo} size="small" sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ pt: 2.5 }}>
          {demoError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {demoError}
            </Alert>
          )}

          {/* Lead Information */}
          {selectedDemoLead && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                Lead Information
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Lead / Organization:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedDemoLead.organizationName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    #{selectedDemoLead.leadNumber}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Name:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedDemoLead.primaryContact?.name || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Number:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedDemoLead.primaryContact?.phone || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Address:
                  </Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ color: '#334155' }}>
                    {selectedDemoLead.address || '—'}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Existing Demo Alert if editing */}
          {existingDemo && (
            <Box
              sx={{
                mb: 2.5,
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LaptopMac sx={{ fontSize: 18, color: '#4f46e5' }} />
                <Typography variant="body2" fontWeight={600} sx={{ color: '#312e81' }}>
                  Current Demo: {formatDate(existingDemo.demoDate)} at {existingDemo.demoTime}
                </Typography>
              </Box>
              <Chip
                label={existingDemo.status}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: 11,
                  ...getDemoStatusStyle(existingDemo.status),
                }}
              />
            </Box>
          )}

          {/* Input Fields */}
          <Stack spacing={2.5}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  size="small"
                  type="date"
                  label="Demo Date *"
                  value={demoDate}
                  onChange={(e) => setDemoDate(e.target.value)}
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
                  value={demoTime}
                  onChange={(e) => setDemoTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            {(() => {
              const isFuture = (() => {
                if (!demoDate || !demoTime) return false;
                const parts = demoDate.substring(0, 10).split('-').map(Number);
                const [h, m] = demoTime.split(':').map(Number);
                const d = new Date(parts[0], parts[1] - 1, parts[2], h || 0, m || 0, 0, 0);
                return d > new Date();
              })();

              return (
                <>
                  <FormControl fullWidth size="small" required>
                    <InputLabel id="demo-status-label">Demo Status *</InputLabel>
                    <Select
                      labelId="demo-status-label"
                      label="Demo Status *"
                      value={demoStatus}
                      onChange={(e) => setDemoStatus(e.target.value)}
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value="Planned">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label="Planned" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' }} />
                          <Typography variant="body2" color="#64748b">(Scheduled for future)</Typography>
                        </Box>
                      </MenuItem>
                      <MenuItem value="Done" disabled={isFuture}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label="Done" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(16, 185, 129, 0.12)', color: '#059669' }} />
                          <Typography variant="body2" color="#64748b">
                            {isFuture ? '(Cannot mark Done before scheduled time)' : '(Demo completed successfully)'}
                          </Typography>
                        </Box>
                      </MenuItem>
                      <MenuItem value="Not Done">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label="Not Done" size="small" sx={{ fontSize: 11, fontWeight: 700, bgcolor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }} />
                          <Typography variant="body2" color="#64748b">(Customer absent / cancelled)</Typography>
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>

                  {demoStatus === 'Done' && isFuture && (
                    <Alert severity="warning" sx={{ borderRadius: 2 }}>
                      Cannot mark as Done: The scheduled demo time is in the future ({demoDate} at {demoTime}). A demo cannot be marked Done before its scheduled date and time.
                    </Alert>
                  )}
                </>
              );
            })()}

            <TextField
              fullWidth
              required={demoStatus === 'Done' || demoStatus === 'Not Done'}
              multiline
              rows={3}
              label={
                demoStatus === 'Done' || demoStatus === 'Not Done'
                  ? 'Demo Remarks / Notes * (Required)'
                  : 'Demo Remarks / Notes'
              }
              placeholder={
                demoStatus === 'Done'
                  ? 'Enter demo outcome, modules demonstrated, customer feedback, next steps... (Required)'
                  : demoStatus === 'Not Done'
                  ? 'Enter reason demo was not done (customer unavailable, cancelled, rescheduled)... (Required)'
                  : 'Enter product modules to cover, customer requirements, special notes...'
              }
              value={demoRemarks}
              onChange={(e) => setDemoRemarks(e.target.value)}
              helperText={
                demoStatus === 'Done' || demoStatus === 'Not Done'
                  ? 'Remarks are mandatory when marking demo as Done or Not Done'
                  : ''
              }
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCloseDemo}
            disabled={savingDemo}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
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
              fontWeight: 600,
              px: 3,
              bgcolor: '#4f46e5',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
              '&:hover': { bgcolor: '#4338ca' },
            }}
          >
            {savingDemo ? 'Saving...' : existingDemo ? 'Update Demo' : 'Schedule Demo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Outcome Modal (for Sales Agent - Win/Lost Outcome Workflow) */}
      <Dialog
        open={outcomeOpen}
        onClose={handleCloseOutcome}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            border: '1px solid',
            borderColor: outcomeType === 'WON' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 1.5,
            borderBottom: '1px solid #e2e8f0',
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
                bgcolor: outcomeType === 'WON' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: outcomeType === 'WON' ? '#059669' : '#dc2626',
              }}
            >
              {outcomeType === 'WON' ? <EmojiEvents sx={{ fontSize: 22 }} /> : <Cancel sx={{ fontSize: 22 }} />}
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                Lead Outcome: {outcomeType === 'WON' ? 'Close as Won' : 'Close as Lost'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Sales Agent Finalization Workflow
              </Typography>
            </Box>
          </Box>
          <IconButton
            size="small"
            onClick={handleCloseOutcome}
            disabled={savingOutcome}
            sx={{ color: '#94a3b8', '&:hover': { color: '#0f172a' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2.5 }}>
          {outcomeError && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
              {outcomeError}
            </Alert>
          )}

          {/* Lead Summary Info Card */}
          {selectedOutcomeLead && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Lead / Organization:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedOutcomeLead.organizationName}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Lead Number:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    #{selectedOutcomeLead.leadNumber}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Person:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedOutcomeLead.primaryContact?.name || '—'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Contact Phone:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    {selectedOutcomeLead.primaryContact?.phone || '—'}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Outcome Type Selector: Won vs Lost */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#334155', mb: 1.5 }}>
            Select Outcome Result *
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={6}>
              <Paper
                elevation={0}
                onClick={() => setOutcomeType('WON')}
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: outcomeType === 'WON' ? '#059669' : '#e2e8f0',
                  bgcolor: outcomeType === 'WON' ? 'rgba(16, 185, 129, 0.08)' : '#ffffff',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  '&:hover': {
                    borderColor: '#059669',
                    bgcolor: 'rgba(16, 185, 129, 0.04)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: outcomeType === 'WON' ? '#059669' : '#f1f5f9',
                    color: outcomeType === 'WON' ? '#ffffff' : '#64748b',
                  }}
                >
                  <EmojiEvents sx={{ fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="body1" fontWeight={700} sx={{ color: outcomeType === 'WON' ? '#059669' : '#1e293b' }}>
                    Won (Signed)
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Deal successfully closed
                  </Typography>
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={6}>
              <Paper
                elevation={0}
                onClick={() => setOutcomeType('LOST')}
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: outcomeType === 'LOST' ? '#dc2626' : '#e2e8f0',
                  bgcolor: outcomeType === 'LOST' ? 'rgba(239, 68, 68, 0.08)' : '#ffffff',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  '&:hover': {
                    borderColor: '#dc2626',
                    bgcolor: 'rgba(239, 68, 68, 0.04)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: outcomeType === 'LOST' ? '#dc2626' : '#f1f5f9',
                    color: outcomeType === 'LOST' ? '#ffffff' : '#64748b',
                  }}
                >
                  <Cancel sx={{ fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="body1" fontWeight={700} sx={{ color: outcomeType === 'LOST' ? '#dc2626' : '#1e293b' }}>
                    Lost (Dropped)
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Customer declined / lost
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* Conditional Fields based on Won vs Lost */}
          <Stack spacing={2.5}>
            {outcomeType === 'WON' ? (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Deal Value (₹)"
                    placeholder="e.g. 50000"
                    value={outcomeDealValue}
                    onChange={(e) => setOutcomeDealValue(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Product / Plan"
                    placeholder="e.g. Annual Enterprise Subscription"
                    value={outcomeProduct}
                    onChange={(e) => setOutcomeProduct(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Grid>
              </Grid>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel id="outcome-lost-reason-label">Lost Reason</InputLabel>
                <Select
                  labelId="outcome-lost-reason-label"
                  label="Lost Reason"
                  value={outcomeLostReason}
                  onChange={(e) => setOutcomeLostReason(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {LOST_REASONS.map((reason) => (
                    <MenuItem key={reason} value={reason}>
                      {reason}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Outcome Remark: Optional for Won, Required for Lost */}
            <TextField
              fullWidth
              required={outcomeType === 'LOST'}
              multiline
              rows={3}
              label={
                outcomeType === 'WON'
                  ? 'Closing Notes / Remarks (Optional)'
                  : 'Outcome Remark / Reason for Loss * (Required)'
              }
              placeholder={
                outcomeType === 'WON'
                  ? 'Enter contract details, deliverables, key customer agreement points, closing summary... (Optional)'
                  : 'Enter specific reasons for losing the deal, feedback received from the customer... (Required)'
              }
              value={outcomeRemark}
              onChange={(e) => setOutcomeRemark(e.target.value)}
              helperText={
                outcomeType === 'WON'
                  ? 'Optional for Won leads'
                  : 'Remark or reason is required for marking lead as Lost'
              }
              error={Boolean(outcomeError && outcomeType === 'LOST' && !outcomeRemark.trim() && !outcomeLostReason.trim())}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="outlined"
            onClick={handleCloseOutcome}
            disabled={savingOutcome}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveOutcome}
            disabled={savingOutcome || (outcomeType === 'LOST' && !outcomeRemark.trim() && !outcomeLostReason.trim())}
            startIcon={savingOutcome ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              bgcolor: outcomeType === 'WON' ? '#059669' : '#dc2626',
              boxShadow: outcomeType === 'WON'
                ? '0 2px 8px rgba(16, 185, 129, 0.3)'
                : '0 2px 8px rgba(239, 68, 68, 0.3)',
              '&:hover': {
                bgcolor: outcomeType === 'WON' ? '#047857' : '#b91c1c',
              },
            }}
          >
            {savingOutcome ? 'Finalizing...' : outcomeType === 'WON' ? 'Confirm Close as Won' : 'Confirm Close as Lost'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Notification Feedback */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnackbarMessage(null)} sx={{ borderRadius: 2, width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
