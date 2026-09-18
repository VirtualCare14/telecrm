import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Stack,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Skeleton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  LaptopMac,
  DirectionsWalk,
  PhoneInTalk,
  WarningAmber as WarningIcon,
  Schedule,
  CheckCircle,
  Cancel,
  Search as SearchIcon,
  Clear,
  Visibility,
  ContentCopy,
  Check as CheckIcon,
  MoreVert,
  CalendarMonth,
  Person,
  Business as BusinessIcon,
  Refresh as RefreshIcon,
  EmojiEvents,
  Flag,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';
import { formatDate, formatTime, formatDateToYYYYMMDD } from '../../utils/dateHelpers';

// Styling badges for activity types
const getActivityTypeBadge = (type) => {
  switch (type) {
    case 'Demo':
      return {
        label: 'Demo',
        icon: <LaptopMac sx={{ fontSize: '15px !important' }} />,
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.1)',
        border: 'rgba(99, 102, 241, 0.3)',
      };
    case 'Walk-in':
      return {
        label: 'Walk-in',
        icon: <DirectionsWalk sx={{ fontSize: '15px !important' }} />,
        color: '#059669',
        bg: 'rgba(5, 150, 105, 0.1)',
        border: 'rgba(5, 150, 105, 0.3)',
      };
    case 'Sales Follow-up':
    default:
      return {
        label: 'Sales Follow-up',
        icon: <PhoneInTalk sx={{ fontSize: '15px !important' }} />,
        color: '#0284c7',
        bg: 'rgba(2, 132, 199, 0.1)',
        border: 'rgba(2, 132, 199, 0.3)',
      };
  }
};

// Styling badges for activity computed status
const getStatusBadge = (status) => {
  switch (status) {
    case 'Overdue':
      return {
        label: 'Overdue',
        icon: <WarningIcon sx={{ fontSize: '14px !important', color: '#dc2626' }} />,
        color: '#dc2626',
        bg: '#fee2e2',
        border: '#fca5a5',
        pulse: true,
      };
    case 'Today':
      return {
        label: 'Due Today',
        icon: <Schedule sx={{ fontSize: '14px !important', color: '#d97706' }} />,
        color: '#b45309',
        bg: '#fef3c7',
        border: '#fcd34d',
        pulse: false,
      };
    case 'Completed':
      return {
        label: 'Completed',
        icon: <CheckCircle sx={{ fontSize: '14px !important', color: '#059669' }} />,
        color: '#059669',
        bg: '#d1fae5',
        border: '#a7f3d0',
        pulse: false,
      };
    case 'Not Done':
      return {
        label: 'Not Done',
        icon: <Cancel sx={{ fontSize: '14px !important', color: '#991b1b' }} />,
        color: '#991b1b',
        bg: '#f1f5f9',
        border: '#cbd5e1',
        pulse: false,
      };
    case 'Planned':
    default:
      return {
        label: 'Planned',
        icon: <CalendarMonth sx={{ fontSize: '14px !important', color: '#2563eb' }} />,
        color: '#2563eb',
        bg: '#dbeafe',
        border: '#bfdbfe',
        pulse: false,
      };
  }
};

// Format scheduled date e.g. "Fri, 18 Sep 2026"
const formatScheduledDate = (dateInput) => {
  if (!dateInput) return '—';
  const dateStr = typeof dateInput === 'string' ? dateInput : (dateInput instanceof Date ? dateInput.toISOString() : String(dateInput));
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const monthIdx = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = new Date(year, monthIdx, day);
    const dayName = daysOfWeek[d.getDay()];
    const monthName = months[monthIdx];
    return `${dayName}, ${day} ${monthName} ${year}`;
  }
  return formatDate(dateInput);
};

// Format 24-hr time like "16:00" to "04:00 PM"
const formatTime12Hr = (timeStr) => {
  if (!timeStr) return '—';
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const padHours = String(hours).padStart(2, '0');
    return `${padHours}:${minutes} ${ampm}`;
  }
  return String(timeStr);
};

