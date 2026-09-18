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
  SwapHoriz,
  Send,
  PersonAdd,
  AssignmentInd,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/authService';
import { getAgentDashboard } from '../services/dashboardService';
import { 
  listLeads, createCallLog, createWalkIn, createDemo, updateDemoStatus, 
  closeWon, closeLost, getAssignedActivities, updateWalkInStatus, 
  updateSalesFollowUpStatus, rescheduleFollowUp, completeFollowUp,
  createSalesFollowUp, transferLead, sendWhatsAppActivity
} from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { formatDate, formatTime, isOverdue, isUpcoming, formatDateToYYYYMMDD, getFollowUpStatus } from '../utils/dateHelpers';
import { CALL_DISPOSITIONS, LOST_REASONS } from '../utils/constants';
import { getNextAction } from '../utils/nextActionHelper';
import { getLeadActionMenuItems } from '../utils/leadActionHelper';
import { normalizeWhatsAppPhone, generateSalesAgentTemplate, createWhatsAppUrl, resolveSalesAgentForLead } from '../utils/whatsappHelper';
import KpiCard from '../components/dashboard/KpiCard';
import TodayActionsSection from '../components/dashboard/TodayActionsSection';
import RecentActivitySection from '../components/dashboard/RecentActivitySection';
import AssignedActivitiesSection from '../components/dashboard/AssignedActivitiesSection';

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

  const agentName = user?.fullName || user?.username || 'Agent';
  const agentRole = user?.agentRole || 'Calling Agent';
  const isSalesAgent = agentRole?.toLowerCase() === 'sales agent';

  // Assigned Activities State for Sales Agent Workspace
  const [assignedActivities, setAssignedActivities] = useState([]);
  const [assignedSummary, setAssignedSummary] = useState({});
  const [assignedLoading, setAssignedLoading] = useState(false);

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

  // Active Agents list for transfer and assignment
  const [activeAgentsList, setActiveAgentsList] = useState([]);

  // Transfer Lead Modal State
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedTransferLead, setSelectedTransferLead] = useState(null);
  const [transferAgentId, setTransferAgentId] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState(null);

  // Assign to Sales Agent Modal State
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignLead, setSelectedAssignLead] = useState(null);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignType, setAssignType] = useState('Demo'); // 'Demo', 'Walk-in', 'Sales Follow-up'
  const [assignDate, setAssignDate] = useState('');
  const [assignTime, setAssignTime] = useState('11:00');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Sales Follow-up Modal State
  const [salesFollowUpOpen, setSalesFollowUpOpen] = useState(false);
  const [selectedSalesFollowUpLead, setSelectedSalesFollowUpLead] = useState(null);
  const [salesFollowUpDate, setSalesFollowUpDate] = useState('');
  const [salesFollowUpTime, setSalesFollowUpTime] = useState('11:00');
  const [salesFollowUpRemarks, setSalesFollowUpRemarks] = useState('');
  const [salesFollowUpAgentId, setSalesFollowUpAgentId] = useState('');
  const [savingSalesFollowUp, setSavingSalesFollowUp] = useState(false);
  const [salesFollowUpError, setSalesFollowUpError] = useState(null);

  // WhatsApp Sales Agent Modal State
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [selectedWhatsAppLead, setSelectedWhatsAppLead] = useState(null);
  const [whatsAppData, setWhatsAppData] = useState({
    salesAgentId: '',
    salesAgentName: '',
    salesAgentPhone: '',
    salesAgentRole: 'Sales Agent',
    relatedActivityType: 'Demo',
    scheduledDate: '',
    scheduledTime: '',
    remarks: '',
    messageContent: '',
  });
  const [whatsAppError, setWhatsAppError] = useState(null);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState(null);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);

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

  const fetchAssignedActivities = useCallback(async () => {
    if (!isSalesAgent) return;
    setAssignedLoading(true);
    try {
      const res = await getAssignedActivities();
      if (res) {
        setAssignedActivities(res.activities || []);
        setAssignedSummary(res.summary || {});
      }
    } catch (err) {
      console.error('Failed to load assigned activities', err);
    } finally {
      setAssignedLoading(false);
    }
  }, [isSalesAgent]);

  useEffect(() => {
    if (isSalesAgent) {
      fetchAssignedActivities();
    }
  }, [fetchAssignedActivities, isSalesAgent]);

  const handleUpdateAssignedStatus = async (activity, newStatus, remarks) => {
    try {
      if (activity.activityType === 'Demo') {
        await updateDemoStatus(activity.leadId, activity.id, {
          status: newStatus === 'Completed' ? 'Done' : newStatus,
          remarks,
        });
        setSnackbarMessage(`Demo marked as ${newStatus} successfully!`);
      } else if (activity.activityType === 'Walk-in') {
        await updateWalkInStatus(activity.leadId, activity.id, {
          status: newStatus,
          remark: remarks,
        });
        setSnackbarMessage(`Walk-in marked as ${newStatus} successfully!`);
      } else if (activity.activityType === 'Sales Follow-up') {
        if (activity.id.startsWith('lead_fu_')) {
          await completeFollowUp(activity.leadId, { remarks });
        } else {
          await updateSalesFollowUpStatus(activity.leadId, activity.id, {
            status: newStatus,
            remarks,
          });
        }
        setSnackbarMessage(`Sales Follow-up marked as ${newStatus}!`);
      }
      await Promise.all([fetchAssignedActivities(), fetchDashboardData(), fetchMyLeads()]);
    } catch (err) {
      setSnackbarMessage(err.response?.data?.message || 'Failed to update activity status');
      throw err;
    }
  };

  const handleRescheduleAssigned = async (activity, date, time, remarks) => {
    try {
      if (activity.activityType === 'Demo') {
        await updateDemoStatus(activity.leadId, activity.id, {
          demoDate: date,
          demoTime: time,
          remarks,
        });
        setSnackbarMessage(`Demo rescheduled for ${date} at ${time}`);
      } else if (activity.activityType === 'Walk-in') {
        await updateWalkInStatus(activity.leadId, activity.id, {
          walkInDate: date,
          walkInTime: time,
          remark: remarks,
        });
        setSnackbarMessage(`Walk-in rescheduled for ${date} at ${time}`);
      } else if (activity.activityType === 'Sales Follow-up') {
        if (activity.id.startsWith('lead_fu_')) {
          await rescheduleFollowUp(activity.leadId, { followUpDate: date, followUpTime: time, remarks });
        } else {
          await updateSalesFollowUpStatus(activity.leadId, activity.id, {
            followUpDate: date,
            followUpTime: time,
            remarks,
          });
        }
        setSnackbarMessage(`Sales Follow-up rescheduled for ${date} at ${time}`);
      }
      await Promise.all([fetchAssignedActivities(), fetchDashboardData(), fetchMyLeads()]);
    } catch (err) {
      setSnackbarMessage(err.response?.data?.message || 'Failed to reschedule activity');
      throw err;
    }
  };

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

  // Open Transfer Modal
  const handleOpenTransfer = async (lead) => {
    setSelectedTransferLead(lead);
    setTransferAgentId('');
    setTransferRemarks('');
    setTransferError(null);
    setTransferOpen(true);
    try {
      const agents = await getActiveAgents();
      setActiveAgentsList(agents || []);
    } catch (err) {
      console.error('Failed to load active agents for transfer', err);
    }
  };

  const handleExecuteTransfer = async () => {
    if (!selectedTransferLead || !transferAgentId) return;
    setSavingTransfer(true);
    setTransferError(null);
    try {
      await transferLead(selectedTransferLead._id, {
        toAgentId: transferAgentId,
        remarks: transferRemarks,
      });
      setSnackbarMessage('Lead transferred successfully! New owner updated immediately.');
      setTransferOpen(false);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
      if (isSalesAgent) await fetchAssignedActivities();
    } catch (err) {
      setTransferError(err.response?.data?.message || 'Unable to transfer lead');
    } finally {
      setSavingTransfer(false);
    }
  };

  // Open Assign to Sales Agent Modal
  const handleOpenAssign = async (lead) => {
    setSelectedAssignLead(lead);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setAssignDate(formatDateToYYYYMMDD(tomorrow));
    setAssignTime('11:00');
    setAssignRemarks('');
    setAssignType('Demo');
    setAssignError(null);
    setAssignOpen(true);

    try {
      const agents = await getActiveAgents();
      setActiveAgentsList(agents || []);
      const sales = (agents || []).find(a => a.agentRole?.toLowerCase().includes('sales'));
      if (sales) setAssignAgentId(sales._id);
    } catch (err) {
      console.error('Failed to load active agents for assignment', err);
    }
  };

  const handleExecuteAssign = async () => {
    if (!selectedAssignLead || !assignAgentId) return;
    setSavingAssign(true);
    setAssignError(null);
    try {
      if (assignType === 'Demo') {
        await createDemo(selectedAssignLead._id, {
          salesAgent: assignAgentId,
          demoDate: assignDate,
          demoTime: assignTime,
          status: 'Planned',
          remarks: assignRemarks || 'Demo assigned to sales agent',
        });
      } else if (assignType === 'Walk-in') {
        await createWalkIn(selectedAssignLead._id, {
          salesAgent: assignAgentId,
          walkInDate: assignDate,
          walkInTime: assignTime,
          status: 'Planned',
          remark: assignRemarks || 'Walk-in assigned to sales agent',
        });
      } else if (assignType === 'Sales Follow-up') {
        await createSalesFollowUp(selectedAssignLead._id, {
          salesAgent: assignAgentId,
          followUpDate: assignDate,
          followUpTime: assignTime,
          remarks: assignRemarks || 'Sales follow-up assigned to sales agent',
        });
      }
      setSnackbarMessage(`Activity assigned to Sales Agent successfully!`);
      setAssignOpen(false);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
      if (isSalesAgent) await fetchAssignedActivities();
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Unable to assign activity');
    } finally {
      setSavingAssign(false);
    }
  };

  // Open Sales Follow-up Modal
  const handleOpenSalesFollowUp = async (lead) => {
    setSelectedSalesFollowUpLead(lead);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSalesFollowUpDate(formatDateToYYYYMMDD(tomorrow));
    setSalesFollowUpTime('11:00');
    setSalesFollowUpRemarks('');
    setSalesFollowUpAgentId('');
    setSalesFollowUpError(null);
    setSalesFollowUpOpen(true);

    try {
      const agents = await getActiveAgents();
      setActiveAgentsList(agents || []);
    } catch (err) {
      console.error('Failed to load active agents', err);
    }
  };

  const handleExecuteSalesFollowUp = async () => {
    if (!selectedSalesFollowUpLead) return;
    setSavingSalesFollowUp(true);
    setSalesFollowUpError(null);
    try {
      await createSalesFollowUp(selectedSalesFollowUpLead._id, {
        followUpDate: salesFollowUpDate,
        followUpTime: salesFollowUpTime,
        salesAgent: salesFollowUpAgentId || undefined,
        remarks: salesFollowUpRemarks || 'Scheduled sales follow-up',
      });
      setSnackbarMessage('Sales follow-up scheduled successfully!');
      setSalesFollowUpOpen(false);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
      if (isSalesAgent) await fetchAssignedActivities();
    } catch (err) {
      setSalesFollowUpError(err.response?.data?.message || 'Unable to schedule follow-up');
    } finally {
      setSavingSalesFollowUp(false);
    }
  };

  // Open WhatsApp Sales Agent Modal
  const handleOpenWhatsApp = async (activityType = 'Demo', lead = null) => {
    const targetLead = lead || actionMenuLead;
    if (!targetLead) return;
    setSelectedWhatsAppLead(targetLead);

    let currentAgents = activeAgentsList;
    if (!currentAgents || currentAgents.length === 0) {
      try {
        currentAgents = await getActiveAgents();
        setActiveAgentsList(currentAgents || []);
      } catch (err) {
        console.error('Failed to load agents for WhatsApp', err);
      }
    }

    const resolvedAgent = resolveSalesAgentForLead(targetLead, currentAgents || [], activityType);

    let scheduledDate = '';
    let scheduledTime = '11:00';
    let remarks = targetLead.remarks || targetLead.latestRemark || '';

    if (activityType === 'Demo') {
      if (targetLead.latestDemo) {
        scheduledDate = targetLead.latestDemo.demoDate ? targetLead.latestDemo.demoDate.substring(0, 10) : '';
        scheduledTime = targetLead.latestDemo.demoTime || '15:00';
        remarks = targetLead.latestDemo.remarks || remarks;
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        scheduledDate = formatDateToYYYYMMDD(tomorrow);
        scheduledTime = '15:00';
      }
    } else if (activityType === 'Walk-in') {
      if (targetLead.latestWalkIn) {
        scheduledDate = targetLead.latestWalkIn.walkInDate ? targetLead.latestWalkIn.walkInDate.substring(0, 10) : '';
        scheduledTime = targetLead.latestWalkIn.walkInTime || '11:00';
        remarks = targetLead.latestWalkIn.remark || remarks;
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        scheduledDate = formatDateToYYYYMMDD(tomorrow);
        scheduledTime = '11:00';
      }
    } else if (activityType === 'Sales Follow-up') {
      if (targetLead.latestFollowUp) {
        scheduledDate = targetLead.latestFollowUp.followUpDate ? targetLead.latestFollowUp.followUpDate.substring(0, 10) : '';
        scheduledTime = targetLead.latestFollowUp.followUpTime || '11:00';
        remarks = targetLead.latestFollowUp.remarks || remarks;
      } else if (targetLead.nextFollowUpAt) {
        const dt = new Date(targetLead.nextFollowUpAt);
        scheduledDate = formatDateToYYYYMMDD(dt);
        scheduledTime = formatTime(targetLead.nextFollowUpAt) || '11:00';
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        scheduledDate = formatDateToYYYYMMDD(tomorrow);
        scheduledTime = '11:00';
      }
    } else {
      activityType = 'Lead Assignment';
      if (targetLead.nextFollowUpAt) {
        const dt = new Date(targetLead.nextFollowUpAt);
        scheduledDate = formatDateToYYYYMMDD(dt);
        scheduledTime = formatTime(targetLead.nextFollowUpAt) || '11:00';
      }
    }

    const contactPerson = targetLead.primaryContact?.name || '—';
    const contactPhone = targetLead.primaryContact?.phone || '—';

    const templateMsg = generateSalesAgentTemplate({
      salesAgentName: resolvedAgent.salesAgentName,
      activityType,
      organizationName: targetLead.organizationName,
      leadNumber: targetLead.leadNumber,
      scheduledDate,
      scheduledTime,
      contactPerson,
      contactPhone,
      remarks,
    });

    setWhatsAppData({
      salesAgentId: resolvedAgent.salesAgentId,
      salesAgentName: resolvedAgent.salesAgentName,
      salesAgentPhone: resolvedAgent.salesAgentPhone,
      salesAgentRole: resolvedAgent.salesAgentRole,
      relatedActivityType: activityType,
      scheduledDate,
      scheduledTime,
      remarks,
      messageContent: templateMsg,
    });
    setWhatsAppError(null);
    setWhatsAppSuccess(null);
    setWhatsAppOpen(true);
  };

  const handleSalesAgentSelectChange = (agentId) => {
    const agent = (activeAgentsList || []).find((a) => a._id?.toString() === agentId?.toString());
    if (!agent) return;

    const agentName = agent.fullName || agent.username || 'Sales Agent';
    const agentPhone = agent.phone || '';

    const newMsg = generateSalesAgentTemplate({
      salesAgentName: agentName,
      activityType: whatsAppData.relatedActivityType,
      organizationName: selectedWhatsAppLead?.organizationName,
      leadNumber: selectedWhatsAppLead?.leadNumber,
      scheduledDate: whatsAppData.scheduledDate,
      scheduledTime: whatsAppData.scheduledTime,
      contactPerson: selectedWhatsAppLead?.primaryContact?.name || '—',
      contactPhone: selectedWhatsAppLead?.primaryContact?.phone || '—',
      remarks: whatsAppData.remarks,
    });

    setWhatsAppData((p) => ({
      ...p,
      salesAgentId: agent._id?.toString(),
      salesAgentName: agentName,
      salesAgentPhone: agentPhone,
      salesAgentRole: agent.agentRole || agent.role || 'Sales Agent',
      messageContent: newMsg,
    }));
  };

  const handleCloseWhatsApp = () => {
    if (savingWhatsApp) return;
    setWhatsAppOpen(false);
    setWhatsAppError(null);
    setWhatsAppSuccess(null);
    setSelectedWhatsAppLead(null);
  };

  const handleSendWhatsApp = async () => {
    if (!selectedWhatsAppLead) return;

    const urlRes = createWhatsAppUrl(whatsAppData.salesAgentPhone, whatsAppData.messageContent);
    if (!urlRes.success) {
      setWhatsAppError(urlRes.error || `Selected Sales Agent (${whatsAppData.salesAgentName || 'Sales Agent'}) does not have a valid phone number in their user profile.`);
      return;
    }

    if (!whatsAppData.messageContent || !whatsAppData.messageContent.trim()) {
      setWhatsAppError('Message content cannot be empty');
      return;
    }

    setSavingWhatsApp(true);
    setWhatsAppError(null);

    try {
      // 1. Open WhatsApp Web / App via wa.me link
      window.open(urlRes.url, '_blank', 'noopener,noreferrer');

      // 2. Record official CRM activity
      await sendWhatsAppActivity(selectedWhatsAppLead._id, {
        messageType: `${whatsAppData.relatedActivityType} Details`,
        messageContent: whatsAppData.messageContent.trim(),
        recipientPhone: whatsAppData.salesAgentPhone.trim(),
        recipientName: whatsAppData.salesAgentName.trim(),
        recipientRole: 'Sales Agent',
        relatedActivityType: whatsAppData.relatedActivityType,
        salesAgentId: whatsAppData.salesAgentId || undefined,
        salesAgentName: whatsAppData.salesAgentName || undefined,
        scheduledDate: whatsAppData.scheduledDate || undefined,
        scheduledTime: whatsAppData.scheduledTime || undefined,
        remarks: whatsAppData.remarks || undefined,
        status: 'Opened in WhatsApp (wa.me)',
      });

      setWhatsAppSuccess(`Opening WhatsApp for ${whatsAppData.salesAgentName}...`);
      setSnackbarMessage(`WhatsApp opened for ${whatsAppData.salesAgentName}!`);
      setTimeout(() => {
        setWhatsAppOpen(false);
        setWhatsAppSuccess(null);
        setSelectedWhatsAppLead(null);
      }, 1200);
      await Promise.all([fetchMyLeads(), fetchDashboardData()]);
      if (isSalesAgent) await fetchAssignedActivities();
    } catch (err) {
      setWhatsAppError(err.response?.data?.message || 'Failed to record WhatsApp activity');
    } finally {
      setSavingWhatsApp(false);
    }
  };

  // Handle Action selection from the row dropdown menu
  const handleSelectAction = (actionKey) => {
    const lead = actionMenuLead;
    handleCloseActionMenu();
    if (!lead) return;

    switch (actionKey) {
      case 'log_call':
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
      case 'schedule_walkin':
      case 'record_walkin':
        handleOpenWalkIn(lead);
        break;
      case 'schedule_demo':
      case 'reschedule_demo':
        handleOpenDemo(lead, 'Planned');
        break;
      case 'mark_demo_done':
        handleOpenDemo(lead, 'Done');
        break;
      case 'mark_demo_not_done':
        handleOpenDemo(lead, 'Not Done');
        break;
      case 'sales_followup':
        handleOpenSalesFollowUp(lead);
        break;
      case 'assign_sales_agent':
        handleOpenAssign(lead);
        break;
      case 'transfer_lead':
        handleOpenTransfer(lead);
        break;
      case 'whatsapp_sales_agent':
      case 'send_whatsapp':
        handleOpenWhatsApp('Lead Assignment', lead);
        break;
      case 'whatsapp_demo':
      case 'demo_confirmation':
        handleOpenWhatsApp('Demo', lead);
        break;
      case 'whatsapp_walkin':
      case 'walkin_confirmation':
        handleOpenWhatsApp('Walk-in', lead);
        break;
      case 'whatsapp_followup':
      case 'followup_reminder':
        handleOpenWhatsApp('Sales Follow-up', lead);
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
      case 'log_call':
      case 'call_now':
        return <PhoneInTalk sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'schedule_followup':
      case 'reschedule_followup':
        return <Schedule sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'followup_now':
        return <PhoneInTalk sx={{ fontSize: 16, color: '#ea580c' }} />;
      case 'schedule_walkin':
      case 'record_walkin':
        return <DirectionsWalk sx={{ fontSize: 16, color: '#059669' }} />;
      case 'schedule_demo':
      case 'reschedule_demo':
        return <LaptopMac sx={{ fontSize: 16, color: '#4f46e5' }} />;
      case 'mark_demo_done':
        return <CheckCircle sx={{ fontSize: 16, color: '#059669' }} />;
      case 'mark_demo_not_done':
        return <Cancel sx={{ fontSize: 16, color: '#dc2626' }} />;
      case 'sales_followup':
        return <EventIcon sx={{ fontSize: 16, color: '#d97706' }} />;
      case 'assign_sales_agent':
        return <PersonAdd sx={{ fontSize: 16, color: '#ea580c' }} />;
      case 'transfer_lead':
        return <SwapHoriz sx={{ fontSize: 16, color: '#8b5cf6' }} />;
      case 'close_won':
        return <EmojiEvents sx={{ fontSize: 16, color: '#059669' }} />;
      case 'close_lost':
        return <Cancel sx={{ fontSize: 16, color: '#dc2626' }} />;
      case 'whatsapp_sales_agent':
      case 'whatsapp_demo':
      case 'whatsapp_walkin':
      case 'whatsapp_followup':
      case 'send_whatsapp':
      case 'demo_confirmation':
      case 'walkin_confirmation':
      case 'followup_reminder':
        return <WhatsAppIcon sx={{ fontSize: 16, color: '#25D366' }} />;
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

      {/* Sales Agent Workspace: Dedicated Assigned Activities Section */}
      {isSalesAgent && (
        <AssignedActivitiesSection
          activities={assignedActivities}
          summary={assignedSummary}
          loading={assignedLoading}
          onRefresh={fetchAssignedActivities}
          onUpdateStatus={handleUpdateAssignedStatus}
          onReschedule={handleRescheduleAssigned}
          onOpenOutcome={(item) => handleOpenOutcome({ _id: item.leadId, leadNumber: item.leadNumber, organizationName: item.organizationName }, 'WON')}
          navigate={navigate}
        />
      )}

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
                variant="outlined"
                startIcon={<SwapHoriz />}
                onClick={() => navigate('/transfer-requests')}
                sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
              >
                Transfer History
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
          const items = getLeadActionMenuItems(actionMenuLead, user);
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

      {/* Transfer Lead Dialog (Immediate ownership transfer with audit trail) */}
      <Dialog
        open={transferOpen}
        onClose={() => !savingTransfer && setTransferOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: '#8b5cf6', width: 36, height: 36, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }}>
              <SwapHoriz sx={{ fontSize: 20, color: '#ffffff' }} />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', fontSize: 17 }}>
                Transfer Lead Ownership
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {selectedTransferLead?.organizationName} ({selectedTransferLead?.leadNumber})
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setTransferOpen(false)} disabled={savingTransfer} sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
          {transferError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setTransferError(null)}>
              {transferError}
            </Alert>
          )}

          <Stack spacing={2.5}>
            {/* Current Owner Display */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', borderColor: '#e2e8f0' }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current Owner
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34, fontSize: 13, fontWeight: 600 }}>
                  {(selectedTransferLead?.currentOwner?.fullName || selectedTransferLead?.currentOwnerName || 'U')[0]?.toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2" fontWeight={600} color="#0f172a">
                    {selectedTransferLead?.currentOwner?.fullName || selectedTransferLead?.currentOwnerName || 'Unassigned'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedTransferLead?.currentOwner?.email || (selectedTransferLead?.currentOwner?.username ? `@${selectedTransferLead.currentOwner.username}` : 'No email')}
                  </Typography>
                </Box>
                <Chip
                  label={selectedTransferLead?.currentOwner?.agentRole || selectedTransferLead?.currentOwner?.role || 'Agent'}
                  size="small"
                  variant="outlined"
                  sx={{ borderRadius: 1.5, fontSize: 11, fontWeight: 600 }}
                />
              </Box>
            </Paper>

            {/* Destination Active Agent */}
            <FormControl fullWidth size="small" required>
              <InputLabel id="transfer-agent-select-label">Select New Active Agent</InputLabel>
              <Select
                labelId="transfer-agent-select-label"
                label="Select New Active Agent *"
                value={transferAgentId}
                onChange={(e) => setTransferAgentId(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {activeAgentsList
                  .filter((a) => a._id !== (selectedTransferLead?.currentOwner?._id || selectedTransferLead?.currentOwner))
                  .map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: agent.agentRole?.toLowerCase().includes('sales') ? '#ea580c' : '#0284c7' }}>
                          {agent.fullName?.[0]?.toUpperCase() || 'A'}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>
                          {agent.fullName || agent.username}
                        </Typography>
                        <Chip
                          label={agent.agentRole || agent.role || 'Agent'}
                          size="small"
                          sx={{ ml: 'auto', height: 20, fontSize: 10, borderRadius: 1 }}
                        />
                      </Box>
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            {/* Remarks / Reason */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Transfer Reason / Remarks"
              placeholder="e.g. Reassigning lead for sales visit and closing..."
              value={transferRemarks}
              onChange={(e) => setTransferRemarks(e.target.value)}
              helperText="Recorded in the lead activity audit trail and transfer log."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="outlined"
            onClick={() => setTransferOpen(false)}
            disabled={savingTransfer}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecuteTransfer}
            disabled={savingTransfer || !transferAgentId}
            startIcon={savingTransfer ? <CircularProgress size={16} color="inherit" /> : <SwapHoriz />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              bgcolor: '#8b5cf6',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
              '&:hover': { bgcolor: '#7c3aed' },
            }}
          >
            {savingTransfer ? 'Transferring...' : 'Confirm Transfer Lead'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign to Sales Agent Dialog */}
      <Dialog
        open={assignOpen}
        onClose={() => !savingAssign && setAssignOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: '#ea580c', width: 36, height: 36, boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)' }}>
              <PersonAdd sx={{ fontSize: 20, color: '#ffffff' }} />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', fontSize: 17 }}>
                Assign to Sales Agent
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {selectedAssignLead?.organizationName} ({selectedAssignLead?.leadNumber})
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setAssignOpen(false)} disabled={savingAssign} sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
          {assignError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setAssignError(null)}>
              {assignError}
            </Alert>
          )}

          <Stack spacing={2.5}>
            <FormControl fullWidth size="small" required>
              <InputLabel id="assign-sales-agent-label">Select Sales Agent</InputLabel>
              <Select
                labelId="assign-sales-agent-label"
                label="Select Sales Agent *"
                value={assignAgentId}
                onChange={(e) => setAssignAgentId(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {activeAgentsList
                  .filter((a) => !a.agentRole || a.agentRole.toLowerCase().includes('sales') || activeAgentsList.length <= 2)
                  .map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: '#ea580c' }}>
                          {agent.fullName?.[0]?.toUpperCase() || 'S'}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>
                          {agent.fullName || agent.username}
                        </Typography>
                        <Chip
                          label={agent.agentRole || 'Sales Agent'}
                          size="small"
                          sx={{ ml: 'auto', height: 20, fontSize: 10, borderRadius: 1 }}
                        />
                      </Box>
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="assign-activity-type-label">Activity Type</InputLabel>
              <Select
                labelId="assign-activity-type-label"
                label="Activity Type"
                value={assignType}
                onChange={(e) => setAssignType(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="Demo">💻 Product Demo</MenuItem>
                <MenuItem value="Walk-in">🚶 Customer Walk-in</MenuItem>
                <MenuItem value="Sales Follow-up">📞 Sales Follow-up</MenuItem>
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Scheduled Date"
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="time"
                  label="Scheduled Time"
                  value={assignTime}
                  onChange={(e) => setAssignTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Instructions / Remarks for Sales Agent"
              placeholder="e.g. Schedule product demonstration focusing on clinic management features..."
              value={assignRemarks}
              onChange={(e) => setAssignRemarks(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="outlined"
            onClick={() => setAssignOpen(false)}
            disabled={savingAssign}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecuteAssign}
            disabled={savingAssign || !assignAgentId}
            startIcon={savingAssign ? <CircularProgress size={16} color="inherit" /> : <PersonAdd />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              bgcolor: '#ea580c',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
              '&:hover': { bgcolor: '#c2410c' },
            }}
          >
            {savingAssign ? 'Assigning...' : 'Assign to Sales Agent'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sales Follow-up Dialog */}
      <Dialog
        open={salesFollowUpOpen}
        onClose={() => !savingSalesFollowUp && setSalesFollowUpOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: '#d97706', width: 36, height: 36, boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)' }}>
              <Schedule sx={{ fontSize: 20, color: '#ffffff' }} />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', fontSize: 17 }}>
                Schedule Sales Follow-up
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {selectedSalesFollowUpLead?.organizationName} ({selectedSalesFollowUpLead?.leadNumber})
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setSalesFollowUpOpen(false)} disabled={savingSalesFollowUp} sx={{ color: '#94a3b8' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
          {salesFollowUpError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSalesFollowUpError(null)}>
              {salesFollowUpError}
            </Alert>
          )}

          <Stack spacing={2.5}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Follow-up Date"
                  value={salesFollowUpDate}
                  onChange={(e) => setSalesFollowUpDate(e.target.value)}
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
                  value={salesFollowUpTime}
                  onChange={(e) => setSalesFollowUpTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            <FormControl fullWidth size="small">
              <InputLabel id="sales-fu-agent-label">Sales Agent (Optional)</InputLabel>
              <Select
                labelId="sales-fu-agent-label"
                label="Sales Agent (Optional)"
                value={salesFollowUpAgentId}
                onChange={(e) => setSalesFollowUpAgentId(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Unassigned (Self / Current Owner)</MenuItem>
                {activeAgentsList
                  .filter((a) => !a.agentRole || a.agentRole.toLowerCase().includes('sales') || activeAgentsList.length <= 2)
                  .map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>
                      {agent.fullName || agent.username} ({agent.agentRole || 'Sales Agent'})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Follow-up Notes / Agenda"
              placeholder="e.g. Commercial proposal review, quotation follow-up..."
              value={salesFollowUpRemarks}
              onChange={(e) => setSalesFollowUpRemarks(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="outlined"
            onClick={() => setSalesFollowUpOpen(false)}
            disabled={savingSalesFollowUp}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecuteSalesFollowUp}
            disabled={savingSalesFollowUp}
            startIcon={savingSalesFollowUp ? <CircularProgress size={16} color="inherit" /> : <Schedule />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              bgcolor: '#d97706',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)',
              '&:hover': { bgcolor: '#b45309' },
            }}
          >
            {savingSalesFollowUp ? 'Scheduling...' : 'Schedule Follow-up'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sales Agent WhatsApp Communication Dialog */}
      <Dialog
        open={whatsAppOpen}
        onClose={handleCloseWhatsApp}
        maxWidth="md"
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
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'rgba(37, 211, 102, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#25D366',
            }}
          >
            <WhatsAppIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', lineHeight: 1.2 }}>
              WhatsApp Sales Agent
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Notify assigned Sales Agent via WhatsApp (wa.me) with pre-filled activity details
            </Typography>
          </Box>
          <Chip
            label="wa.me Web / App"
            size="small"
            sx={{
              ml: 'auto',
              mr: 1,
              bgcolor: 'rgba(37, 211, 102, 0.1)',
              color: '#15803d',
              border: '1px solid rgba(37, 211, 102, 0.3)',
              fontWeight: 700,
              fontSize: 11,
            }}
          />
          <IconButton sx={{ color: 'text.secondary' }} onClick={handleCloseWhatsApp}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2.5 }}>
          {whatsAppError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {whatsAppError}
            </Alert>
          )}

          {whatsAppSuccess && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {whatsAppSuccess}
            </Alert>
          )}

          <Grid container spacing={2.5} sx={{ mt: 0.2 }}>
            {/* Sales Agent Selector */}
            <Grid item xs={12} sm={7}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Assigned Sales Agent *</InputLabel>
                <Select
                  value={whatsAppData.salesAgentId || ''}
                  label="Assigned Sales Agent *"
                  onChange={(e) => handleSalesAgentSelectChange(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {activeAgentsList.map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>
                      {agent.fullName || agent.username} ({agent.agentRole || agent.role || 'Sales'}) {agent.phone ? `• ${agent.phone}` : '• (No Phone)'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Related Activity Type Selector */}
            <Grid item xs={12} sm={5}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Activity Type *</InputLabel>
                <Select
                  value={whatsAppData.relatedActivityType || 'Demo'}
                  label="Activity Type *"
                  onChange={(e) => {
                    const newType = e.target.value;
                    const newMsg = generateSalesAgentTemplate({
                      salesAgentName: whatsAppData.salesAgentName,
                      activityType: newType,
                      organizationName: selectedWhatsAppLead?.organizationName,
                      leadNumber: selectedWhatsAppLead?.leadNumber,
                      scheduledDate: whatsAppData.scheduledDate,
                      scheduledTime: whatsAppData.scheduledTime,
                      contactPerson: selectedWhatsAppLead?.primaryContact?.name || '—',
                      contactPhone: selectedWhatsAppLead?.primaryContact?.phone || '—',
                      remarks: whatsAppData.remarks,
                    });

                    setWhatsAppData((p) => ({
                      ...p,
                      relatedActivityType: newType,
                      messageContent: newMsg,
                    }));
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="Demo">Product Demo</MenuItem>
                  <MenuItem value="Walk-in">Walk-in Visit</MenuItem>
                  <MenuItem value="Sales Follow-up">Sales Follow-up</MenuItem>
                  <MenuItem value="Lead Assignment">Lead Assignment</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Sales Agent Dynamic Phone Display */}
            <Grid item xs={12}>
              {whatsAppData.salesAgentPhone ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <Avatar sx={{ width: 30, height: 30, bgcolor: '#25D366', color: '#fff' }}>
                    <WhatsAppIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#15803d', fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
                      Sales Agent WhatsApp / Phone
                    </Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#14532d' }}>
                      {normalizeWhatsAppPhone(whatsAppData.salesAgentPhone).displayPhone}
                      {' '}
                      <span style={{ fontWeight: 500, fontSize: 12, color: '#16a34a' }}>
                        ({whatsAppData.salesAgentName || 'Assigned Sales Agent'})
                      </span>
                    </Typography>
                  </Box>
                  <Chip
                    label="Ready to send via wa.me"
                    size="small"
                    sx={{
                      ml: 'auto',
                      bgcolor: 'rgba(37, 211, 102, 0.2)',
                      color: '#15803d',
                      fontWeight: 700,
                      fontSize: 11,
                      border: '1px solid rgba(37, 211, 102, 0.4)',
                    }}
                  />
                </Paper>
              ) : (
                <Alert severity="warning" sx={{ borderRadius: 2, py: 0.5 }}>
                  <strong>No phone number found</strong> for {whatsAppData.salesAgentName || 'the selected agent'}. Please add a phone number in their user settings before sending WhatsApp.
                </Alert>
              )}
            </Grid>

            {/* Activity Metadata Preview Box */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.75,
                  borderRadius: 2,
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 10 }}>
                    Lead / Organization
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: 'text.primary' }}>
                    {selectedWhatsAppLead?.organizationName} (#{selectedWhatsAppLead?.leadNumber})
                  </Typography>
                </Box>

                {whatsAppData.scheduledDate && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 10 }}>
                      Scheduled Date & Time
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#4f46e5' }}>
                      {formatDate(whatsAppData.scheduledDate)} {whatsAppData.scheduledTime ? `at ${whatsAppData.scheduledTime}` : ''}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 10 }}>
                    Client Contact
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0284c7' }}>
                    {selectedWhatsAppLead?.primaryContact?.name || '—'} {selectedWhatsAppLead?.primaryContact?.phone ? `(${selectedWhatsAppLead?.primaryContact?.phone})` : ''}
                  </Typography>
                </Box>

                <Box sx={{ ml: 'auto' }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      const resetMsg = generateSalesAgentTemplate({
                        salesAgentName: whatsAppData.salesAgentName,
                        activityType: whatsAppData.relatedActivityType,
                        organizationName: selectedWhatsAppLead?.organizationName,
                        leadNumber: selectedWhatsAppLead?.leadNumber,
                        scheduledDate: whatsAppData.scheduledDate,
                        scheduledTime: whatsAppData.scheduledTime,
                        contactPerson: selectedWhatsAppLead?.primaryContact?.name || '—',
                        contactPhone: selectedWhatsAppLead?.primaryContact?.phone || '—',
                        remarks: whatsAppData.remarks,
                      });
                      setWhatsAppData((p) => ({ ...p, messageContent: resetMsg }));
                    }}
                    sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, color: 'primary.main' }}
                  >
                    Reset to Default Template
                  </Button>
                </Box>
              </Paper>
            </Grid>

            {/* Message Content & Preview */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }}>
                  WhatsApp Message Preview & Content *
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {whatsAppData.messageContent?.length || 0} characters
                </Typography>
              </Box>

              <TextField
                fullWidth
                required
                multiline
                rows={5}
                value={whatsAppData.messageContent}
                onChange={(e) => setWhatsAppData((p) => ({ ...p, messageContent: e.target.value }))}
                placeholder="Type your WhatsApp message..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    lineHeight: 1.5,
                  },
                }}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#64748b' }}>
                💡 Clicking <strong>WhatsApp Sales Agent</strong> will open WhatsApp Web / App with this pre-filled message for <strong>{whatsAppData.salesAgentName || 'the sales agent'}</strong>. You can review and hit Send directly in WhatsApp.
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            onClick={handleCloseWhatsApp}
            disabled={savingWhatsApp}
            sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSendWhatsApp}
            disabled={savingWhatsApp || !whatsAppData.salesAgentPhone || !whatsAppData.messageContent}
            startIcon={savingWhatsApp ? <CircularProgress size={16} color="inherit" /> : <WhatsAppIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: '#25D366',
              color: '#ffffff',
              px: 3,
              boxShadow: '0 2px 8px rgba(37, 211, 102, 0.35)',
              '&:hover': { bgcolor: '#1ea952' },
            }}
          >
            {savingWhatsApp ? 'Opening WhatsApp...' : 'WhatsApp Sales Agent'}
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
