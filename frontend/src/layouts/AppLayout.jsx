import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Avatar, Menu, MenuItem, Popover, Button, Chip,
  useTheme, useMediaQuery, Badge, Tooltip, CircularProgress
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, People, Business,
  Send, Logout, ChevronLeft, Add, Notifications,
  Person, NotificationsActive, AssignmentInd, Assessment,
  AccessTimeFilled, Event, PersonAdd, SwapHoriz,
  CheckCircle, Cancel, DoneAll, Check, NotificationsNone,
  FiberManualRecord
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/authService';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../services/notificationService';
import ExpiryWarning from '../components/ExpiryWarning';

const DRAWER_WIDTH = 260;

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Future dates (e.g. upcoming follow-up)
  if (diffSec < 0) {
    const futureMin = Math.abs(diffMin);
    const futureHours = Math.abs(diffHours);
    const futureDays = Math.abs(diffDays);
    if (futureMin < 60) return `in ${futureMin}m`;
    if (futureHours < 24) return `in ${futureHours}h`;
    if (futureDays === 1) return 'Tomorrow';
    return `in ${futureDays}d`;
  }

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifTab, setNotifTab] = useState('all'); // 'all' | 'unread'
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      if (data) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      // Silent catch on periodic polling
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const timer = setInterval(fetchNotifications, 30000); // poll every 30s
      return () => clearInterval(timer);
    }
  }, [user, fetchNotifications]);

  const handleOpenNotifications = async (e) => {
    setNotifAnchorEl(e.currentTarget);
    setLoadingNotifs(true);
    await fetchNotifications();
    setLoadingNotifs(false);
  };

  const handleCloseNotifications = () => {
    setNotifAnchorEl(null);
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        // Continue navigation even if read call fails
      }
    }
    handleCloseNotifications();

    if (notif.link) {
      navigate(notif.link);
    } else if (notif.leadId) {
      navigate(`/leads/${notif.leadId}`);
    }
  };

  const handleMarkSingleRead = async (e, notifId) => {
    e.stopPropagation();
    try {
      await markNotificationRead(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
      await markAllNotificationsRead(unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch (e) { /* ignore */ }
    clearAuth();
    navigate('/login');
  };

  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');

  const navItems = [];
  if (isAdmin) {
    navItems.push(
      { label: 'Dashboard', icon: <Dashboard />, path: '/admin' },
      { label: 'Leads', icon: <Business />, path: '/leads' },
      { label: 'Agents', icon: <People />, path: '/admin/agents' },
      { label: 'Roles', icon: <AssignmentInd />, path: '/admin/roles' },
      { label: 'Transfers', icon: <Send />, path: '/transfer-requests' },
      { label: 'Reports', icon: <Assessment />, path: '/admin/reports' },
    );
  } else {
    navItems.push(
      { label: 'Dashboard', icon: <Dashboard />, path: '/agent' },
      { label: 'My Leads', icon: <Business />, path: '/agent/leads' },
    );
  }

  const displayedNotifications = notifTab === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const renderNotifIcon = (type) => {
    switch (type) {
      case 'overdue':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#fee2e2', color: '#ef4444' }}>
            <AccessTimeFilled sx={{ fontSize: 18 }} />
          </Avatar>
        );
      case 'upcoming':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#fef3c7', color: '#d97706' }}>
            <Event sx={{ fontSize: 18 }} />
          </Avatar>
        );
      case 'assigned':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#dbeafe', color: '#2563eb' }}>
            <PersonAdd sx={{ fontSize: 18 }} />
          </Avatar>
        );
      case 'transfer':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#ede9fe', color: '#7c3aed' }}>
            <SwapHoriz sx={{ fontSize: 18 }} />
          </Avatar>
        );
      case 'won':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#d1fae5', color: '#059669' }}>
            <CheckCircle sx={{ fontSize: 18 }} />
          </Avatar>
        );
      case 'lost':
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#f1f5f9', color: '#64748b' }}>
            <Cancel sx={{ fontSize: 18 }} />
          </Avatar>
        );
      default:
        return (
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#f1f5f9', color: '#475569' }}>
            <Notifications sx={{ fontSize: 18 }} />
          </Avatar>
        );
    }
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#ffffff' }}>
      {/* Logo Section */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}>
          <Business sx={{ color: '#ffffff' }} />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2, color: '#0f172a' }}>
            TeleCRM
          </Typography>
          <Chip
            label={isAdmin ? 'ADMIN' : (user?.agentRole || 'Agent')}
            size="small"
            color={isAdmin ? 'default' : 'primary'}
            sx={{ 
              height: 20, 
              fontSize: 11, 
              fontWeight: 600,
              bgcolor: isAdmin ? '#f1f5f9' : 'rgba(234, 88, 12, 0.1)',
              color: isAdmin ? '#475569' : 'primary.main',
              border: '1px solid',
              borderColor: isAdmin ? '#cbd5e1' : 'rgba(234, 88, 12, 0.2)'
            }}
          />
        </Box>
      </Box>
      <Divider sx={{ borderColor: '#e2e8f0' }} />
      
      {/* Navigation */}
      <List sx={{ flex: 1, px: 1.5, py: 1.5 }}>
        {navItems.map((item) => {
          const selected = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.75 }}>
              <ListItemButton
                selected={selected}
                onClick={() => { navigate(item.path); if (isMobile) setMobileOpen(false); }}
                sx={{
                  borderRadius: 2,
                  position: 'relative',
                  color: '#475569',
                  py: 1,
                  '&:hover': {
                    bgcolor: 'rgba(234, 88, 12, 0.08)',
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': { color: 'primary.main' }
                  },
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)',
                    '&:hover': { bgcolor: 'primary.dark' },
                    '& .MuiListItemIcon-root': { color: '#ffffff' },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 22,
                      bgcolor: '#ffffff',
                      borderRadius: 1,
                    }
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: selected ? '#ffffff' : '#64748b' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 600 : 500, fontSize: 14, color: selected ? '#ffffff' : 'inherit' }} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { 
              width: DRAWER_WIDTH, 
              boxSizing: 'border-box', 
              borderRight: '1px solid #e2e8f0',
              boxShadow: '2px 0 12px rgba(15, 23, 42, 0.03)'
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ 
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <Toolbar sx={{ gap: 1, minHeight: 64 }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, color: '#0f172a' }}>
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: 12 }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
              </Typography>
              <Typography variant="body1" fontWeight={600} sx={{ fontSize: 14, color: '#0f172a' }}>
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Typography>
            </Box>
          
            {/* Bell Icon with Real Unread Badge */}
            <Tooltip title="Notifications">
              <IconButton 
                onClick={handleOpenNotifications}
                sx={{ 
                  position: 'relative',
                  '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.08)' }
                }}
              >
                <Badge badgeContent={unreadCount} color="error" max={99}>
                  <NotificationsActive sx={{ color: unreadCount > 0 ? 'primary.main' : '#64748b' }} />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Notifications Popover */}
            <Popover
              anchorEl={notifAnchorEl}
              open={Boolean(notifAnchorEl)}
              onClose={handleCloseNotifications}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{
                sx: {
                  width: { xs: 320, sm: 400 },
                  maxHeight: 520,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 3,
                  boxShadow: '0 16px 40px -8px rgba(15, 23, 42, 0.18)',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  mt: 1,
                },
              }}
            >
              {/* Header */}
              <Box sx={{ p: 2, pb: 1.5, bgcolor: '#ffffff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a' }}>
                      Notifications
                    </Typography>
                    {unreadCount > 0 ? (
                      <Chip 
                        label={`${unreadCount} new`} 
                        size="small" 
                        color="error"
                        sx={{ height: 20, fontSize: 11, fontWeight: 700 }} 
                      />
                    ) : (
                      <Chip 
                        label="All caught up" 
                        size="small" 
                        sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9', color: '#64748b' }} 
                      />
                    )}
                  </Box>

                  <Button
                    size="small"
                    startIcon={<DoneAll sx={{ fontSize: 16 }} />}
                    disabled={unreadCount === 0}
                    onClick={handleMarkAllRead}
                    sx={{ 
                      fontSize: 12, 
                      textTransform: 'none', 
                      py: 0.25, 
                      px: 1,
                      color: 'primary.main',
                      fontWeight: 600,
                      '&.Mui-disabled': { color: '#94a3b8' }
                    }}
                  >
                    Mark all read
                  </Button>
                </Box>

                {/* Filter Tabs: All vs Unread */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant={notifTab === 'all' ? 'contained' : 'outlined'}
                    onClick={() => setNotifTab('all')}
                    sx={{
                      borderRadius: 2,
                      fontSize: 12,
                      textTransform: 'none',
                      py: 0.25,
                      px: 1.5,
                      bgcolor: notifTab === 'all' ? '#0f172a' : 'transparent',
                      borderColor: '#e2e8f0',
                      color: notifTab === 'all' ? '#ffffff' : '#64748b',
                      '&:hover': {
                        bgcolor: notifTab === 'all' ? '#1e293b' : '#f8fafc',
                        borderColor: '#cbd5e1',
                      },
                    }}
                  >
                    All ({notifications.length})
                  </Button>
                  <Button
                    size="small"
                    variant={notifTab === 'unread' ? 'contained' : 'outlined'}
                    onClick={() => setNotifTab('unread')}
                    sx={{
                      borderRadius: 2,
                      fontSize: 12,
                      textTransform: 'none',
                      py: 0.25,
                      px: 1.5,
                      bgcolor: notifTab === 'unread' ? 'primary.main' : 'transparent',
                      borderColor: '#e2e8f0',
                      color: notifTab === 'unread' ? '#ffffff' : '#64748b',
                      '&:hover': {
                        bgcolor: notifTab === 'unread' ? 'primary.dark' : '#f8fafc',
                        borderColor: '#cbd5e1',
                      },
                    }}
                  >
                    Unread ({unreadCount})
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ borderColor: '#e2e8f0' }} />

              {/* Notification List */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: 0.5 }}>
                {loadingNotifs && notifications.length === 0 ? (
                  <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : displayedNotifications.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <NotificationsNone sx={{ fontSize: 44, color: '#94a3b8', mb: 1, opacity: 0.8 }} />
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#475569' }}>
                      {notifTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                      {notifTab === 'unread' 
                        ? 'You have reviewed all your alerts!' 
                        : 'New alerts for follow-ups, leads, and transfers will appear here.'}
                    </Typography>
                  </Box>
                ) : (
                  <List disablePadding>
                    {displayedNotifications.map((notif) => (
                      <ListItem
                        key={notif.id}
                        disablePadding
                        sx={{
                          mb: 0.5,
                          borderRadius: 2,
                          overflow: 'hidden',
                          bgcolor: notif.isRead ? '#ffffff' : 'rgba(234, 88, 12, 0.04)',
                          border: '1px solid',
                          borderColor: notif.isRead ? '#f1f5f9' : 'rgba(234, 88, 12, 0.15)',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            bgcolor: notif.isRead ? '#f8fafc' : 'rgba(234, 88, 12, 0.08)',
                            borderColor: '#e2e8f0',
                          },
                        }}
                      >
                        <ListItemButton
                          onClick={() => handleNotificationClick(notif)}
                          sx={{ p: 1.5, gap: 1.5, alignItems: 'flex-start' }}
                        >
                          {/* Left Type Icon */}
                          <Box sx={{ mt: 0.25 }}>
                            {renderNotifIcon(notif.type)}
                          </Box>

                          {/* Middle Description */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                              <Typography 
                                variant="caption" 
                                fontWeight={700}
                                sx={{ 
                                  color: notif.severity === 'error' 
                                    ? 'error.main' 
                                    : notif.severity === 'warning'
                                    ? '#d97706'
                                    : notif.severity === 'success'
                                    ? '#059669'
                                    : '#2563eb',
                                  fontSize: 11,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.4
                                }}
                              >
                                {notif.category}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                                {formatRelativeTime(notif.timestamp)}
                              </Typography>
                            </Box>

                            <Typography 
                              variant="body2" 
                              fontWeight={notif.isRead ? 600 : 700} 
                              sx={{ 
                                color: '#0f172a',
                                lineHeight: 1.3, 
                                mb: 0.5,
                                fontSize: 13,
                              }}
                            >
                              {notif.title}
                            </Typography>

                            <Typography 
                              variant="caption" 
                              sx={{ 
                                color: '#64748b', 
                                lineHeight: 1.35, 
                                display: '-webkit-box', 
                                WebkitLineClamp: 2, 
                                WebkitBoxOrient: 'vertical', 
                                overflow: 'hidden',
                                fontSize: 12
                              }}
                            >
                              {notif.message}
                            </Typography>
                          </Box>

                          {/* Right Read Action / Dot */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                            {!notif.isRead && (
                              <>
                                <Tooltip title="Mark as read">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleMarkSingleRead(e, notif.id)}
                                    sx={{
                                      p: 0.5,
                                      color: '#94a3b8',
                                      '&:hover': { color: 'primary.main', bgcolor: 'rgba(234, 88, 12, 0.1)' }
                                    }}
                                  >
                                    <Check sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                <FiberManualRecord sx={{ fontSize: 8, color: 'primary.main' }} />
                              </>
                            )}
                          </Box>
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Popover>

            {/* Profile Avatar & Logout */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1, pl: 1, borderLeft: '1px solid', borderColor: '#e2e8f0' }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', color: '#ffffff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)' }} onClick={(e) => setAnchorEl(e.currentTarget)}>
                {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: 13, lineHeight: 1.2, color: '#0f172a' }}>
                  {user?.fullName || user?.username}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 11, lineHeight: 1.2 }}>
                  {isAdmin ? 'Admin' : (user?.agentRole || 'Agent')}
                </Typography>
              </Box>
            </Box>
          
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              PaperProps={{
                sx: { mt: 1, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }
              }}
            >
              <MenuItem disabled sx={{ py: 1.5 }}>
                <Person sx={{ mr: 1.5, fontSize: 20 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>{user?.fullName}</Typography>
                  <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                </Box>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ py: 1.5, color: 'error.main' }}>
                <Logout sx={{ mr: 1.5, fontSize: 20 }} />
                <Typography variant="body2" fontWeight={500}>Logout</Typography>
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box sx={{ 
          flex: 1, 
          p: { xs: 2, md: 3 }, 
          overflow: 'auto',
          bgcolor: 'background.default'
        }}>
          {children}
        </Box>
      </Box>
      <ExpiryWarning />
    </Box>
  );
}
