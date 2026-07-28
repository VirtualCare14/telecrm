import React, { useEffect, useState } from 'react';
import {
  Box, Button, Typography, Paper, TextField, Table, TableBody,
  TableCell, TableHead, TableRow, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Chip, Grid, TableContainer, Avatar
} from '@mui/material';
import { Add, Edit, Lock, Refresh } from '@mui/icons-material';
import { getAgents, createAgent, updateAgent, changeAgentStatus, changeAgentPassword, forceLogoutAgent } from '../services/agentService';

export default function AdminAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create Agent dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: '', email: '', username: '', phone: '', password: '' });
  const [createError, setCreateError] = useState(null);

  // Edit Agent dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', fullName: '', email: '', username: '', phone: '' });

  // Password dialog
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ id: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState(null);

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

  useEffect(() => { fetchAgents(); }, []);

  const handleCreateChange = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const handleEditChange = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));
  const handlePasswordChange = (f) => (e) => setPasswordForm((p) => ({ ...p, [f]: e.target.value }));

  const handleCreate = async () => {
    setCreateError(null);
    try {
      await createAgent(createForm);
      setCreateOpen(false);
      setCreateForm({ fullName: '', email: '', username: '', phone: '', password: '' });
      setSuccess('Agent created successfully');
      await fetchAgents();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create agent');
    }
  };

  const handleEdit = async () => {
    try {
      await updateAgent(editForm.id, { 
        fullName: editForm.fullName, 
        email: editForm.email, 
        username: editForm.username, 
        phone: editForm.phone 
      });
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
    setEditForm({ id: agent._id, fullName: agent.fullName || '', email: agent.email || '', username: agent.username || '', phone: agent.phone || '' });
    setEditOpen(true);
  };

  const openPassword = (agent) => {
    setPasswordForm({ id: agent._id, newPassword: '' });
    setPasswordError(null);
    setPasswordOpen(true);
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
                bgcolor: 'rgba(25, 118, 210, 0.08)'
              }
            }}
          >
            <Refresh fontSize="small" sx={{ mr: 0.5 }} /> Refresh
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Add />} 
            onClick={() => setCreateOpen(true)} 
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)'
              }
            }}
          >
            Create Agent
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Username</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 48, mb: 1 }}>👥</Typography>
                        <Typography color="text.secondary" fontWeight={500}>No agents found. Create your first agent to get started.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : agents.map((agent) => (
                  <TableRow key={agent._id} hover sx={{ '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.02)' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                          {agent.fullName?.charAt(0)?.toUpperCase() || 'A'}
                        </Avatar>
                        <Typography fontWeight={500}>{agent.fullName}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{agent.email}</TableCell>
                    <TableCell>{agent.username}</TableCell>
                    <TableCell>{agent.phone || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={agent.active ? 'Active' : 'Inactive'}
                        color={agent.active ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 600, borderRadius: 1.5 }}
                      />
                    </TableCell>
                    <TableCell>
                      {agent.lastLoginAt ? new Date(agent.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Button size="small" variant="text" onClick={() => openEdit(agent)} sx={{ color: 'primary.main' }}><Edit fontSize="small" /></Button>
                        <Button size="small" variant="text" onClick={() => openPassword(agent)} sx={{ color: 'warning.main' }}><Lock fontSize="small" /></Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color={agent.active ? 'error' : 'success'}
                          onClick={() => handleToggleStatus(agent)}
                          sx={{ textTransform: 'none', fontSize: 11, borderRadius: 1.5 }}
                        >
                          {agent.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color="warning"
                          onClick={() => handleForceLogout(agent)}
                          sx={{ textTransform: 'none', fontSize: 11 }}
                        >
                          Force Logout
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
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Agent</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth required label="Full Name" value={createForm.fullName} onChange={handleCreateChange('fullName')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth required label="Email" type="email" value={createForm.email} onChange={handleCreateChange('email')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth required label="Username" value={createForm.username} onChange={handleCreateChange('username')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Phone" value={createForm.phone} onChange={handleCreateChange('phone')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth required label="Password" type="password" value={createForm.password} onChange={handleCreateChange('password')} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} sx={{ borderRadius: 2, textTransform: 'none' }}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Agent</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth label="Full Name" value={editForm.fullName} onChange={handleEditChange('fullName')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Email" type="email" value={editForm.email} onChange={handleEditChange('email')} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Username" value={editForm.username} onChange={handleEditChange('username')} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Phone" value={editForm.phone} onChange={handleEditChange('phone')} /></Grid>
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
    </Box>
  );
}