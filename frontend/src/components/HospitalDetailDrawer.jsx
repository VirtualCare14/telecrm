import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Tabs,
  Tab,
  Divider,
  Stack,
  CircularProgress,
  Alert,
  Tooltip,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Avatar,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Skeleton,
  Autocomplete,
} from '@mui/material';
import {
  Close,
  OpenInNew,
  Phone,
  PhoneInTalk,
  WhatsApp as WhatsAppIcon,
  Schedule,
  LaptopMac,
  DirectionsWalk,
  EmojiEvents,
  Cancel,
  Edit,
  PersonAdd,
  ContentCopy,
  Check as CheckIcon,
  LocationOn,
  Business,
  Person,
  AssignmentInd,
  CalendarMonth,
  History,
  InfoOutlined,
  Email,
  WarningAmber,
  CheckCircle,
  Refresh,
  Launch,
  Send,
  SwapHoriz,
  GpsFixed,
  PhotoCamera,
  Star,
  CheckCircleOutline,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  getLead,
  getLeadContacts,
  addContact,
  listCallLogs,
  createCallLog,
  listActivities,
  listDemos,
  createDemo,
  updateDemoStatus,
  listWalkIns,
  createWalkIn,
  updateWalkInStatus,
  listSalesFollowUps,
  rescheduleFollowUp,
  completeFollowUp,
  closeWon,
  closeLost,
  reopenLead,
  updateLead,
  transferLead,
  sendWhatsAppActivity,
} from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatDateToYYYYMMDD,
  formatTimeTo24H,
  splitDateAnd24HTime,
  combineDateAndTime,
  toLocalDatetimeInput,
  toISOFromLocalDatetime,
} from '../utils/dateHelpers';
import {
  normalizeWhatsAppPhone,
  generateSalesAgentTemplate,
  createWhatsAppUrl,
  resolveHospitalMapsLink,
} from '../utils/whatsappHelper';
import {
  CALL_DISPOSITIONS,
  LOST_REASONS,
  LEAD_SOURCES,
  INDUSTRIES,
  ORGANIZATION_TYPES,
  SOFTWARE_OPTIONS,
} from '../utils/constants';
import LeadActionModal from './LeadActionModal';

