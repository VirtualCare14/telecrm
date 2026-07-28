import React, { useState } from 'react';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Avatar, Menu, MenuItem, Chip, useTheme, useMediaQuery,
  Badge
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, People, Business,
  Send, Logout, ChevronLeft, Add, Notifications,
  Person, NotificationsActive
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/authService';
import ExpiryWarning from '../components/ExpiryWarning';

const DRAWER_WIDTH = 260;

export default function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleLogout = async () => {
    try { await logout(); } catch (e) { /* ignore */ }
    clearAuth();
    navigate('/login');
  };

  const navItems = [];
  if (user?.role === 'ADMIN') {
    navItems.push(
      { label: 'Dashboard', icon: <Dashboard />, path: '/admin' },
      { label: 'Leads', icon: <Business />, path: '/leads' },
      { label: 'Agents', icon: <People />, path: '/admin/agents' },
      { label: 'Transfers', icon: <Send />, path: '/transfer-requests' },
    );
  } else {
    navItems.push(
      { label: 'Dashboard', icon: <Dashboard />, path: '/agent' },
      { label: 'Leads', icon: <Business />, path: '/leads' },
      { label: 'Transfers', icon: <Send />, path: '/transfer-requests' },
    );
  }

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#1a1f36' }}>
      {/* Logo Section */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)' }}>
          <Business />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2, color: 'white' }}>
            TeleCRM
          </Typography>
          <Chip
            label={user?.role || ''}
            size="small"
            color={user?.role === 'ADMIN' ? 'error' : 'primary'}
            sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
          />
        </Box>
      </Box>
      <Divider sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
      
      {/* Navigation */}
      <List sx={{ flex: 1, px: 1.5, py: 1 }}>
        {navItems.map((item) => {
          const selected = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={selected}
                onClick={() => { navigate(item.path); if (isMobile) setMobileOpen(false); }}
                sx={{
                  borderRadius: 2,
                  position: 'relative',
                  color: 'rgba(255,255,255,0.8)',
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                    '&:hover': { bgcolor: 'primary.dark' },
                    '& .MuiListItemIcon-root': { color: 'white' },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 24,
                      bgcolor: 'white',
                      borderRadius: 1,
                    }
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'rgba(255,255,255,0.6)' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 600 : 400, fontSize: 14, color: selected ? 'white' : 'rgba(255,255,255,0.8)' }} />
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
              borderRight: 'none',
              boxShadow: '4px 0 24px rgba(0,0,0,0.08)'
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ 
          bgcolor: '#1e293b',
          borderBottom: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)'
        }}>
          <Toolbar sx={{ gap: 1, minHeight: 64 }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, color: 'white' }}>
                <MenuIcon />
              </IconButton>
            )}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
                </Typography>
                <Typography variant="body1" fontWeight={600} sx={{ fontSize: 14, color: 'white' }}>
                  {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Typography>
              </Box>
            
              <IconButton 
                sx={{ 
                  position: 'relative',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }
                }}
              >
                <Badge badgeContent={0} color="error">
                  <NotificationsActive sx={{ color: 'rgba(255,255,255,0.7)' }} />
                </Badge>
              </IconButton>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1, pl: 1, borderLeft: '1px solid', borderColor: 'rgba(255,255,255,0.15)' }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', cursor: 'pointer' }} onClick={(e) => setAnchorEl(e.currentTarget)}>
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </Avatar>
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: 13, lineHeight: 1.2, color: 'white' }}>
                    {user?.fullName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.2 }}>
                    {user?.role}
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