// Format Assigned On timestamp: e.g. "17 Sep 2026, 10:39 AM"
const formatAssignedOn = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ', ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Get activity timing label & style: "Demo Date & Time", "Walk-in Date & Time", "Follow-up Date & Time"
const getActivityTimingConfig = (type) => {
  switch (type) {
    case 'Demo':
      return {
        label: 'Demo Date & Time',
        tagColor: '#4f46e5',
        tagBg: 'rgba(79, 70, 229, 0.08)',
        tagBorder: 'rgba(79, 70, 229, 0.25)',
      };
    case 'Walk-in':
      return {
        label: 'Walk-in Date & Time',
        tagColor: '#059669',
        tagBg: 'rgba(5, 150, 105, 0.08)',
        tagBorder: 'rgba(5, 150, 105, 0.25)',
      };
    case 'Sales Follow-up':
    default:
      return {
        label: 'Follow-up Date & Time',
        tagColor: '#0284c7',
        tagBg: 'rgba(2, 132, 199, 0.08)',
        tagBorder: 'rgba(2, 132, 199, 0.25)',
      };
  }
};

export default function AssignedActivitiesSection({
  activities = [],
  summary = {},
  loading = false,
  onRefresh,
  onUpdateStatus,
  onReschedule,
  onOpenOutcome,
  navigate,
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Menu state for row actions
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [activeItem, setActiveItem] = useState(null);

  // Complete / Update Status Modal state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('Completed');
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [dialogError, setDialogError] = useState(null);
  const [savingAction, setSavingAction] = useState(false);

  // Reschedule Modal state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('11:00');
  const [rescheduleRemarks, setRescheduleRemarks] = useState('');

  const handleCopyPhone = (e, phone, id) => {
    e.stopPropagation();
    if (!phone || phone === '—') return;
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleOpenMenu = (e, item) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setActiveItem(item);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setActiveItem(null);
  };

  // Open direct completion modal
  const handleOpenStatusDialog = (item, defaultStatus = 'Completed') => {
    setActiveItem(item);
    setTargetStatus(defaultStatus);
    setCompletionRemarks('');
    setDialogError(null);
    setStatusDialogOpen(true);
    handleCloseMenu();
  };

  const handleSaveStatus = async () => {
    if (!activeItem) return;
    if (['Completed', 'Done', 'Not Done'].includes(targetStatus) && !completionRemarks.trim()) {
      setDialogError('Remarks are required to update activity status.');
      return;
    }

    setSavingAction(true);
    setDialogError(null);
    try {
      await onUpdateStatus(activeItem, targetStatus, completionRemarks.trim());
      setStatusDialogOpen(false);
      setActiveItem(null);
      setCompletionRemarks('');
    } catch (err) {
      setDialogError(err.response?.data?.message || err.message || 'Failed to update activity status');
    } finally {
      setSavingAction(false);
    }
  };

  // Open reschedule modal
  const handleOpenRescheduleDialog = (item) => {
    setActiveItem(item);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const safeDateStr = item.scheduledDate || (item.date ? (typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.substring(0, 10) : formatDateToYYYYMMDD(new Date(item.date))) : formatDateToYYYYMMDD(tomorrow));
    const safeTimeStr = item.scheduledTime || item.time || '11:00';
    setRescheduleDate(safeDateStr);
    setRescheduleTime(safeTimeStr);
    setRescheduleRemarks(item.remarks || '');
    setDialogError(null);
    setRescheduleDialogOpen(true);
    handleCloseMenu();
  };

  const handleSaveReschedule = async () => {
    if (!activeItem) return;
    if (!rescheduleDate) {
      setDialogError('Please select a valid date');
      return;
    }

    setSavingAction(true);
    setDialogError(null);
    try {
      await onReschedule(activeItem, rescheduleDate, rescheduleTime, rescheduleRemarks.trim());
      setRescheduleDialogOpen(false);
      setActiveItem(null);
    } catch (err) {
      setDialogError(err.response?.data?.message || err.message || 'Failed to reschedule activity');
    } finally {
      setSavingAction(false);
    }
  };

  // Filtering
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Tab filter
      if (activeTab === 'today' && act.computedStatus !== 'Today') return false;
      if (activeTab === 'overdue' && act.computedStatus !== 'Overdue') return false;
      if (activeTab === 'planned' && act.computedStatus !== 'Planned') return false;
      if (activeTab === 'completed' && act.computedStatus !== 'Completed') return false;
      if (activeTab === 'not_done' && act.computedStatus !== 'Not Done') return false;

      // Type filter
      if (typeFilter !== 'all') {
        const tLower = typeFilter.toLowerCase();
        const aTypeLower = act.activityType.toLowerCase();
        if (tLower === 'demo' && aTypeLower !== 'demo') return false;
        if (tLower === 'walkin' && !aTypeLower.includes('walk')) return false;
        if (tLower === 'followup' && !aTypeLower.includes('follow')) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesOrg = act.organizationName?.toLowerCase().includes(q);
        const matchesLeadNum = act.leadNumber?.toLowerCase().includes(q);
        const matchesContact = act.contactPerson?.toLowerCase().includes(q);
        const matchesPhone = act.contactPhone?.toLowerCase().includes(q);
        const matchesRemarks = act.remarks?.toLowerCase().includes(q);
        const matchesAssignedBy = act.assignedBy?.toLowerCase().includes(q);
        if (!matchesOrg && !matchesLeadNum && !matchesContact && !matchesPhone && !matchesRemarks && !matchesAssignedBy) {
          return false;
        }
      }

      return true;
    });
  }, [activities, activeTab, typeFilter, search]);

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: '#e2e8f0',
        bgcolor: '#ffffff',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: 'linear-gradient(90deg, #ea580c 0%, #4f46e5 100%)',
        },
      }}
    >
      {/* Header section with metrics */}
      <Box sx={{ p: { xs: 2, sm: 3 }, borderBottom: '1px solid #e2e8f0', bgcolor: '#fbfcfe' }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            mb: 2.5,
          }}
        >
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', letterSpacing: '-0.02em' }}>
                Assigned Activities Workspace
              </Typography>
              <Chip
                label={`${summary.total || activities.length} Assigned`}
                size="small"
                sx={{
                  bgcolor: '#ea580c',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 11,
                  height: 22,
                }}
              />
            </Stack>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Demos, Walk-ins, and Sales Follow-ups assigned to you by Calling Agents. Prioritize Today's and Overdue tasks.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={onRefresh}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                color: '#475569',
                borderColor: '#cbd5e1',
                fontWeight: 600,
                fontSize: 12,
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' },
              }}
            >
              Refresh
            </Button>
          </Stack>
        </Box>

        {/* Quick Metric Counter Cards */}
        <Grid container spacing={1.5}>
          {/* Overdue Card (Urgent) */}
          <Grid item xs={6} sm={4} md={2.4}>
            <Box
              onClick={() => setActiveTab('overdue')}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                bgcolor: activeTab === 'overdue' ? '#fee2e2' : '#ffffff',
                border: '1.5px solid',
                borderColor: (summary.overdue || 0) > 0 ? '#ef4444' : '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: (summary.overdue || 0) > 0 ? '0 2px 8px rgba(239, 68, 68, 0.15)' : 'none',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={700} sx={{ color: '#dc2626', textTransform: 'uppercase', fontSize: 11 }}>
                  Overdue
                </Typography>
                <WarningIcon sx={{ fontSize: 18, color: '#dc2626' }} />
              </Stack>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#991b1b', mt: 0.5 }}>
                {loading ? <Skeleton width={30} /> : summary.overdue || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: '#dc2626', fontSize: 10 }}>
                Immediate action needed
              </Typography>
            </Box>
          </Grid>

          {/* Today Card (High Priority) */}
          <Grid item xs={6} sm={4} md={2.4}>
            <Box
              onClick={() => setActiveTab('today')}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                bgcolor: activeTab === 'today' ? '#fef3c7' : '#ffffff',
                border: '1.5px solid',
                borderColor: (summary.today || 0) > 0 ? '#f59e0b' : '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: (summary.today || 0) > 0 ? '0 2px 8px rgba(245, 158, 11, 0.15)' : 'none',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={700} sx={{ color: '#b45309', textTransform: 'uppercase', fontSize: 11 }}>
                  Due Today
                </Typography>
                <Schedule sx={{ fontSize: 18, color: '#d97706' }} />
              </Stack>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#92400e', mt: 0.5 }}>
                {loading ? <Skeleton width={30} /> : summary.today || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: '#b45309', fontSize: 10 }}>
                Scheduled for today
              </Typography>
            </Box>
          </Grid>

          {/* Planned Card */}
          <Grid item xs={6} sm={4} md={2.4}>
            <Box
              onClick={() => setActiveTab('planned')}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                bgcolor: activeTab === 'planned' ? '#eff6ff' : '#ffffff',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { transform: 'translateY(-2px)', borderColor: '#3b82f6' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={600} sx={{ color: '#2563eb', textTransform: 'uppercase', fontSize: 11 }}>
                  Upcoming Planned
                </Typography>
                <CalendarMonth sx={{ fontSize: 18, color: '#3b82f6' }} />
              </Stack>
              <Typography variant="h5" fontWeight={700} sx={{ color: '#1e40af', mt: 0.5 }}>
                {loading ? <Skeleton width={30} /> : summary.planned || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10 }}>
                Future assignments
              </Typography>
            </Box>
          </Grid>

          {/* Completed Card */}
          <Grid item xs={6} sm={6} md={2.4}>
            <Box
              onClick={() => setActiveTab('completed')}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                bgcolor: activeTab === 'completed' ? '#f0fdf4' : '#ffffff',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { transform: 'translateY(-2px)', borderColor: '#10b981' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={600} sx={{ color: '#059669', textTransform: 'uppercase', fontSize: 11 }}>
                  Completed
                </Typography>
                <CheckCircle sx={{ fontSize: 18, color: '#10b981' }} />
              </Stack>
              <Typography variant="h5" fontWeight={700} sx={{ color: '#065f46', mt: 0.5 }}>
                {loading ? <Skeleton width={30} /> : summary.completed || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10 }}>
                Successfully done
              </Typography>
            </Box>
          </Grid>

          {/* Total Breakdown */}
          <Grid item xs={12} sm={6} md={2.4}>
            <Box
              onClick={() => setActiveTab('all')}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                bgcolor: activeTab === 'all' ? '#f8fafc' : '#ffffff',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={600} sx={{ color: '#475569', textTransform: 'uppercase', fontSize: 11 }}>
                  Total Pipeline
                </Typography>
                <Flag sx={{ fontSize: 18, color: '#64748b' }} />
              </Stack>
              <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a', mt: 0.5 }}>
                {loading ? <Skeleton width={30} /> : summary.total || activities.length}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10 }}>
                {summary.demosCount || 0} Demos • {summary.walkInsCount || 0} Walk-ins • {summary.followUpsCount || 0} Follow-ups
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>

      {/* Filter Tabs & Search Controls */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 1.5, pb: 1.5, borderBottom: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
        <Grid container spacing={2} alignItems="center">
          {/* Status Tabs */}
          <Grid item xs={12} md={7}>
            <Tabs
              value={activeTab}
              onChange={(e, val) => setActiveTab(val)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  minHeight: 40,
                  py: 0.75,
                  px: 1.75,
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 2,
                  mr: 0.5,
                },
              }}
            >
              <Tab value="all" label={`All (${summary.total || activities.length})`} />
              <Tab
                value="today"
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>Due Today</span>
                    {(summary.today || 0) > 0 && (
                      <Chip label={summary.today} size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#f59e0b', color: '#fff', fontWeight: 700 }} />
                    )}
                  </Stack>
                }
              />
              <Tab
                value="overdue"
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>Overdue</span>
                    {(summary.overdue || 0) > 0 && (
                      <Chip label={summary.overdue} size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#dc2626', color: '#fff', fontWeight: 700 }} />
                    )}
                  </Stack>
                }
              />
              <Tab value="planned" label={`Planned (${summary.planned || 0})`} />
              <Tab value="completed" label={`Completed (${summary.completed || 0})`} />
              <Tab value="not_done" label={`Not Done (${summary.notDone || 0})`} />
            </Tabs>
          </Grid>

          {/* Type Filter & Search Bar */}
          <Grid item xs={12} md={5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel sx={{ fontSize: 13 }}>Activity Type</InputLabel>
                <Select
                  value={typeFilter}
                  label="Activity Type"
                  onChange={(e) => setTypeFilter(e.target.value)}
                  sx={{ borderRadius: 2, fontSize: 13 }}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="demo">💻 Demos Only</MenuItem>
                  <MenuItem value="walkin">🚶 Walk-ins Only</MenuItem>
                  <MenuItem value="followup">📞 Sales Follow-ups</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                size="small"
                placeholder="Search lead, contact or notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch('')}>
                        <Clear fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
              />
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* Table of Assigned Activities */}
      <TableContainer sx={{ minHeight: 280, maxHeight: 600 }}>
        <Table stickyHeader sx={{ minWidth: 1160 }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: 12, py: 1.5 } }}>
              <TableCell sx={{ pl: { xs: 2, sm: 3 }, width: '19%' }}>Lead / Organization</TableCell>
              <TableCell sx={{ width: '11%' }}>Activity Type</TableCell>
              <TableCell sx={{ width: '18%' }}>Demo / Activity Date & Time</TableCell>
              <TableCell sx={{ width: '13%' }}>Assigned On</TableCell>
              <TableCell sx={{ width: '13%' }}>Assigned By</TableCell>
              <TableCell sx={{ width: '15%' }}>Remarks / Notes</TableCell>
              <TableCell sx={{ width: '11%' }}>Status</TableCell>
              <TableCell align="center" sx={{ pr: { xs: 2, sm: 3 }, width: '10%' }}>Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j} sx={{ py: 2 }}>
                      <Skeleton height={24} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredActivities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <BusinessIcon sx={{ fontSize: 42, color: '#cbd5e1', mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700} color="#475569">
                    No assigned activities found
                  </Typography>
                  <Typography variant="caption" color="#94a3b8">
                    {search || typeFilter !== 'all' || activeTab !== 'all'
                      ? 'Try clearing filters or search to view more assignments.'
                      : 'You do not have any pending activities assigned by Calling Agents.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredActivities.map((item) => {
                const typeStyle = getActivityTypeBadge(item.activityType);
                const statusStyle = getStatusBadge(item.computedStatus);
                const timingConfig = getActivityTimingConfig(item.activityType);
                const isOverdueItem = item.computedStatus === 'Overdue';
                const isTodayItem = item.computedStatus === 'Today';

                return (
                  <TableRow
                    key={item.id}
                    hover
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isOverdueItem
                        ? 'rgba(254, 242, 242, 0.45)'
                        : isTodayItem
                        ? 'rgba(254, 243, 199, 0.25)'
                        : 'inherit',
                      borderLeft: isOverdueItem
                        ? '4px solid #ef4444'
                        : isTodayItem
                        ? '4px solid #f59e0b'
                        : '4px solid transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: isOverdueItem
                          ? 'rgba(254, 242, 242, 0.75)'
                          : isTodayItem
                          ? 'rgba(254, 243, 199, 0.45)'
                          : 'rgba(241, 245, 249, 0.6)',
                      },
                    }}
                    onClick={() => navigate(`/leads/${item.leadId}`)}
                  >
                    {/* 1. Lead / Organization */}
                    <TableCell sx={{ pl: { xs: 2, sm: 3 }, py: 1.5 }}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography
                            fontWeight={700}
                            fontSize={13}
                            sx={{ color: '#0f172a', '&:hover': { color: 'primary.main' } }}
                          >
                            {item.organizationName}
                          </Typography>
                          <Chip
                            label={`#${item.leadNumber}`}
                            size="small"
                            sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: '#f1f5f9', color: '#475569' }}
                          />
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                          <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>
                            {item.contactPerson}
                          </Typography>
                          {item.contactPhone && item.contactPhone !== '—' && (
                            <Tooltip title={copiedId === item.id ? 'Copied!' : 'Copy phone number'}>
                              <Chip
                                size="small"
                                icon={copiedId === item.id ? <CheckIcon sx={{ fontSize: '11px !important' }} /> : <PhoneInTalk sx={{ fontSize: '11px !important' }} />}
                                label={item.contactPhone}
                                onClick={(e) => handleCopyPhone(e, item.contactPhone, item.id)}
                                sx={{
                                  height: 20,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  bgcolor: copiedId === item.id ? '#dcfce7' : '#f8fafc',
                                  color: copiedId === item.id ? '#15803d' : '#0284c7',
                                  cursor: 'pointer',
                                  border: '1px solid',
                                  borderColor: copiedId === item.id ? '#bbf7d0' : '#e2e8f0',
                                }}
                              />
                            </Tooltip>
                          )}
                        </Stack>

                        {item.whatsAppCommunication && (
                          <Box sx={{ mt: 0.75 }}>
                            <Tooltip
                              title={
                                <Box sx={{ p: 0.5, maxWidth: 320 }}>
                                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#86efac', fontSize: 12 }}>
                                    WhatsApp: {item.whatsAppCommunication.messageType || 'Communication'}
                                  </Typography>
                                  <Typography variant="caption" display="block" sx={{ color: '#f1f5f9', mt: 0.25 }}>
                                    Sent by {item.whatsAppCommunication.sentBy} • {item.whatsAppCommunication.recipientPhone}
                                  </Typography>
                                  <Typography variant="caption" display="block" sx={{ color: '#cbd5e1', mt: 0.5, fontStyle: 'italic', bgcolor: 'rgba(255, 255, 255, 0.08)', p: 0.75, borderRadius: 1 }}>
                                    "{item.whatsAppCommunication.messageContent}"
                                  </Typography>
                                </Box>
                              }
                              arrow
                              placement="top"
                            >
                              <Chip
                                size="small"
                                icon={<WhatsAppIcon sx={{ fontSize: '12px !important', color: '#15803d !important' }} />}
                                label="WhatsApp Sent"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/leads/${item.leadId}`);
                                }}
                                sx={{
                                  height: 20,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  bgcolor: 'rgba(37, 211, 102, 0.12)',
                                  color: '#15803d',
                                  border: '1px solid rgba(37, 211, 102, 0.35)',
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: 'rgba(37, 211, 102, 0.22)' },
                                }}
                              />
                            </Tooltip>
                          </Box>
                        )}
                      </Box>
                    </TableCell>

                    {/* 2. Activity Type */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Chip
                        icon={typeStyle.icon}
                        label={typeStyle.label}
                        size="small"
                        sx={{
                          bgcolor: typeStyle.bg,
                          color: typeStyle.color,
                          border: `1px solid ${typeStyle.border}`,
                          fontWeight: 700,
                          fontSize: 11,
                          height: 24,
                        }}
                      />
                    </TableCell>

                    {/* 3. Demo / Activity Date & Time (When activity has to happen) */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                          <Chip
                            label={timingConfig.label}
                            size="small"
                            sx={{
                              height: 19,
                              fontSize: 10,
                              fontWeight: 700,
                              color: timingConfig.tagColor,
                              bgcolor: timingConfig.tagBg,
                              border: `1px solid ${timingConfig.tagBorder}`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.02em',
                            }}
                          />
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <CalendarMonth sx={{ fontSize: 14, color: isOverdueItem ? '#dc2626' : isTodayItem ? '#b45309' : '#4f46e5' }} />
                          <Typography fontWeight={700} fontSize={12.5} sx={{ color: '#0f172a' }}>
                            {formatScheduledDate(item.scheduledDate || item.date)}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                          <Schedule sx={{ fontSize: 13, color: isOverdueItem ? '#dc2626' : isTodayItem ? '#b45309' : '#64748b' }} />
                          <Typography variant="caption" fontWeight={700} sx={{ color: isOverdueItem ? '#dc2626' : isTodayItem ? '#b45309' : '#334155', fontSize: 11.5 }}>
                            {formatTime12Hr(item.scheduledTime || item.time)}
                          </Typography>
                          {isOverdueItem && (
                            <Chip
                              label="Overdue"
                              size="small"
                              sx={{ height: 16, fontSize: 9.5, fontWeight: 800, bgcolor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                            />
                          )}
                          {isTodayItem && (
                            <Chip
                              label="Due Today"
                              size="small"
                              sx={{ height: 16, fontSize: 9.5, fontWeight: 800, bgcolor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}
                            />
                          )}
                        </Stack>
                      </Box>
                    </TableCell>

                    {/* 4. Assigned On (Separate timestamp when Calling Agent scheduled it) */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography fontWeight={600} fontSize={12} sx={{ color: '#334155' }}>
                        {item.assignedOn ? new Date(item.assignedOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', fontSize: 11, display: 'block', mt: 0.25 }}>
                        {item.assignedOn ? new Date(item.assignedOn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                      </Typography>
                    </TableCell>

                    {/* 5. Assigned By (Calling Agent) */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            bgcolor: '#fed7aa',
                            color: '#c2410c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {(item.assignedBy || 'C').charAt(0).toUpperCase()}
                        </Box>
                        <Box>
                          <Typography fontWeight={600} fontSize={12} sx={{ color: '#1e293b' }}>
                            {item.assignedBy}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 10 }}>
                            {item.assignedByRole || 'Calling Agent'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    {/* 6. Remarks / Notes */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Tooltip title={item.remarks || 'No notes provided'} arrow placement="top">
                        <Typography
                          fontSize={12}
                          sx={{
                            color: '#475569',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.35,
                          }}
                        >
                          {item.remarks || '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    {/* 7. Status */}
                    <TableCell sx={{ py: 1.5 }}>
                      <Chip
                        icon={statusStyle.icon}
                        label={statusStyle.label}
                        size="small"
                        sx={{
                          bgcolor: statusStyle.bg,
                          color: statusStyle.color,
                          border: `1px solid ${statusStyle.border}`,
                          fontWeight: 700,
                          fontSize: 11,
                          height: 24,
                        }}
                      />
                    </TableCell>

                    {/* 8. Action Button */}
                    <TableCell align="center" sx={{ pr: { xs: 2, sm: 3 }, py: 1.5 }}>
                      <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                        {item.computedStatus !== 'Completed' ? (
                          <Button
                            size="small"
                            variant="contained"
                            color={isOverdueItem ? 'error' : isTodayItem ? 'warning' : 'primary'}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenStatusDialog(item, 'Completed');
                            }}
                            sx={{
                              borderRadius: 2,
                              textTransform: 'none',
                              fontSize: 11,
                              fontWeight: 700,
                              py: 0.4,
                              px: 1.25,
                              boxShadow: 'none',
                            }}
                          >
                            Done
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenOutcome) onOpenOutcome(item);
                              else navigate(`/leads/${item.leadId}`);
                            }}
                            sx={{
                              borderRadius: 2,
                              textTransform: 'none',
                              fontSize: 11,
                              fontWeight: 700,
                              py: 0.4,
                              px: 1.25,
                            }}
                          >
                            Outcome
                          </Button>
                        )}

                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenMenu(e, item)}
                          sx={{ color: '#64748b' }}
                        >
                          <MoreVert fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Row Context Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{
          elevation: 3,
          sx: { borderRadius: 2, minWidth: 170, py: 0.5 },
        }}
      >
        <MenuItem
          onClick={() => handleOpenStatusDialog(activeItem, 'Completed')}
          sx={{ fontSize: 13 }}
        >
          <ListItemIcon><CheckCircle sx={{ fontSize: 16, color: '#059669' }} /></ListItemIcon>
          <ListItemText primary="Mark as Done" />
        </MenuItem>

        <MenuItem
          onClick={() => handleOpenStatusDialog(activeItem, 'Not Done')}
          sx={{ fontSize: 13 }}
        >
          <ListItemIcon><Cancel sx={{ fontSize: 16, color: '#dc2626' }} /></ListItemIcon>
          <ListItemText primary="Mark as Not Done" />
        </MenuItem>

        <MenuItem
          onClick={() => handleOpenRescheduleDialog(activeItem)}
          sx={{ fontSize: 13 }}
        >
          <ListItemIcon><Schedule sx={{ fontSize: 16, color: '#d97706' }} /></ListItemIcon>
          <ListItemText primary="Reschedule" />
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem
          onClick={() => {
            if (activeItem) navigate(`/leads/${activeItem.leadId}`);
            handleCloseMenu();
          }}
          sx={{ fontSize: 13 }}
        >
          <ListItemIcon><Visibility sx={{ fontSize: 16, color: '#64748b' }} /></ListItemIcon>
          <ListItemText primary="View Lead Details" />
        </MenuItem>
      </Menu>

      {/* Complete Activity Dialog */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => !savingAction && setStatusDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, pb: 1 }}>
          Update {activeItem?.activityType} Status
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, p: 1.75, borderRadius: 2.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }}>
              {activeItem?.organizationName} (#{activeItem?.leadNumber})
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
              <Chip
                label={`${getActivityTimingConfig(activeItem?.activityType).label}: ${formatScheduledDate(activeItem?.scheduledDate || activeItem?.date)} • ${formatTime12Hr(activeItem?.scheduledTime || activeItem?.time)}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: 'rgba(99, 102, 241, 0.1)',
                  color: '#4f46e5',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              />
              <Chip
                label={`Assigned On: ${formatAssignedOn(activeItem?.assignedOn || activeItem?.createdAt)}`}
                size="small"
                sx={{ height: 22, fontSize: 10.5, fontWeight: 500, bgcolor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1' }}
              />
              <Chip
                label={`Assigned By: ${activeItem?.assignedBy || 'Calling Agent'}`}
                size="small"
                sx={{ height: 22, fontSize: 10.5, fontWeight: 500, bgcolor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1' }}
              />
            </Stack>
          </Box>

          {dialogError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {dialogError}
            </Alert>
          )}

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={targetStatus}
              label="Status"
              onChange={(e) => setTargetStatus(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="Completed">Completed (Done)</MenuItem>
              <MenuItem value="Not Done">Not Done</MenuItem>
              <MenuItem value="Planned">Planned (In Progress)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Remarks / Completion Notes *"
            placeholder="Describe what occurred, customer response, or reason if not done..."
            value={completionRemarks}
            onChange={(e) => setCompletionRemarks(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setStatusDialogOpen(false)}
            disabled={savingAction}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#64748b' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveStatus}
            disabled={savingAction}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: targetStatus === 'Not Done' ? '#dc2626' : 'primary.main',
              boxShadow: 'none',
            }}
          >
            {savingAction ? <CircularProgress size={20} color="inherit" /> : 'Save Status'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reschedule Activity Dialog */}
      <Dialog
        open={rescheduleDialogOpen}
        onClose={() => !savingAction && setRescheduleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, pb: 1 }}>
          Reschedule {activeItem?.activityType}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, p: 1.75, borderRadius: 2.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }}>
              {activeItem?.organizationName} (#{activeItem?.leadNumber})
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
              <Chip
                label={`Current Scheduled: ${formatScheduledDate(activeItem?.scheduledDate || activeItem?.date)} • ${formatTime12Hr(activeItem?.scheduledTime || activeItem?.time)}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: 'rgba(217, 119, 6, 0.1)',
                  color: '#b45309',
                  border: '1px solid rgba(217, 119, 6, 0.25)',
                }}
              />
              <Chip
                label={`Assigned By ${activeItem?.assignedBy || 'Calling Agent'} on ${formatAssignedOn(activeItem?.assignedOn || activeItem?.createdAt)}`}
                size="small"
                sx={{ height: 22, fontSize: 10.5, fontWeight: 500, bgcolor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1' }}
              />
            </Stack>
          </Box>

          {dialogError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {dialogError}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={7}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="New Scheduled Date *"
                InputLabelProps={{ shrink: true }}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                fullWidth
                size="small"
                type="time"
                label="New Scheduled Time *"
                InputLabelProps={{ shrink: true }}
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>

          <TextField
            fullWidth
            multiline
            rows={2.5}
            label="Reschedule Remarks / Reason"
            placeholder="Add note for why this was rescheduled..."
            value={rescheduleRemarks}
            onChange={(e) => setRescheduleRemarks(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setRescheduleDialogOpen(false)}
            disabled={savingAction}
            sx={{ borderRadius: 2, textTransform: 'none', color: '#64748b' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveReschedule}
            disabled={savingAction}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
          >
            {savingAction ? <CircularProgress size={20} color="inherit" /> : 'Confirm Reschedule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
