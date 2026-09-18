import React, { useEffect, useState } from 'react';
import {
  Box, Button, Typography, Paper, TextField, Table, TableBody,
  TableCell, TableHead, TableRow, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Chip, Grid, TableContainer, Avatar, FormControl, InputLabel,
  Select, MenuItem
} from '@mui/material';
import { Add, Edit, Lock, Refresh, Delete } from '@mui/icons-material';
import { getAgents, createAgent, updateAgent, changeAgentStatus, changeAgentPassword, forceLogoutAgent, deleteAgent } from '../services/agentService';
import { getRoles } from '../services/roleService';

const getDisplayPhone = (phone) => {
  if (!phone) return '—';
  const p = String(phone).trim();
  if (!p || p.includes('@')) return '—';
  return p;
};

const isValidPhone = (phone) => {
  if (!phone) return false;
  const clean = String(phone).trim();
  const digits = clean.replace(/\D/g, '');
  return /^\+?[0-9\s\-()]{7,20}$/.test(clean) && digits.length >= 7 && digits.length <= 15;
};

const getRoleBadgeProps = (role) => {
  const isElevated = role && role.toLowerCase().includes('admin');
  if (isElevated) {
    return {
      variant: 'filled',
      sx: { 
        fontWeight: 600, 
        borderRadius: 1.5, 
        bgcolor: '#ea580c', 
        color: '#ffffff',
        fontSize: 12
      }
    };
  }
  return {
    variant: 'outlined',
    sx: { 
      fontWeight: 600, 
      borderRadius: 1.5, 
      borderColor: '#ea580c', 
      color: '#ea580c', 
      bgcolor: 'rgba(234, 88, 12, 0.08)',
      fontSize: 12
    }
  };
};