// Helper for disposition colors
const getDispositionStyle = (disposition) => {
  switch (disposition) {
    case 'Interested':
    case 'Connected':
    case 'Appointment Booked':
    case 'Demo Requested':
      return { color: '#059669', bg: 'rgba(16, 185, 129, 0.1)', border: '#a7f3d0' };
    case 'Call Back Later':
    case 'Follow-up Required':
    case 'Decision Maker Unavailable':
    case 'Referred to Another Person':
    case 'Proposal Discussion':
    case 'Negotiation':
      return { color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', border: '#bae6fd' };
    case 'Not Interested':
    case 'Wrong Number':
      return { color: '#dc2626', bg: 'rgba(239, 68, 68, 0.1)', border: '#fecaca' };
    case 'No Answer':
    case 'Busy':
    case 'Not Reachable':
    case 'Switched Off':
      return { color: '#d97706', bg: 'rgba(245, 158, 11, 0.1)', border: '#fde68a' };
    default:
      return { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
};

export default function HospitalDetailDrawer({
  open,
  leadId,
  initialLead = null,
  onClose,
  onLeadUpdated,
}) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const isAdmin = Boolean(
    currentUser?.role?.toUpperCase() === 'ADMIN' ||
    (currentUser?.agentRole && currentUser.agentRole.toLowerCase() === 'admin') ||
    currentUser?.username?.toLowerCase() === 'admin'
  );
  const isSalesAgent = Boolean(
    currentUser?.agentRole && currentUser.agentRole.toLowerCase().includes('sales')
  );

  // Main Lead Data State
  const [lead, setLead] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [demos, setDemos] = useState([]);
  const [walkIns, setWalkIns] = useState([]);
  const [salesFollowUps, setSalesFollowUps] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);

  // UI state
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Dialog states
  const [leadActionOpen, setLeadActionOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [callError, setCallError] = useState(null);
  const [callData, setCallData] = useState({
    calledContactId: '',
    calledContactName: '',
    calledContactPhone: '',
    callDate: formatDateToYYYYMMDD(new Date()),
    callTime: formatTimeTo24H(new Date()),
    disposition: '',
    remark: '',
    followUpDate: '',
    followUpTime: '',
    existingSoftwareUsed: 'Unknown',
    softwareName: '',
  });
  const [savingCall, setSavingCall] = useState(false);

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [rescheduleRemark, setRescheduleRemark] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);

  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [demoDate, setDemoDate] = useState('');
  const [demoTime, setDemoTime] = useState('11:00');
  const [demoSalesAgent, setDemoSalesAgent] = useState('');
  const [demoRemarks, setDemoRemarks] = useState('');
  const [demoGoogleMapsUrl, setDemoGoogleMapsUrl] = useState('');
  const [savingDemo, setSavingDemo] = useState(false);

  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [walkInDate, setWalkInDate] = useState('');
  const [walkInTime, setWalkInTime] = useState('11:00');
  const [walkInSalesAgent, setWalkInSalesAgent] = useState('');
  const [walkInRemarks, setWalkInRemarks] = useState('');
  const [savingWalkIn, setSavingWalkIn] = useState(false);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeMode, setCloseMode] = useState('won'); // 'won' | 'lost'
  const [dealValue, setDealValue] = useState('');
  const [product, setProduct] = useState('');
  const [lostReason, setLostReason] = useState('Not Interested');
  const [closingRemark, setClosingRemark] = useState('');
  const [savingClose, setSavingClose] = useState(false);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTargetAgent, setTransferTargetAgent] = useState('');
  const [transferReason, setTransferReason] = useState('Workload rebalancing');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactDesignation, setNewContactDesignation] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactIsPrimary, setNewContactIsPrimary] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgType, setEditOrgType] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLeadSource, setEditLeadSource] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [whatsAppRecipientType, setWhatsAppRecipientType] = useState('contact'); // 'contact' | 'sales_agent'
  const [whatsAppRecipientPhone, setWhatsAppRecipientPhone] = useState('');
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Fetch all lead details
  const fetchLeadDetails = useCallback(
    async (showLoading = true) => {
      if (!leadId) return;
      if (showLoading) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const [leadRes, contactsRes, callsRes, actsRes, demosRes, walkInsRes, salesFuRes] =
          await Promise.allSettled([
            getLead(leadId),
            getLeadContacts(leadId),
            listCallLogs(leadId),
            listActivities(leadId),
            listDemos(leadId),
            listWalkIns(leadId),
            listSalesFollowUps(leadId),
          ]);

        if (leadRes.status === 'fulfilled' && leadRes.value) {
          setLead(leadRes.value);
        } else if (leadRes.status === 'rejected') {
          throw leadRes.reason;
        }

        if (contactsRes.status === 'fulfilled') setContacts(contactsRes.value || []);
        if (callsRes.status === 'fulfilled') setCallLogs(callsRes.value || []);
        if (actsRes.status === 'fulfilled') setActivities(actsRes.value || []);
        if (demosRes.status === 'fulfilled') setDemos(demosRes.value || []);
        if (walkInsRes.status === 'fulfilled') setWalkIns(walkInsRes.value || []);
        if (salesFuRes.status === 'fulfilled') setSalesFollowUps(salesFuRes.value || []);
      } catch (err) {
        console.error('Failed to load lead details in drawer:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load hospital details.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [leadId]
  );

  // Fetch agents list for assignments/transfers
  useEffect(() => {
    if (open) {
      getActiveAgents()
        .then((agents) => setActiveAgents(agents || []))
        .catch(() => {});
    }
  }, [open]);

  // Initial load when opened
  useEffect(() => {
    if (open && leadId) {
      // If initialLead is passed, set it as optimistic data
      if (initialLead) {
        setLead((prev) => (prev?._id === leadId ? prev : initialLead));
      } else {
        setLead(null);
      }
      setCurrentTab(0);
      fetchLeadDetails(true);
    } else {
      setLead(null);
      setContacts([]);
      setCallLogs([]);
      setActivities([]);
      setDemos([]);
      setWalkIns([]);
      setSalesFollowUps([]);
      setError(null);
    }
  }, [open, leadId, initialLead, fetchLeadDetails]);

  // Display object: merges real lead or initialLead
  const currentLead = lead || initialLead;

  // Primary contact
  const primaryContact = useMemo(() => {
    if (currentLead?.primaryContact && typeof currentLead.primaryContact === 'object') {
      return currentLead.primaryContact;
    }
    const found = contacts.find((c) => c.isPrimary);
    if (found) return found;
    if (contacts.length > 0) return contacts[0];
    return null;
  }, [currentLead, contacts]);

  const contactPhone = primaryContact?.phone || currentLead?.phone || '';
  const contactName = primaryContact?.name || currentLead?.contactName || 'Primary Contact';
  const contactDesignation = primaryContact?.designation || '';

  // Copy phone handler
  const handleCopyPhone = (e) => {
    if (e) e.stopPropagation();
    if (!contactPhone) return;
    navigator.clipboard.writeText(contactPhone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // Notify parent of updates
  const notifyUpdated = (updatedLead) => {
    if (onLeadUpdated) onLeadUpdated(updatedLead || currentLead);
    fetchLeadDetails(false);
  };

  // ===================== ACTION HANDLERS =====================

  // 1. Log Call (Exact matching Add Call Log Modal)
  const handleOpenCallDialog = () => {
    setCallError(null);
    const prim = primaryContact || contacts[0];
    const followUpSplit = currentLead?.nextFollowUpAt
      ? splitDateAnd24HTime(currentLead.nextFollowUpAt)
      : { date: '', time: '' };
    setCallData({
      calledContactId: prim?._id || '',
      calledContactName: prim?.name || '',
      calledContactPhone: prim?.phone || contactPhone || '',
      callDate: formatDateToYYYYMMDD(new Date()),
      callTime: formatTimeTo24H(new Date()),
      leadTemperature: currentLead?.leadTemperature || currentLead?.temperature || '',
      disposition: currentLead?.latestDisposition || '',
      remark: '',
      followUpDate: followUpSplit.date || '',
      followUpTime: followUpSplit.time || '',
      existingSoftwareUsed: currentLead?.existingSoftwareUsed || 'Unknown',
      softwareName: currentLead?.softwareName || '',
    });
    setCallLogOpen(true);
  };

  const handleSaveCallLog = async () => {
    setCallError(null);
    if (!callData.calledContactId && !callData.calledContactName) {
      setCallError('Please select or type a contact person');
      return;
    }
    if (!callData.callDate) {
      setCallError('Call Date is required');
      return;
    }
    if (!callData.callTime) {
      setCallError('Call Time is required');
      return;
    }
    if (!callData.disposition) {
      setCallError('Disposition is required');
      return;
    }
    if (!callData.remark) {
      setCallError('Call Remark is required');
      return;
    }
    setSavingCall(true);
    try {
      const calledAt = combineDateAndTime(callData.callDate, callData.callTime) || new Date().toISOString();
      const followUpAt = callData.followUpDate
        ? combineDateAndTime(callData.followUpDate, callData.followUpTime || '10:00')
        : undefined;

      await createCallLog(currentLead._id, {
        calledContactId: callData.calledContactId || undefined,
        calledContactName: callData.calledContactName || undefined,
        calledContactPhone: callData.calledContactPhone || undefined,
        calledAt,
        leadTemperature: callData.leadTemperature || undefined,
        disposition: callData.disposition,
        remark: callData.remark,
        followUpAt,
        existingSoftwareUsed: callData.existingSoftwareUsed || undefined,
        softwareName: callData.softwareName || undefined,
      });
      setCallLogOpen(false);
      notifyUpdated();
    } catch (err) {
      setCallError(err.response?.data?.message || 'Unable to save call log');
    } finally {
      setSavingCall(false);
    }
  };

  // 2. Reschedule Follow-up
  const handleOpenRescheduleDialog = () => {
    const defaultDate = currentLead?.nextFollowUpAt
      ? new Date(currentLead.nextFollowUpAt)
      : new Date(Date.now() + 86400000);
    const split = splitDateAnd24HTime(defaultDate);
    setRescheduleDate(split.date || formatDateToYYYYMMDD(defaultDate));
    setRescheduleTime(split.time || '10:00');
    setRescheduleRemark('');
    setRescheduleDialogOpen(true);
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleDate) return;
    setSavingReschedule(true);
    try {
      await rescheduleFollowUp(currentLead._id, {
        followUpDate: rescheduleDate,
        followUpTime: rescheduleTime || '10:00',
        remarks: rescheduleRemark,
      });
      setRescheduleDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reschedule follow-up');
    } finally {
      setSavingReschedule(false);
    }
  };

  // 3. Complete Follow-up
  const handleCompleteFollowUp = async () => {
    if (!window.confirm('Mark this follow-up as completed?')) return;
    try {
      await completeFollowUp(currentLead._id, { remark: 'Completed from hospital details' });
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to complete follow-up');
    }
  };

  // 4. Schedule Demo
  const handleOpenDemoDialog = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDemoDate(formatDateToYYYYMMDD(tomorrow));
    setDemoTime('11:00');
    // Preselect current sales agent or first sales agent
    const salesAgents = activeAgents.filter(
      (a) => a.agentRole && a.agentRole.toLowerCase().includes('sales')
    );
    setDemoSalesAgent(currentLead?.latestDemo?.salesAgent || salesAgents[0]?._id || '');
    setDemoRemarks('');
    setDemoGoogleMapsUrl(resolveHospitalMapsLink(currentLead) || '');
    setDemoDialogOpen(true);
  };

  const handleSaveDemo = async () => {
    if (!demoDate || !demoSalesAgent) {
      alert('Please select Demo Date and Sales Agent.');
      return;
    }
    setSavingDemo(true);
    try {
      await createDemo(currentLead._id, {
        demoDate,
        demoTime,
        salesAgent: demoSalesAgent,
        remarks: demoRemarks,
        googleMapsUrl: demoGoogleMapsUrl,
      });
      setDemoDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to schedule demo');
    } finally {
      setSavingDemo(false);
    }
  };

  // 5. Record Walk-in
  const handleOpenWalkInDialog = () => {
    setWalkInDate(formatDateToYYYYMMDD(new Date()));
    setWalkInTime('11:00');
    const salesAgents = activeAgents.filter(
      (a) => a.agentRole && a.agentRole.toLowerCase().includes('sales')
    );
    setWalkInSalesAgent(currentLead?.latestWalkIn?.salesAgent || salesAgents[0]?._id || '');
    setWalkInRemarks('');
    setWalkInDialogOpen(true);
  };

  const handleSaveWalkIn = async () => {
    if (!walkInDate || !walkInSalesAgent) {
      alert('Please select Walk-in Date and Sales Agent.');
      return;
    }
    setSavingWalkIn(true);
    try {
      await createWalkIn(currentLead._id, {
        walkInDate,
        walkInTime,
        salesAgent: walkInSalesAgent,
        remark: walkInRemarks,
      });
      setWalkInDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record walk-in');
    } finally {
      setSavingWalkIn(false);
    }
  };

  // 6. Close Won / Lost
  const handleOpenCloseDialog = (mode) => {
    setCloseMode(mode);
    setDealValue('');
    setProduct('TeleCRM Solution');
    setLostReason('Not Interested');
    setClosingRemark('');
    setCloseDialogOpen(true);
  };

  const handleSaveClose = async () => {
    setSavingClose(true);
    try {
      if (closeMode === 'won') {
        await closeWon(currentLead._id, {
          dealValue: Number(dealValue) || 0,
          product,
          remark: closingRemark,
        });
      } else {
        await closeLost(currentLead._id, {
          lostReason,
          remark: closingRemark,
        });
      }
      setCloseDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close lead');
    } finally {
      setSavingClose(false);
    }
  };

  // 7. Reopen Lead
  const handleReopen = async () => {
    if (!window.confirm('Re-engage and reopen this lead?')) return;
    try {
      await reopenLead(currentLead._id, { remarks: 'Reopened from hospital details' });
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reopen lead');
    }
  };

  // 8. Transfer Lead
  const handleOpenTransferDialog = () => {
    setTransferTargetAgent('');
    setTransferReason('Workload rebalancing');
    setTransferRemarks('');
    setTransferDialogOpen(true);
  };

  const handleSaveTransfer = async () => {
    if (!transferTargetAgent) {
      alert('Please select the new agent.');
      return;
    }
    setSavingTransfer(true);
    try {
      await transferLead(currentLead._id, {
        newOwnerId: transferTargetAgent,
        reason: transferReason,
        remarks: transferRemarks,
      });
      setTransferDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to transfer lead');
    } finally {
      setSavingTransfer(false);
    }
  };

  // 9. Edit Basic Details
  const handleOpenEditDialog = () => {
    setEditOrgName(currentLead?.organizationName || '');
    setEditOrgType(currentLead?.organizationType || 'Hospital');
    setEditIndustry(currentLead?.industry || 'Healthcare');
    setEditAddress(currentLead?.address || '');
    setEditLeadSource(currentLead?.leadSource || 'Google');
    setEditRemarks(currentLead?.remarks || '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editOrgName) {
      alert('Hospital name is required.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateLead(currentLead._id, {
        organizationName: editOrgName,
        organizationType: editOrgType,
        industry: editIndustry,
        address: editAddress,
        leadSource: editLeadSource,
        remarks: editRemarks,
      });
      setEditDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update hospital details');
    } finally {
      setSavingEdit(false);
    }
  };

  // 10. Add Contact
  const handleOpenContactDialog = () => {
    setNewContactName('');
    setNewContactDesignation('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactIsPrimary(contacts.length === 0);
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!newContactName || !newContactPhone) {
      alert('Contact Name and Phone are required.');
      return;
    }
    setSavingContact(true);
    try {
      await addContact(currentLead._id, {
        name: newContactName,
        designation: newContactDesignation,
        phone: newContactPhone,
        email: newContactEmail,
        isPrimary: newContactIsPrimary,
      });
      setContactDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add contact');
    } finally {
      setSavingContact(false);
    }
  };

  // 11. WhatsApp
  const handleOpenWhatsAppDialog = (target = 'contact') => {
    setWhatsAppRecipientType(target);
    if (target === 'contact') {
      const norm = normalizeWhatsAppPhone(contactPhone);
      setWhatsAppRecipientPhone(norm.normalized || contactPhone);
      const text = `Hello ${contactName || 'Sir/Madam'},\nGreetings from OrangeVC TeleCRM.\nRegarding ${currentLead?.organizationName || 'your hospital'}...`;
      setWhatsAppMessage(text);
    } else {
      // Sales Agent template
      const template = generateSalesAgentTemplate(currentLead);
      setWhatsAppMessage(template);
      // Try to find sales agent's phone
      const salesAgentId = currentLead?.latestDemo?.salesAgent || currentLead?.latestWalkIn?.salesAgent;
      const agentObj = activeAgents.find((a) => a._id === salesAgentId);
      const norm = normalizeWhatsAppPhone(agentObj?.phone || '');
      setWhatsAppRecipientPhone(norm.normalized || '');
    }
    setWhatsAppDialogOpen(true);
  };

  const handleSendWhatsApp = async () => {
    if (!whatsAppRecipientPhone) {
      alert('Recipient phone number is required for WhatsApp.');
      return;
    }
    setSendingWhatsApp(true);
    try {
      await sendWhatsAppActivity(currentLead._id, {
        phone: whatsAppRecipientPhone,
        message: whatsAppMessage,
        recipientType: whatsAppRecipientType,
      });
      const url = createWhatsAppUrl(whatsAppRecipientPhone, whatsAppMessage);
      window.open(url, '_blank', 'noopener,noreferrer');
      setWhatsAppDialogOpen(false);
      notifyUpdated();
    } catch (err) {
      // If backend fails, still allow opening WhatsApp link
      const url = createWhatsAppUrl(whatsAppRecipientPhone, whatsAppMessage);
      window.open(url, '_blank', 'noopener,noreferrer');
      setWhatsAppDialogOpen(false);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  // Navigate to full page
  const handleNavigateFullPage = () => {
    if (!currentLead?._id) return;
    onClose();
    navigate(`/leads/${currentLead._id}`);
  };

  // Maps link
  const mapsLink = useMemo(() => {
    if (!currentLead) return null;
    return resolveHospitalMapsLink(currentLead);
  }, [currentLead]);

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: '100vw', sm: '92vw', md: 800, lg: 920 },
            maxWidth: '100vw',
            bgcolor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(15, 23, 42, 0.16)',
          },
        }}
      >
        {/* ===================== DRAWER HEADER ===================== */}
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            bgcolor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
            {/* Left: Hospital Name & Badges */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                <Typography
                  variant="h6"
                  fontWeight={800}
                  sx={{
                    color: '#0f172a',
                    fontSize: { xs: 18, sm: 20 },
                    lineHeight: 1.25,
                    wordBreak: 'break-word',
                  }}
                >
                  {currentLead?.organizationName || 'Hospital Details'}
                </Typography>
                {currentLead?.leadNumber && (
                  <Chip
                    label={`#${currentLead.leadNumber}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(234, 88, 12, 0.1)',
                      color: 'primary.main',
                      fontWeight: 800,
                      fontSize: 11,
                      height: 22,
                      border: '1px solid rgba(234, 88, 12, 0.25)',
                    }}
                  />
                )}
                {/* Closure Status */}
                {currentLead?.closureStatus && (
                  <Chip
                    label={currentLead.closureStatus}
                    size="small"
                    color={
                      currentLead.closureStatus === 'WON'
                        ? 'success'
                        : currentLead.closureStatus === 'LOST'
                        ? 'error'
                        : 'primary'
                    }
                    variant={currentLead.closureStatus === 'OPEN' ? 'outlined' : 'filled'}
                    sx={{ fontWeight: 700, fontSize: 11, height: 22 }}
                  />
                )}
                {/* Temperature / Score */}
                {(() => {
                  const rawTemp = currentLead?.leadTemperature;
                  if (!rawTemp) {
                    return (
                      <Chip
                        label="Unclassified"
                        size="small"
                        clickable
                        onClick={() => setLeadActionOpen(true)}
                        title="Click to classify lead temperature"
                        sx={{
                          fontWeight: 600,
                          fontSize: 11,
                          height: 22,
                          bgcolor: '#f1f5f9',
                          color: '#64748b',
                          border: '1px dashed #cbd5e1',
                          cursor: 'pointer',
                          borderRadius: 1.5,
                          '&:hover': {
                            bgcolor: 'rgba(234, 88, 12, 0.08)',
                            borderColor: '#ea580c',
                            color: '#ea580c',
                          },
                        }}
                      />
                    );
                  }
                  const tempVal = rawTemp.toUpperCase();
                  const isHot = tempVal === 'HOT';
                  const isWarm = tempVal === 'WARM';
                  const isCold = tempVal === 'COLD';
                  const label = isHot ? '🔥 Hot' : isWarm ? '🟠 Warm' : isCold ? '❄️ Cold' : rawTemp;
                  return (
                    <Chip
                      label={label}
                      size="small"
                      clickable
                      onClick={() => setLeadActionOpen(true)}
                      title="Click to update classification"
                      sx={{
                        fontWeight: 700,
                        fontSize: 11,
                        height: 22,
                        cursor: 'pointer',
                        bgcolor: isHot ? 'rgba(239, 68, 68, 0.12)' : isWarm ? 'rgba(234, 88, 12, 0.12)' : 'rgba(2, 132, 199, 0.12)',
                        color: isHot ? '#b91c1c' : isWarm ? '#c2410c' : '#0369a1',
                        border: '1px solid',
                        borderColor: isHot ? 'rgba(239, 68, 68, 0.3)' : isWarm ? 'rgba(234, 88, 12, 0.3)' : 'rgba(2, 132, 199, 0.3)',
                      }}
                    />
                  );
                })()}
              </Box>

              {/* Sub-header metadata */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', color: '#64748b', fontSize: 12 }}>
                {contactName && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Person sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ color: '#334155', fontWeight: 600 }}>
                      {contactName} {contactDesignation ? `(${contactDesignation})` : ''}
                    </Typography>
                  </Box>
                )}
                {contactPhone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Phone sx={{ fontSize: 13, color: 'primary.main' }} />
                    <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 600 }}>
                      {contactPhone}
                    </Typography>
                    <Tooltip title={copiedPhone ? 'Copied!' : 'Copy phone'}>
                      <IconButton size="small" onClick={handleCopyPhone} sx={{ p: 0.25 }}>
                        {copiedPhone ? (
                          <CheckIcon sx={{ fontSize: 12, color: '#10b981' }} />
                        ) : (
                          <ContentCopy sx={{ fontSize: 12 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {currentLead?.address && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LocationOn sx={{ fontSize: 14, color: '#ef4444' }} />
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#64748b',
                        maxWidth: { xs: 200, sm: 350 },
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {currentLead.address}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Right: Quick Action Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {contactPhone && (
                <Tooltip title="Call Primary Contact">
                  <IconButton
                    component="a"
                    href={`tel:${contactPhone}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(2, 132, 199, 0.1)',
                      color: '#0284c7',
                      '&:hover': { bgcolor: 'rgba(2, 132, 199, 0.2)' },
                    }}
                  >
                    <PhoneInTalk sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              {contactPhone && (
                <Tooltip title="WhatsApp Message">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenWhatsAppDialog('contact')}
                    sx={{
                      bgcolor: 'rgba(37, 211, 102, 0.12)',
                      color: '#15803d',
                      '&:hover': { bgcolor: 'rgba(37, 211, 102, 0.22)' },
                    }}
                  >
                    <WhatsAppIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Refresh Details">
                <IconButton
                  size="small"
                  onClick={() => fetchLeadDetails(false)}
                  disabled={refreshing}
                  sx={{ color: '#64748b' }}
                >
                  <Refresh sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open in Full Standalone Page">
                <IconButton
                  size="small"
                  onClick={handleNavigateFullPage}
                  sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 1.5,
                    color: '#64748b',
                    '&:hover': { bgcolor: '#f1f5f9', color: 'primary.main' },
                  }}
                >
                  <OpenInNew sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={onClose} sx={{ color: '#64748b' }}>
                <Close sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Navigation Tabs */}
          <Tabs
            value={currentTab}
            onChange={(e, val) => setCurrentTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mt: 1.5,
              minHeight: 40,
              borderBottom: '1px solid #f1f5f9',
              '& .MuiTab-root': {
                minHeight: 40,
                py: 0.75,
                px: 2,
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'none',
                color: '#64748b',
                '&.Mui-selected': {
                  color: 'primary.main',
                  fontWeight: 700,
                },
              },
            }}
          >
            <Tab label="Overview & Profile" />
            <Tab label={`Calls & Follow-ups (${callLogs.length})`} />
            <Tab label={`Demos & Walk-ins (${demos.length + walkIns.length})`} />
            <Tab label={`Timeline & Notes (${activities.length})`} />
          </Tabs>
        </Box>

        {/* ===================== DRAWER BODY ===================== */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 2.5 }, bgcolor: '#f8fafc' }}>
          {loading && !currentLead ? (
            <Stack spacing={2} sx={{ py: 3 }}>
              <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2.5 }} />
              <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2.5 }} />
              <Skeleton variant="rounded" height={140} sx={{ borderRadius: 2.5 }} />
            </Stack>
          ) : error && !currentLead ? (
            <Alert severity="error" sx={{ my: 3, borderRadius: 2 }} action={<Button color="inherit" size="small" onClick={() => fetchLeadDetails(true)}>Retry</Button>}>
              {error}
            </Alert>
          ) : (
            <>
              {/* ==================== TAB 0: OVERVIEW ==================== */}
              {currentTab === 0 && (
                <Stack spacing={2.5}>
                  {/* Next Action Banner */}
                  {(currentLead?.nextFollowUpAt || currentLead?.latestDemo?.demoDate || currentLead?.latestWalkIn?.walkInDate) && (
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        bgcolor: '#ffffff',
                        border: '1px solid #e0f2fe',
                        borderLeft: '4px solid #0284c7',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                      }}
                    >
                      <Box>
                        <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Next Scheduled Action
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                          <Schedule sx={{ fontSize: 18, color: '#0284c7' }} />
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                            {currentLead?.nextFollowUpAt
                              ? `Follow-up: ${formatDateTime(currentLead.nextFollowUpAt)}`
                              : currentLead?.latestDemo?.demoDate
                              ? `Demo: ${formatDate(currentLead.latestDemo.demoDate)} ${currentLead.latestDemo.demoTime || ''}`
                              : `Walk-in: ${formatDate(currentLead.latestWalkIn.walkInDate)} ${currentLead.latestWalkIn.walkInTime || ''}`}
                          </Typography>
                        </Box>
                        {currentLead?.latestRemark && (
                          <Typography variant="caption" sx={{ color: '#475569', fontStyle: 'italic', display: 'block', mt: 0.25 }}>
                            "{currentLead.latestRemark}"
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleOpenCallDialog}
                          startIcon={<PhoneInTalk sx={{ fontSize: 15 }} />}
                          sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 2 }}
                        >
                          Log Call
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={handleOpenRescheduleDialog}
                          sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 2 }}
                        >
                          Reschedule
                        </Button>
                        {currentLead?.nextFollowUpAt && (
                          <Button
                            variant="outlined"
                            color="success"
                            size="small"
                            onClick={handleCompleteFollowUp}
                            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 2 }}
                          >
                            Mark Done
                          </Button>
                        )}
                      </Box>
                    </Paper>
                  )}

                  {/* Grid of details */}
                  <Grid container spacing={2}>
                    {/* 1. Contact Information Card */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          height: '100%',
                          borderRadius: 2.5,
                          border: '1px solid #e2e8f0',
                          bgcolor: '#ffffff',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person sx={{ fontSize: 18, color: 'primary.main' }} />
                            Contact Person(s)
                          </Typography>
                          <Button
                            size="small"
                            onClick={handleOpenContactDialog}
                            startIcon={<PersonAdd sx={{ fontSize: 14 }} />}
                            sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, py: 0.2 }}
                          >
                            Add Contact
                          </Button>
                        </Box>

                        <Stack spacing={1.25}>
                          <Box sx={{ bgcolor: '#f8fafc', p: 1.25, borderRadius: 2, border: '1px solid #f1f5f9' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                                {contactName}
                              </Typography>
                              <Chip label="Primary" size="small" color="primary" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                            </Box>
                            {contactDesignation && (
                              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                {contactDesignation}
                              </Typography>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                                {contactPhone || 'No phone number'}
                              </Typography>
                              {contactPhone && (
                                <Tooltip title={copiedPhone ? 'Copied!' : 'Copy phone'}>
                                  <IconButton size="small" onClick={handleCopyPhone} sx={{ p: 0.25 }}>
                                    {copiedPhone ? <CheckIcon sx={{ fontSize: 12, color: '#10b981' }} /> : <ContentCopy sx={{ fontSize: 12 }} />}
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                            {primaryContact?.email && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                <Email sx={{ fontSize: 13, color: '#64748b' }} />
                                <Typography
                                  component="a"
                                  href={`mailto:${primaryContact.email}`}
                                  variant="caption"
                                  sx={{ color: 'primary.main', textDecoration: 'none' }}
                                >
                                  {primaryContact.email}
                                </Typography>
                              </Box>
                            )}
                            {primaryContact?.altPhone && (
                              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.5 }}>
                                Alt: {primaryContact.altPhone}
                              </Typography>
                            )}
                          </Box>

                          {/* Secondary Contacts */}
                          {contacts
                            .filter((c) => !c.isPrimary && c._id !== primaryContact?._id)
                            .map((c) => (
                              <Box key={c._id} sx={{ p: 1, borderRadius: 1.5, border: '1px solid #f1f5f9', bgcolor: '#ffffff' }}>
                                <Typography variant="caption" fontWeight={700} sx={{ color: '#0f172a' }}>
                                  {c.name} {c.designation ? `(${c.designation})` : ''}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: '#475569' }}>
                                  📞 {c.phone} {c.email ? `• ✉️ ${c.email}` : ''}
                                </Typography>
                              </Box>
                            ))}
                        </Stack>
                      </Paper>
                    </Grid>

                    {/* 2. Hospital & Location Card */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          height: '100%',
                          borderRadius: 2.5,
                          border: '1px solid #e2e8f0',
                          bgcolor: '#ffffff',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LocationOn sx={{ fontSize: 18, color: '#ef4444' }} />
                            Location & Organization
                          </Typography>
                          <Button
                            size="small"
                            onClick={handleOpenEditDialog}
                            startIcon={<Edit sx={{ fontSize: 13 }} />}
                            sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, py: 0.2 }}
                          >
                            Edit Info
                          </Button>
                        </Box>

                        <Stack spacing={1.25}>
                          <Box>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Complete Address</Typography>
                            <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                              {currentLead?.address || 'Address not recorded'}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', gap: 2 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Type</Typography>
                              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                                {currentLead?.organizationType || 'Hospital'}
                              </Typography>
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Industry</Typography>
                              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                                {currentLead?.industry || 'Healthcare'}
                              </Typography>
                            </Box>
                          </Box>

                          {/* Coordinates / Map Link */}
                          <Box sx={{ pt: 0.5 }}>
                            {mapsLink ? (
                              <Button
                                component="a"
                                href={mapsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="outlined"
                                size="small"
                                startIcon={<Launch sx={{ fontSize: 14 }} />}
                                sx={{ textTransform: 'none', fontSize: 11, borderRadius: 2 }}
                              >
                                View on Google Maps
                              </Button>
                            ) : (
                              <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                Maps link not available (no coordinates or address recorded)
                              </Typography>
                            )}
                          </Box>

                          {/* Verification status if available */}
                          {currentLead?.createdLocation?.geofenceStatus && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5 }}>
                              <GpsFixed sx={{ fontSize: 14, color: '#10b981' }} />
                              <Typography variant="caption" sx={{ color: '#475569' }}>
                                Geofence: <strong>{currentLead.createdLocation.geofenceStatus}</strong>
                                {currentLead.createdLocation.distanceMetres != null && ` (${currentLead.createdLocation.distanceMetres}m)`}
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    </Grid>

                    {/* 3. CRM Assignment & Ownership Card */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          height: '100%',
                          borderRadius: 2.5,
                          border: '1px solid #e2e8f0',
                          bgcolor: '#ffffff',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AssignmentInd sx={{ fontSize: 18, color: '#8b5cf6' }} />
                            Assignment & Ownership
                          </Typography>
                          <Button
                            size="small"
                            onClick={handleOpenTransferDialog}
                            startIcon={<SwapHoriz sx={{ fontSize: 14 }} />}
                            sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, py: 0.2 }}
                          >
                            Transfer
                          </Button>
                        </Box>

                        <Stack spacing={1.25}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Assigned Calling Agent</Typography>
                            <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                              {currentLead?.currentOwnerName || currentLead?.currentOwner?.fullName || currentLead?.currentOwner?.username || 'Unassigned'}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Assigned Sales Agent</Typography>
                            <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                              {currentLead?.latestDemo?.salesAgentName ||
                                currentLead?.latestWalkIn?.salesAgentName ||
                                currentLead?.latestSalesFollowUp?.salesAgentName ||
                                'Not Assigned'}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Lead Source</Typography>
                            <Chip label={currentLead?.leadSource || 'Manual'} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 600 }} />
                          </Box>

                          {currentLead?.sourceRemarks && (
                            <Box>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Source Remarks</Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: '#334155', fontStyle: 'italic' }}>
                                "{currentLead.sourceRemarks}"
                              </Typography>
                            </Box>
                          )}

                          <Divider sx={{ my: 0.5 }} />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Created By</Typography>
                            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 600 }}>
                              {currentLead?.createdByName || currentLead?.createdBy?.fullName || 'System'} • {formatDate(currentLead?.createdAt)}
                            </Typography>
                          </Box>

                          {currentLead?.updatedAt && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Last Updated</Typography>
                              <Typography variant="caption" sx={{ color: '#334155' }}>
                                {formatDateTime(currentLead.updatedAt)}
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    </Grid>

                    {/* 4. Commercial, Software & Outcome Card */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          height: '100%',
                          borderRadius: 2.5,
                          border: '1px solid #e2e8f0',
                          bgcolor: '#ffffff',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EmojiEvents sx={{ fontSize: 18, color: '#f59e0b' }} />
                            Commercial & Status
                          </Typography>
                          {currentLead?.closureStatus === 'OPEN' ? (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Button
                                size="small"
                                color="success"
                                onClick={() => handleOpenCloseDialog('won')}
                                sx={{ textTransform: 'none', fontSize: 11, fontWeight: 700, py: 0.2 }}
                              >
                                Won
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={() => handleOpenCloseDialog('lost')}
                                sx={{ textTransform: 'none', fontSize: 11, fontWeight: 700, py: 0.2 }}
                              >
                                Lost
                              </Button>
                            </Box>
                          ) : (
                            <Button
                              size="small"
                              onClick={handleReopen}
                              sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, py: 0.2 }}
                            >
                              Reopen
                            </Button>
                          )}
                        </Box>

                        <Stack spacing={1.25}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Lead Status</Typography>
                            <Chip
                              label={currentLead?.closureStatus || 'OPEN'}
                              size="small"
                              color={
                                currentLead?.closureStatus === 'WON'
                                  ? 'success'
                                  : currentLead?.closureStatus === 'LOST'
                                  ? 'error'
                                  : 'primary'
                              }
                              sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                            />
                          </Box>

                          {currentLead?.closureStatus === 'WON' && (
                            <>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#64748b' }}>Deal Value</Typography>
                                <Typography variant="body2" fontWeight={700} sx={{ color: '#059669' }}>
                                  ₹{Number(currentLead.dealValue || 0).toLocaleString('en-IN')}
                                </Typography>
                              </Box>
                              {currentLead.product && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="caption" sx={{ color: '#64748b' }}>Product</Typography>
                                  <Typography variant="caption" fontWeight={600} sx={{ color: '#0f172a' }}>
                                    {currentLead.product}
                                  </Typography>
                                </Box>
                              )}
                            </>
                          )}

                          {currentLead?.closureStatus === 'LOST' && currentLead.lostReason && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Lost Reason</Typography>
                              <Typography variant="caption" fontWeight={700} sx={{ color: '#dc2626' }}>
                                {currentLead.lostReason}
                              </Typography>
                            </Box>
                          )}

                          {currentLead?.closingRemark && (
                            <Box>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Closure Remark</Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: '#475569', fontStyle: 'italic' }}>
                                "{currentLead.closingRemark}"
                              </Typography>
                            </Box>
                          )}

                          <Divider sx={{ my: 0.5 }} />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Software Currently Used</Typography>
                            <Typography variant="caption" fontWeight={600} sx={{ color: '#0f172a' }}>
                              {currentLead?.existingSoftwareUsed || 'Unknown'} {currentLead?.softwareName ? `(${currentLead.softwareName})` : ''}
                            </Typography>
                          </Box>

                          {currentLead?.remarks && (
                            <Box>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>Initial Remarks</Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: '#334155' }}>
                                {currentLead.remarks}
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    </Grid>
                  </Grid>
                </Stack>
              )}

              {/* ==================== TAB 1: CALLS & FOLLOW-UPS ==================== */}
              {currentTab === 1 && (
                <Stack spacing={2.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a' }}>
                      Call Logs & Follow-up History
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleOpenCallDialog}
                      startIcon={<PhoneInTalk sx={{ fontSize: 15 }} />}
                      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                    >
                      Log New Call
                    </Button>
                  </Box>

                  {callLogs.length === 0 ? (
                    <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 2.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <PhoneInTalk sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                      <Typography variant="body1" fontWeight={600} sx={{ color: '#0f172a' }}>
                        No call logs recorded yet
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        Click below to record your first call log and discussion note.
                      </Typography>
                      <Button variant="outlined" size="small" onClick={handleOpenCallDialog} sx={{ textTransform: 'none', borderRadius: 2 }}>
                        Log First Call
                      </Button>
                    </Paper>
                  ) : (
                    <Stack spacing={1.5}>
                      {callLogs.map((log) => {
                        const style = getDispositionStyle(log.disposition);
                        return (
                          <Paper
                            key={log._id}
                            elevation={0}
                            sx={{
                              p: 2,
                              borderRadius: 2.5,
                              border: '1px solid #e2e8f0',
                              bgcolor: '#ffffff',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={log.disposition || 'Call'}
                                  size="small"
                                  sx={{
                                    bgcolor: style.bg,
                                    color: style.color,
                                    border: `1px solid ${style.border}`,
                                    fontWeight: 700,
                                    fontSize: 11,
                                    height: 22,
                                  }}
                                />
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                  Called by <strong>{log.user?.fullName || log.user?.username || 'Agent'}</strong>
                                </Typography>
                              </Box>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                {formatDateTime(log.calledAt || log.createdAt)}
                              </Typography>
                            </Box>

                            {log.remark ? (
                              <Box sx={{ bgcolor: '#f8fafc', p: 1.25, borderRadius: 2, border: '1px dashed #cbd5e1', my: 1 }}>
                                <Typography variant="caption" sx={{ color: '#334155', fontStyle: 'italic', lineHeight: 1.4 }}>
                                  "{log.remark}"
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                No discussion remark entered
                              </Typography>
                            )}

                            {log.nextFollowUpAt && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
                                <Schedule sx={{ fontSize: 14, color: '#0284c7' }} />
                                <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 600 }}>
                                  Next follow-up set for: {formatDateTime(log.nextFollowUpAt)}
                                </Typography>
                              </Box>
                            )}
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              )}

              {/* ==================== TAB 2: DEMOS & WALK-INS ==================== */}
              {currentTab === 2 && (
                <Stack spacing={3}>
                  {/* Product Demos */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LaptopMac sx={{ fontSize: 20, color: '#6366f1' }} />
                        Product Demos ({demos.length})
                      </Typography>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleOpenDemoDialog}
                        startIcon={<LaptopMac sx={{ fontSize: 15 }} />}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                      >
                        Schedule Demo
                      </Button>
                    </Box>

                    {demos.length === 0 ? (
                      <Paper elevation={0} sx={{ p: 3, textAlign: 'center', borderRadius: 2.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography variant="body2" color="text.secondary">
                          No product demos scheduled for this hospital.
                        </Typography>
                      </Paper>
                    ) : (
                      <Stack spacing={1.5}>
                        {demos.map((d) => (
                          <Paper key={d._id} elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={d.status || 'Planned'}
                                  size="small"
                                  color={d.status === 'Done' ? 'success' : d.status === 'Not Done' ? 'error' : 'primary'}
                                  sx={{ fontWeight: 700, fontSize: 11, height: 22 }}
                                />
                                <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                                  {formatDate(d.demoDate)} {d.demoTime ? `at ${d.demoTime}` : ''}
                                </Typography>
                              </Box>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                Sales Agent: <strong>{d.salesAgentName || d.salesAgent?.fullName || 'Unassigned'}</strong>
                              </Typography>
                            </Box>
                            {d.remarks && (
                              <Typography variant="caption" sx={{ color: '#334155', fontStyle: 'italic', display: 'block', mb: 0.5 }}>
                                Remarks: "{d.remarks}"
                              </Typography>
                            )}
                            {d.googleMapsUrl && (
                              <Button
                                component="a"
                                href={d.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="small"
                                startIcon={<Launch sx={{ fontSize: 12 }} />}
                                sx={{ textTransform: 'none', fontSize: 11, p: 0 }}
                              >
                                Open Maps Link
                              </Button>
                            )}
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  {/* Customer Walk-ins */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DirectionsWalk sx={{ fontSize: 20, color: '#059669' }} />
                        Customer Walk-ins & Visits ({walkIns.length})
                      </Typography>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleOpenWalkInDialog}
                        startIcon={<DirectionsWalk sx={{ fontSize: 15 }} />}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                      >
                        Record Walk-in
                      </Button>
                    </Box>

                    {walkIns.length === 0 ? (
                      <Paper elevation={0} sx={{ p: 3, textAlign: 'center', borderRadius: 2.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography variant="body2" color="text.secondary">
                          No walk-ins or field visits recorded for this hospital.
                        </Typography>
                      </Paper>
                    ) : (
                      <Stack spacing={1.5}>
                        {walkIns.map((w) => (
                          <Paper key={w._id} elevation={0} sx={{ p: 2, borderRadius: 2.5, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={w.status || 'Planned'}
                                  size="small"
                                  color={w.status === 'Completed' || w.status === 'Done' ? 'success' : w.status === 'Not Done' ? 'error' : 'primary'}
                                  sx={{ fontWeight: 700, fontSize: 11, height: 22 }}
                                />
                                <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                                  {formatDate(w.walkInDate)} {w.walkInTime ? `at ${w.walkInTime}` : ''}
                                </Typography>
                              </Box>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                Agent: <strong>{w.salesAgentName || w.salesAgent?.fullName || 'Unassigned'}</strong>
                              </Typography>
                            </Box>
                            {w.remark && (
                              <Typography variant="caption" sx={{ color: '#334155', fontStyle: 'italic', display: 'block', mb: 0.5 }}>
                                Remarks: "{w.remark}"
                              </Typography>
                            )}
                            {w.geofenceStatus && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <GpsFixed sx={{ fontSize: 13, color: '#10b981' }} />
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                  Geofence: <strong>{w.geofenceStatus}</strong> {w.distanceMetres != null && `(${w.distanceMetres}m away)`}
                                </Typography>
                              </Box>
                            )}
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </Stack>
              )}

              {/* ==================== TAB 3: TIMELINE & NOTES ==================== */}
              {currentTab === 3 && (
                <Stack spacing={2}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a' }}>
                    Activity Timeline & Audit Trail
                  </Typography>

                  {activities.length === 0 ? (
                    <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 2.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <History sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        No activity records found yet.
                      </Typography>
                    </Paper>
                  ) : (
                    <Stack spacing={1.5}>
                      {activities.map((act) => (
                        <Paper
                          key={act._id}
                          elevation={0}
                          sx={{
                            p: 1.75,
                            borderRadius: 2,
                            border: '1px solid #e2e8f0',
                            bgcolor: '#ffffff',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1.5,
                          }}
                        >
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              fontSize: 14,
                              bgcolor:
                                act.action?.includes('Call')
                                  ? 'rgba(2, 132, 199, 0.1)'
                                  : act.action?.includes('Demo')
                                  ? 'rgba(99, 102, 241, 0.1)'
                                  : act.action?.includes('Walk-in')
                                  ? 'rgba(5, 150, 105, 0.1)'
                                  : act.action?.includes('WhatsApp')
                                  ? 'rgba(37, 211, 102, 0.12)'
                                  : 'rgba(234, 88, 12, 0.1)',
                              color:
                                act.action?.includes('Call')
                                  ? '#0284c7'
                                  : act.action?.includes('Demo')
                                  ? '#6366f1'
                                  : act.action?.includes('Walk-in')
                                  ? '#059669'
                                  : act.action?.includes('WhatsApp')
                                  ? '#15803d'
                                  : 'primary.main',
                            }}
                          >
                            {act.action?.includes('Call') ? (
                              <PhoneInTalk sx={{ fontSize: 16 }} />
                            ) : act.action?.includes('Demo') ? (
                              <LaptopMac sx={{ fontSize: 16 }} />
                            ) : act.action?.includes('Walk-in') ? (
                              <DirectionsWalk sx={{ fontSize: 16 }} />
                            ) : act.action?.includes('WhatsApp') ? (
                              <WhatsAppIcon sx={{ fontSize: 16 }} />
                            ) : (
                              <Star sx={{ fontSize: 16 }} />
                            )}
                          </Avatar>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a' }}>
                                {act.action}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                {formatDateTime(act.createdAt)}
                              </Typography>
                            </Box>
                            {act.details && (
                              <Typography variant="caption" sx={{ color: '#475569', display: 'block', mt: 0.25 }}>
                                {act.details}
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.5 }}>
                              By: <strong>{act.performedBy?.fullName || act.performedBy?.username || 'System'}</strong> {act.role ? `(${act.role})` : ''}
                            </Typography>
                          </Box>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
            </>
          )}
        </Box>

        {/* ===================== STICKY FOOTER ACTIONS ===================== */}
        <Box
          sx={{
            p: 1.5,
            px: { xs: 2, sm: 2.5 },
            borderTop: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleOpenCallDialog}
              startIcon={<PhoneInTalk sx={{ fontSize: 15 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Log Call
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handleOpenWhatsAppDialog('contact')}
              startIcon={<WhatsAppIcon sx={{ fontSize: 15 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 12, color: '#15803d', borderColor: '#86efac', '&:hover': { bgcolor: '#f0fdf4' } }}
            >
              WhatsApp
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenRescheduleDialog}
              startIcon={<Schedule sx={{ fontSize: 15 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Follow-up
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenDemoDialog}
              startIcon={<LaptopMac sx={{ fontSize: 15 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 12, color: '#6366f1', borderColor: '#c7d2fe', '&:hover': { bgcolor: '#eef2ff' } }}
            >
              Demo
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenWalkInDialog}
              startIcon={<DirectionsWalk sx={{ fontSize: 15 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: 12, color: '#059669', borderColor: '#a7f3d0', '&:hover': { bgcolor: '#ecfdf5' } }}
            >
              Walk-in
            </Button>
          </Box>

          <Button
            variant="text"
            size="small"
            onClick={onClose}
            sx={{ textTransform: 'none', color: '#64748b', fontWeight: 600 }}
          >
            Close
          </Button>
        </Box>
      </Drawer>

      {/* ===================== EXACT MATCH: ADD CALL LOG DIALOG ===================== */}
      <Dialog
        open={callLogOpen}
        onClose={() => !savingCall && setCallLogOpen(false)}
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
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 2,
          }}
        >
          <Phone sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Add Call Log
          </Typography>
          <IconButton
            sx={{ ml: 'auto', color: 'text.secondary' }}
            onClick={() => setCallLogOpen(false)}
            disabled={savingCall}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {callError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {callError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* 1. Contact Person Called */}
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
                    setCallData((p) => ({
                      ...p,
                      calledContactId: '',
                      calledContactName: '',
                      calledContactPhone: '',
                    }));
                  } else if (typeof newValue === 'string') {
                    const matched = contacts.find(
                      (c) => c.name.toLowerCase() === newValue.toLowerCase()
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
                        calledContactName: newValue,
                      }));
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
                        `${c.name}${c.isPrimary ? ' (Primary)' : ''} - ${c.phone}`.toLowerCase() ===
                          newInputValue.toLowerCase()
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
                          <Chip
                            label="Primary"
                            size="small"
                            color="primary"
                            sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                          />
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
                  onChange={(e) =>
                    setCallData((p) => ({ ...p, calledContactPhone: e.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            )}

            {/* Row 1: Left = Call Date, Right = Call Time */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Call Date *"
                type="date"
                value={callData.callDate}
                onChange={(e) => setCallData((p) => ({ ...p, callDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Call Time (24-hour) *"
                type="time"
                value={callData.callTime}
                onChange={(e) => setCallData((p) => ({ ...p, callTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                helperText="24-hour format (e.g. 14:30)"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            {/* Row 2: Left = Disposition, Right = Lead Temperature */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required size="small">
                <InputLabel>Disposition *</InputLabel>
                <Select
                  value={callData.disposition}
                  label="Disposition *"
                  onChange={(e) => setCallData((p) => ({ ...p, disposition: e.target.value }))}
                  sx={{ borderRadius: 2 }}
                >
                  {CALL_DISPOSITIONS.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Lead Temperature</InputLabel>
                <Select
                  value={callData.leadTemperature || ''}
                  label="Lead Temperature"
                  onChange={(e) => setCallData((p) => ({ ...p, leadTemperature: e.target.value }))}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value=""><em>No change ({currentLead?.leadTemperature || 'Unclassified'})</em></MenuItem>
                  <MenuItem value="Hot">🔥 Hot</MenuItem>
                  <MenuItem value="Warm">🟠 Warm</MenuItem>
                  <MenuItem value="Cold">❄️ Cold</MenuItem>
                </Select>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 11 }}>
                  Current: <strong>{currentLead?.leadTemperature ? (currentLead.leadTemperature.toUpperCase() === 'HOT' ? '🔥 Hot' : currentLead.leadTemperature.toUpperCase() === 'WARM' ? '🟠 Warm' : '❄️ Cold') : 'Unclassified'}</strong>
                </Typography>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Existing Software</InputLabel>
                <Select
                  value={callData.existingSoftwareUsed}
                  label="Existing Software"
                  onChange={(e) =>
                    setCallData((p) => ({ ...p, existingSoftwareUsed: e.target.value }))
                  }
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">
                    <em>No change</em>
                  </MenuItem>
                  {SOFTWARE_OPTIONS.map((o) => (
                    <MenuItem key={o} value={o}>
                      {o}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Software Name if Yes */}
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

            {/* Row 3: Call Remark (full width) */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Call Remark *"
                multiline
                rows={3}
                placeholder="Call Remark *"
                value={callData.remark}
                onChange={(e) => setCallData((p) => ({ ...p, remark: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            {/* Row 4: Next Follow-up Date & Next Follow-up Time */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Next Follow-up Date"
                type="date"
                value={callData.followUpDate}
                onChange={(e) => setCallData((p) => ({ ...p, followUpDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: formatDateToYYYYMMDD(new Date()) }}
                helperText="Schedule next follow-up date"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Next Follow-up Time (24-hour)"
                type="time"
                value={callData.followUpTime}
                onChange={(e) => setCallData((p) => ({ ...p, followUpTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                helperText="24-hour format (e.g. 14:30)"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            onClick={() => setCallLogOpen(false)}
            disabled={savingCall}
            sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCallLog}
            disabled={savingCall}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            {savingCall ? <CircularProgress size={20} color="inherit" /> : 'Save Call Log'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: RESCHEDULE FOLLOW-UP ===================== */}
      <Dialog open={rescheduleDialogOpen} onClose={() => !savingReschedule && setRescheduleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Schedule sx={{ color: 'primary.main' }} />
          Schedule / Reschedule Follow-up
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Follow-up Date"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Follow-up Time"
                  type="time"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </Grid>
            </Grid>
            <TextField
              label="Reason / Notes for Follow-up"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={rescheduleRemark}
              onChange={(e) => setRescheduleRemark(e.target.value)}
              placeholder="e.g. Client asked to call back after 4 PM"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRescheduleDialogOpen(false)} disabled={savingReschedule}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveReschedule} disabled={savingReschedule}>
            {savingReschedule ? <CircularProgress size={20} /> : 'Save Follow-up'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: SCHEDULE DEMO ===================== */}
      <Dialog open={demoDialogOpen} onClose={() => !savingDemo && setDemoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LaptopMac sx={{ color: '#6366f1' }} />
          Schedule Product Demo — {currentLead?.organizationName}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Assigned Sales Agent</InputLabel>
              <Select
                value={demoSalesAgent}
                label="Assigned Sales Agent"
                onChange={(e) => setDemoSalesAgent(e.target.value)}
              >
                {activeAgents.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.fullName || a.username} ({a.agentRole || 'Agent'})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Demo Date"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={demoDate}
                  onChange={(e) => setDemoDate(e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Demo Time"
                  type="time"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={demoTime}
                  onChange={(e) => setDemoTime(e.target.value)}
                />
              </Grid>
            </Grid>

            <TextField
              label="Google Maps Location URL (Optional)"
              size="small"
              fullWidth
              value={demoGoogleMapsUrl}
              onChange={(e) => setDemoGoogleMapsUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
            />

            <TextField
              label="Demo Agenda & Special Instructions"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={demoRemarks}
              onChange={(e) => setDemoRemarks(e.target.value)}
              placeholder="Doctor preferences, specific modules to showcase, etc."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDemoDialogOpen(false)} disabled={savingDemo}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDemo} disabled={savingDemo} sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
            {savingDemo ? <CircularProgress size={20} /> : 'Schedule Demo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: RECORD WALK-IN ===================== */}
      <Dialog open={walkInDialogOpen} onClose={() => !savingWalkIn && setWalkInDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <DirectionsWalk sx={{ color: '#059669' }} />
          Record Customer Walk-in / Field Visit
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Sales Agent</InputLabel>
              <Select
                value={walkInSalesAgent}
                label="Sales Agent"
                onChange={(e) => setWalkInSalesAgent(e.target.value)}
              >
                {activeAgents.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.fullName || a.username} ({a.agentRole || 'Agent'})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Walk-in Date"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={walkInDate}
                  onChange={(e) => setWalkInDate(e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Walk-in Time"
                  type="time"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={walkInTime}
                  onChange={(e) => setWalkInTime(e.target.value)}
                />
              </Grid>
            </Grid>

            <TextField
              label="Visit Discussion & Remarks"
              multiline
              rows={3}
              fullWidth
              size="small"
              value={walkInRemarks}
              onChange={(e) => setWalkInRemarks(e.target.value)}
              placeholder="Who did you meet? What were the key points discussed?"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setWalkInDialogOpen(false)} disabled={savingWalkIn}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveWalkIn} disabled={savingWalkIn} sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}>
            {savingWalkIn ? <CircularProgress size={20} /> : 'Save Walk-in'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: CLOSE WON / LOST ===================== */}
      <Dialog open={closeDialogOpen} onClose={() => !savingClose && setCloseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          {closeMode === 'won' ? <EmojiEvents sx={{ color: '#059669' }} /> : <Cancel sx={{ color: '#dc2626' }} />}
          Close Lead as {closeMode === 'won' ? 'Won' : 'Lost'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {closeMode === 'won' ? (
              <>
                <TextField
                  label="Deal Value (₹)"
                  type="number"
                  fullWidth
                  size="small"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="e.g. 50000"
                />
                <TextField
                  label="Product / Plan"
                  fullWidth
                  size="small"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. TeleCRM Hospital Suite"
                />
              </>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel>Lost Reason</InputLabel>
                <Select
                  value={lostReason}
                  label="Lost Reason"
                  onChange={(e) => setLostReason(e.target.value)}
                >
                  {LOST_REASONS.map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Closing Remarks"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={closingRemark}
              onChange={(e) => setClosingRemark(e.target.value)}
              placeholder="Final remarks for this outcome"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCloseDialogOpen(false)} disabled={savingClose}>Cancel</Button>
          <Button
            variant="contained"
            color={closeMode === 'won' ? 'success' : 'error'}
            onClick={handleSaveClose}
            disabled={savingClose}
          >
            {savingClose ? <CircularProgress size={20} /> : `Confirm ${closeMode === 'won' ? 'Won' : 'Lost'}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: TRANSFER LEAD ===================== */}
      <Dialog open={transferDialogOpen} onClose={() => !savingTransfer && setTransferDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapHoriz sx={{ color: '#8b5cf6' }} />
          Transfer Lead Ownership
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Target Agent</InputLabel>
              <Select
                value={transferTargetAgent}
                label="Target Agent"
                onChange={(e) => setTransferTargetAgent(e.target.value)}
              >
                {activeAgents
                  .filter((a) => a._id !== currentLead?.currentOwner?._id && a._id !== currentLead?.currentOwner)
                  .map((a) => (
                    <MenuItem key={a._id} value={a._id}>
                      {a.fullName || a.username} ({a.agentRole || 'Agent'})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField
              label="Reason for Transfer"
              size="small"
              fullWidth
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            />

            <TextField
              label="Transfer Remarks (Optional)"
              multiline
              rows={2}
              size="small"
              fullWidth
              value={transferRemarks}
              onChange={(e) => setTransferRemarks(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTransferDialogOpen(false)} disabled={savingTransfer}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTransfer} disabled={savingTransfer} sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' } }}>
            {savingTransfer ? <CircularProgress size={20} /> : 'Transfer Lead'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: EDIT LEAD INFO ===================== */}
      <Dialog open={editDialogOpen} onClose={() => !savingEdit && setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit sx={{ color: 'primary.main' }} />
          Edit Hospital Information
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Hospital / Organization Name *"
              size="small"
              fullWidth
              value={editOrgName}
              onChange={(e) => setEditOrgName(e.target.value)}
            />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={editOrgType}
                    label="Type"
                    onChange={(e) => setEditOrgType(e.target.value)}
                  >
                    {ORGANIZATION_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Industry</InputLabel>
                  <Select
                    value={editIndustry}
                    label="Industry"
                    onChange={(e) => setEditIndustry(e.target.value)}
                  >
                    {INDUSTRIES.map((ind) => (
                      <MenuItem key={ind} value={ind}>{ind}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              label="Full Address"
              size="small"
              multiline
              rows={2}
              fullWidth
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
            />

            <FormControl fullWidth size="small">
              <InputLabel>Lead Source</InputLabel>
              <Select
                value={editLeadSource}
                label="Lead Source"
                onChange={(e) => setEditLeadSource(e.target.value)}
              >
                {LEAD_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Remarks"
              size="small"
              multiline
              rows={2}
              fullWidth
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>
            {savingEdit ? <CircularProgress size={20} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: ADD CONTACT ===================== */}
      <Dialog open={contactDialogOpen} onClose={() => !savingContact && setContactDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonAdd sx={{ color: 'primary.main' }} />
          Add Contact Person
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Contact Name *"
              size="small"
              fullWidth
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
            />
            <TextField
              label="Designation (e.g. Medical Superintendent, Receptionist)"
              size="small"
              fullWidth
              value={newContactDesignation}
              onChange={(e) => setNewContactDesignation(e.target.value)}
            />
            <TextField
              label="Phone Number *"
              size="small"
              fullWidth
              value={newContactPhone}
              onChange={(e) => setNewContactPhone(e.target.value)}
            />
            <TextField
              label="Email (Optional)"
              type="email"
              size="small"
              fullWidth
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={newContactIsPrimary}
                  onChange={(e) => setNewContactIsPrimary(e.target.checked)}
                />
              }
              label="Set as Primary Contact for this Hospital"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setContactDialogOpen(false)} disabled={savingContact}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveContact} disabled={savingContact}>
            {savingContact ? <CircularProgress size={20} /> : 'Add Contact'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== DIALOG: WHATSAPP ===================== */}
      <Dialog open={whatsAppDialogOpen} onClose={() => !sendingWhatsApp && setWhatsAppDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WhatsAppIcon sx={{ color: '#25D366' }} />
          Send WhatsApp Message
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Recipient</InputLabel>
              <Select
                value={whatsAppRecipientType}
                label="Recipient"
                onChange={(e) => {
                  handleOpenWhatsAppDialog(e.target.value);
                }}
              >
                <MenuItem value="contact">Hospital Contact ({contactName || 'Primary'})</MenuItem>
                <MenuItem value="sales_agent">Assigned Sales Agent</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Phone Number"
              size="small"
              fullWidth
              value={whatsAppRecipientPhone}
              onChange={(e) => setWhatsAppRecipientPhone(e.target.value)}
              helperText="Indian 10-digit number or with country code"
            />

            <TextField
              label="Message Preview"
              size="small"
              multiline
              rows={5}
              fullWidth
              value={whatsAppMessage}
              onChange={(e) => setWhatsAppMessage(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setWhatsAppDialogOpen(false)} disabled={sendingWhatsApp}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSendWhatsApp}
            disabled={sendingWhatsApp}
            startIcon={<Send sx={{ fontSize: 16 }} />}
            sx={{ bgcolor: '#25D366', color: '#ffffff', '&:hover': { bgcolor: '#1ebe5d' } }}
          >
            {sendingWhatsApp ? <CircularProgress size={20} color="inherit" /> : 'Open WhatsApp'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Direct Lead Action & Classification Modal */}
      <LeadActionModal
        open={leadActionOpen}
        onClose={() => setLeadActionOpen(false)}
        lead={currentLead}
        onUpdated={notifyUpdated}
      />
    </>
  );
}