export default function AdminAgents() {
  const [agents, setAgents] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create Agent dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: '', email: '', username: '', phone: '', password: '', role: '' });
  const [createError, setCreateError] = useState(null);

  // Edit Agent dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', fullName: '', email: '', username: '', phone: '', role: '' });
  const [currentAgentRoleInfo, setCurrentAgentRoleInfo] = useState({ name: '', isInactive: false });

  // Password dialog
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ id: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState(null);

  // Delete Agent dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRolesList = async () => {
    try {
      const data = await getRoles({ active: true });
      setAvailableRoles(data || []);
      return data || [];
    } catch (err) {
      console.error('Unable to fetch roles:', err);
      return [];
    }
  };

  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchAgents();
    fetchRolesList();
  }, []);

  const handleOpenCreate = () => {
    const defaultRole = availableRoles.length > 0 ? availableRoles[0].name : '';
    setCreateForm({ fullName: '', email: '', username: '', phone: '', password: '', role: defaultRole });
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreateForm({ fullName: '', email: '', username: '', phone: '', password: '', role: '' });
    setCreateError(null);
  };

  const handleCreateChange = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const handleEditChange = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));
  const handlePasswordChange = (f) => (e) => setPasswordForm((p) => ({ ...p, [f]: e.target.value }));

  const handleCreate = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCreateError(null);

    const payload = {
      fullName: (createForm.fullName || '').trim(),
      email: (createForm.email || '').trim().toLowerCase(),
      username: (createForm.username || '').trim(),
      phone: (createForm.phone || '').trim(),
      password: createForm.password || '',
      role: createForm.role || ''
    };

    if (!payload.fullName) {
      setCreateError('Full Name is required');
      return;
    }
    if (!payload.email) {
      setCreateError('Valid Email is required');
      return;
    }
    if (!payload.username) {
      setCreateError('Username is required');
      return;
    }
    if (!payload.phone) {
      setCreateError('Phone is required');
      return;
    }
    if (!isValidPhone(payload.phone)) {
      setCreateError('Please enter a valid phone number');
      return;
    }
    if (!payload.role) {
      setCreateError('Role is required');
      return;
    }
    if (!payload.password) {
      setCreateError('Password is required');
      return;
    }
    if (payload.password.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    try {
      await createAgent(payload);
      handleCloseCreate();
      setSuccess('Agent created successfully');
      await fetchAgents();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create agent');
    }
  };

  const handleEdit = async () => {
    try {
      const payload = { 
        fullName: (editForm.fullName || '').trim(), 
        email: (editForm.email || '').trim().toLowerCase(), 
        username: (editForm.username || '').trim(), 
        phone: (editForm.phone || '').trim(),
      };

      if (!payload.fullName) {
        setError('Full Name is required');
        return;
      }
      if (!payload.email) {
        setError('Valid Email is required');
        return;
      }
      if (!payload.username) {
        setError('Username is required');
        return;
      }
      if (!payload.phone) {
        setError('Phone is required');
        return;
      }
      if (!isValidPhone(payload.phone)) {
        setError('Please enter a valid phone number');
        return;
      }

      if (editForm.role) {
        payload.role = editForm.role;
      } else if (currentAgentRoleInfo.name) {
        payload.role = currentAgentRoleInfo.name;
      }

      await updateAgent(editForm.id, payload);
      setEditOpen(false);
      setSuccess('Agent updated successfully');
      await fetchAgents();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update agent');
    }
  };

  const handlePassword = async () => {
    setPasswordError(null);
    try {
      await changeAgentPassword(passwordForm.id, passwordForm.newPassword);
      setPasswordOpen(false);
      setPasswordForm({ id: '', newPassword: '' });
      setSuccess('Password changed successfully');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Unable to change password');
    }
  };

  const handleToggleStatus = async (agent) => {
    try {
      await changeAgentStatus(agent._id, !agent.active);
      await fetchAgents();
      setSuccess(`${agent.fullName} ${agent.active ? 'deactivated' : 'activated'} successfully`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update status');
    }
  };

  const handleForceLogout = async (agent) => {
    try {
      await forceLogoutAgent(agent._id);
      setSuccess(`${agent.fullName} force logged out`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to force logout');
    }
  };

  const openEdit = (agent) => {
    const isCurrentActive = availableRoles.some(
      (r) => r.name.toLowerCase() === (agent.agentRole || '').toLowerCase()
    );
    setCurrentAgentRoleInfo({
      name: agent.agentRole || '',
      isInactive: !isCurrentActive && !!agent.agentRole
    });
    const safePhone = (agent.phone && !agent.phone.includes('@')) ? agent.phone : '';
    setEditForm({ 
      id: agent._id, 
      fullName: agent.fullName || '', 
      email: agent.email || '', 
      username: agent.username || '', 
      phone: safePhone,
      role: isCurrentActive ? (agent.agentRole || '') : ''
    });
    setEditOpen(true);
  };

  const openPassword = (agent) => {
    setPasswordForm({ id: agent._id, newPassword: '' });
    setPasswordError(null);
    setPasswordOpen(true);
  };

  const openDelete = (agent) => {
    setAgentToDelete(agent);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    setDeleting(true);
    try {
      await deleteAgent(agentToDelete._id);
      setDeleteOpen(false);
      setSuccess(`Agent ${agentToDelete.fullName || agentToDelete.username} and associated data deleted successfully`);
      setAgentToDelete(null);
      await fetchAgents();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Agent Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            size="small" 
            onClick={fetchAgents} 
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'rgba(234, 88, 12, 0.08)'
              }
            }}
          >
            <Refresh fontSize="small" sx={{ mr: 0.5 }} /> Refresh
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Add />} 
            onClick={handleOpenCreate} 
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)'
              }
            }}
          >
            Create Agent
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Paper 
        elevation={0} 
        sx={{ 
          borderRadius: 3, 
          border: '1px solid', 
          borderColor: 'divider', 
          overflow: 'hidden',
          bgcolor: 'background.paper'
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
            <CircularProgress sx={{ color: 'primary.main' }} />
          </Box>
        ) : (
          <TableContainer
            sx={{
              width: '100%',
              overflowX: 'auto',
              '&::-webkit-scrollbar': {
                height: 8,
              },
              '&::-webkit-scrollbar-track': {
                bgcolor: '#f1f5f9',
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: '#cbd5e1',
                borderRadius: 4,
                '&:hover': {
                  bgcolor: '#94a3b8',
                },
              },
            }}
          >
            <Table sx={{ minWidth: 1600 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      width: 220,
                      minWidth: 220,
                      maxWidth: 220,
                      boxSizing: 'border-box',
                      backgroundColor: '#f8fafc',
                      borderRight: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 220 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 130 }}>Username</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 140 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 100 }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}>Assigned Leads</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 100 }}>Won Leads</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 100 }}>Lost Leads</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 150 }}>Upcoming Follow-ups</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 140 }}>Overdue Follow-ups</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}>Conversion Rate</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 150 }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, textAlign: 'center', whiteSpace: 'nowrap', minWidth: 260 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} align="center" sx={{ py: 6 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 48, mb: 1 }}>👥</Typography>
                        <Typography color="text.secondary" fontWeight={500}>No agents found. Create your first agent to get started.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : agents.map((agent) => (
                  <TableRow
                    key={agent._id}
                    hover
                    sx={{
                      '&:hover': {
                        bgcolor: 'rgba(234, 88, 12, 0.04)',
                        '& > td.sticky-name-col': {
                          backgroundColor: '#f8fafc',
                        },
                      },
                    }}
                  >
                    <TableCell
                      className="sticky-name-col"
                      sx={{
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        left: 0,
                        zIndex: 5,
                        width: 220,
                        minWidth: 220,
                        maxWidth: 220,
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14, flexShrink: 0 }}>
                          {agent.fullName?.charAt(0)?.toUpperCase() || 'A'}
                        </Avatar>
                        <Typography fontWeight={500} noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {agent.fullName}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 220 }}>{agent.email}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 130 }}>{agent.username}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>{getDisplayPhone(agent.phone)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 140 }}>
                      <Chip
                        label={agent.agentRole || '—'}
                        size="small"
                        {...getRoleBadgeProps(agent.agentRole || '')}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                      <Chip
                        label={agent.active ? 'Active' : 'Inactive'}
                        color={agent.active ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 120 }}>
                      <Typography fontWeight={600} fontSize={13}>
                        {agent.assignedLeads ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 100 }}>
                      <Chip
                        label={agent.wonLeads ?? 0}
                        size="small"
                        color={agent.wonLeads > 0 ? 'success' : 'default'}
                        variant={agent.wonLeads > 0 ? 'filled' : 'outlined'}
                        sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 100 }}>
                      <Chip
                        label={agent.lostLeads ?? 0}
                        size="small"
                        color={agent.lostLeads > 0 ? 'error' : 'default'}
                        variant={agent.lostLeads > 0 ? 'filled' : 'outlined'}
                        sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 150 }}>
                      <Chip
                        label={agent.upcomingFollowUps ?? 0}
                        size="small"
                        color={agent.upcomingFollowUps > 0 ? 'primary' : 'default'}
                        variant={agent.upcomingFollowUps > 0 ? 'filled' : 'outlined'}
                        sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 140 }}>
                      <Chip
                        label={agent.overdueFollowUps ?? 0}
                        size="small"
                        color={agent.overdueFollowUps > 0 ? 'error' : 'default'}
                        variant={agent.overdueFollowUps > 0 ? 'filled' : 'outlined'}
                        sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ minWidth: 120 }}>
                      <Typography
                        fontWeight={600}
                        fontSize={13}
                        color={parseFloat(agent.conversionRate) > 0 ? 'success.main' : 'text.secondary'}
                      >
                        {agent.conversionRate || '0.0%'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 150 }}>
                      {agent.lastLoginAt ? new Date(agent.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 260 }}>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                        <Button size="small" variant="text" onClick={() => openEdit(agent)} sx={{ color: 'primary.main', minWidth: 'auto', p: 0.5 }} title="Edit Agent"><Edit fontSize="small" /></Button>
                        <Button size="small" variant="text" onClick={() => openPassword(agent)} sx={{ color: 'warning.main', minWidth: 'auto', p: 0.5 }} title="Change Password"><Lock fontSize="small" /></Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color={agent.active ? 'error' : 'success'}
                          onClick={() => handleToggleStatus(agent)}
                          sx={{ textTransform: 'none', fontSize: 11, borderRadius: 1.5, whiteSpace: 'nowrap' }}
                        >
                          {agent.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color="warning"
                          onClick={() => handleForceLogout(agent)}
                          sx={{ textTransform: 'none', fontSize: 11, whiteSpace: 'nowrap' }}
                        >
                          Force Logout
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          onClick={() => openDelete(agent)}
                          sx={{ minWidth: 'auto', p: 0.5 }}
                          title="Delete Agent & Data"
                        >
                          <Delete fontSize="small" />
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create Dialog */}
      <Dialog 
        open={createOpen} 
        onClose={handleCloseCreate} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          component: 'form',
          onSubmit: (e) => {
            e.preventDefault();
            handleCreate();
          },
          autoComplete: 'off',
        }}
      >
        <DialogTitle>Create New Agent</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                required 
                label="Full Name" 
                name="fullName"
                id="create-agent-fullname"
                value={createForm.fullName} 
                onChange={handleCreateChange('fullName')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required 
                label="Email" 
                type="email" 
                name="email"
                id="create-agent-email"
                value={createForm.email} 
                onChange={handleCreateChange('email')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required 
                label="Username" 
                name="username"
                id="create-agent-username"
                value={createForm.username} 
                onChange={handleCreateChange('username')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required 
                label="Phone" 
                type="tel"
                name="phone"
                id="create-agent-phone"
                placeholder="Enter phone number"
                value={createForm.phone} 
                onChange={handleCreateChange('phone')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel id="create-agent-role-label">Role</InputLabel>
                <Select
                  labelId="create-agent-role-label"
                  id="create-agent-role"
                  name="role"
                  value={createForm.role}
                  label="Role"
                  onChange={handleCreateChange('role')}
                >
                  {availableRoles.map((r) => (
                    <MenuItem key={r._id || r.name} value={r.name}>{r.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                required 
                label="Password" 
                type="password" 
                name="password"
                id="create-agent-password"
                value={createForm.password} 
                onChange={handleCreateChange('password')} 
                autoComplete="new-password"
                inputProps={{ autoComplete: 'new-password' }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseCreate} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} sx={{ borderRadius: 2, textTransform: 'none' }}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog 
        open={editOpen} 
        onClose={() => setEditOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          component: 'form',
          onSubmit: (e) => {
            e.preventDefault();
            handleEdit();
          },
          autoComplete: 'off',
        }}
      >
        <DialogTitle>Edit Agent</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                required
                label="Full Name" 
                name="fullName"
                id="edit-agent-fullname"
                value={editForm.fullName} 
                onChange={handleEditChange('fullName')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required
                label="Email" 
                type="email" 
                name="email"
                id="edit-agent-email"
                value={editForm.email} 
                onChange={handleEditChange('email')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required
                label="Username" 
                name="username"
                id="edit-agent-username"
                value={editForm.username} 
                onChange={handleEditChange('username')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required
                label="Phone" 
                type="tel"
                name="phone"
                id="edit-agent-phone"
                placeholder="Enter phone number"
                value={editForm.phone} 
                onChange={handleEditChange('phone')} 
                autoComplete="off"
                inputProps={{ autoComplete: 'off' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="edit-agent-role-label">Role</InputLabel>
                <Select
                  labelId="edit-agent-role-label"
                  id="edit-agent-role"
                  value={editForm.role}
                  label="Role"
                  displayEmpty={currentAgentRoleInfo.isInactive}
                  renderValue={(selected) => {
                    if (!selected && currentAgentRoleInfo.isInactive) {
                      return <span style={{ color: '#64748b' }}>Keep current ({currentAgentRoleInfo.name})</span>;
                    }
                    return selected;
                  }}
                  onChange={handleEditChange('role')}
                >
                  {availableRoles.map((r) => (
                    <MenuItem key={r._id || r.name} value={r.name}>{r.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {currentAgentRoleInfo.isInactive && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Current role <strong>{currentAgentRoleInfo.name}</strong> is inactive. Existing assignment is kept unless you select a new active role above.
                </Typography>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} sx={{ borderRadius: 2, textTransform: 'none' }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordOpen} onClose={() => setPasswordOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}
          <TextField fullWidth label="New Password" type="password" value={passwordForm.newPassword} onChange={handlePasswordChange('newPassword')} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPasswordOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handlePassword} disabled={!passwordForm.newPassword || passwordForm.newPassword.length < 6} sx={{ borderRadius: 2, textTransform: 'none' }}>Change</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Agent Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, color: 'error.main' }}>
          Delete Agent & Associated Data
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.primary' }}>
            Are you sure you want to permanently delete agent <strong>{agentToDelete?.fullName || agentToDelete?.username}</strong>?
          </Typography>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            This action is irreversible. All leads, activities, call logs, demos, sessions, and records associated with this agent will be permanently removed.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            sx={{ borderRadius: 2, textTransform: 'none', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)' }}
          >
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}