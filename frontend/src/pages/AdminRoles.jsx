import React, { useEffect, useState } from 'react';
import {
  Box, Button, Typography, Paper, TextField, Table, TableBody,
  TableCell, TableHead, TableRow, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Chip, Grid, TableContainer, Tooltip, Switch
} from '@mui/material';
import { Add, Edit, Delete, Refresh, AssignmentInd } from '@mui/icons-material';
import { getRoles, createRole, updateRole, deleteRole, changeRoleStatus } from '../services/roleService';
import { formatDate } from '../utils/dateHelpers';

export default function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create Role dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [createError, setCreateError] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Role dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', description: '' });
  const [editError, setEditError] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete Role dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Status toggle loading state
  const [statusLoadingId, setStatusLoadingId] = useState(null);

  const fetchRoles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRoles();
      setRoles(data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleOpenCreate = () => {
    setCreateForm({ name: '', description: '' });
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreateForm({ name: '', description: '' });
    setCreateError(null);
  };

  const handleCreate = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCreateError(null);

    const name = (createForm.name || '').trim();
    if (!name) {
      setCreateError('Role name is required');
      return;
    }

    setCreateLoading(true);
    try {
      await createRole({
        name,
        description: (createForm.description || '').trim(),
      });
      handleCloseCreate();
      setSuccess(`Role "${name}" created successfully`);
      await fetchRoles();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create role');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEdit = (role) => {
    setEditForm({
      id: role._id,
      name: role.name || '',
      description: role.description || '',
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditForm({ id: '', name: '', description: '' });
    setEditError(null);
  };

  const handleEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setEditError(null);

    const name = (editForm.name || '').trim();
    if (!name) {
      setEditError('Role name is required');
      return;
    }

    setEditLoading(true);
    try {
      await updateRole(editForm.id, {
        name,
        description: (editForm.description || '').trim(),
      });
      handleCloseEdit();
      setSuccess(`Role "${name}" updated successfully`);
      await fetchRoles();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update role');
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenDelete = (role) => {
    setRoleToDelete(role);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleCloseDelete = () => {
    setDeleteOpen(false);
    setRoleToDelete(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteRole(roleToDelete._id);
      handleCloseDelete();
      setSuccess(`Role "${roleToDelete.name}" deleted successfully`);
      await fetchRoles();
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete role');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleStatus = async (role) => {
    setStatusLoadingId(role._id);
    setError(null);
    try {
      const newStatus = role.active === false ? true : false;
      await changeRoleStatus(role._id, newStatus);
      setSuccess(`Role "${role.name}" is now ${newStatus ? 'Active' : 'Inactive'}`);
      setRoles((prev) =>
        prev.map((r) =>
          r._id === role._id ? { ...r, active: newStatus } : r
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update role status');
    } finally {
      setStatusLoadingId(null);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
            Role Management
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Configure and manage dynamic roles for your CRM sales team
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            size="small" 
            onClick={fetchRoles} 
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
            Create Role
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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, minWidth: 180, bgcolor: '#f8fafc' }}>
                    Role Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, minWidth: 240, bgcolor: '#f8fafc' }}>
                    Description
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, minWidth: 120, bgcolor: '#f8fafc' }}>
                    Status
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, minWidth: 140, bgcolor: '#f8fafc' }}>
                    Assigned Agents
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, minWidth: 140, bgcolor: '#f8fafc' }}>
                    Created Date
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, minWidth: 160, bgcolor: '#f8fafc' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <AssignmentInd sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                        <Typography color="text.secondary" fontWeight={500}>
                          No roles found. Click &ldquo;Create Role&rdquo; to add your first role.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => (
                    <TableRow 
                      key={role._id} 
                      hover
                      sx={{
                        '&:hover': {
                          bgcolor: 'rgba(234, 88, 12, 0.04)',
                        }
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600, color: 'text.primary' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Chip
                            label={role.name}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              borderRadius: 1.5,
                              fontSize: 12,
                              borderColor: '#ea580c',
                              color: '#ea580c',
                              bgcolor: 'rgba(234, 88, 12, 0.08)'
                            }}
                            variant="outlined"
                          />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                        {role.description || '—'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={role.active !== false ? 'Active' : 'Inactive'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            borderRadius: 1.5,
                            fontSize: 12,
                            ...(role.active !== false
                              ? {
                                  borderColor: '#16a34a',
                                  color: '#16a34a',
                                  bgcolor: 'rgba(22, 163, 74, 0.08)',
                                }
                              : {
                                  borderColor: '#94a3b8',
                                  color: '#64748b',
                                  bgcolor: 'rgba(148, 163, 184, 0.12)',
                                }),
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${role.agentCount ?? 0} agent${(role.agentCount ?? 0) === 1 ? '' : 's'}`}
                          size="small"
                          color={(role.agentCount ?? 0) > 0 ? 'primary' : 'default'}
                          variant={(role.agentCount ?? 0) > 0 ? 'filled' : 'outlined'}
                          sx={{ 
                            fontWeight: 600, 
                            borderRadius: 1.5,
                            fontSize: 12,
                            ...((role.agentCount ?? 0) > 0 ? { bgcolor: '#ea580c', color: '#ffffff' } : {})
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                        {formatDate(role.createdAt)}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                          <Tooltip title="Edit Role">
                            <IconButton 
                              size="small" 
                              onClick={() => handleOpenEdit(role)} 
                              sx={{ 
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.08)' }
                              }}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {/* Active/Inactive status toggle control next to Delete action */}
                          <Tooltip title={role.active !== false ? 'Role is Active (Click to deactivate)' : 'Role is Inactive (Click to activate)'}>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                              {statusLoadingId === role._id ? (
                                <CircularProgress size={18} sx={{ mx: 0.5, color: 'primary.main' }} />
                              ) : (
                                <Switch
                                  size="small"
                                  checked={role.active !== false}
                                  onChange={() => handleToggleStatus(role)}
                                  inputProps={{ 'aria-label': `Toggle status for ${role.name}` }}
                                  sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                      color: '#16a34a',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                      backgroundColor: '#16a34a',
                                    },
                                  }}
                                />
                              )}
                            </Box>
                          </Tooltip>

                          <Tooltip 
                            title={
                              role.agentCount > 0 
                                ? `Cannot delete: ${role.agentCount} agent(s) assigned. Please reassign those agents first.` 
                                : 'Delete Role'
                            }
                          >
                            <span>
                              <IconButton 
                                size="small" 
                                color="error" 
                                onClick={() => handleOpenDelete(role)}
                                disabled={role.agentCount > 0}
                                sx={{
                                  '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.08)' }
                                }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create Role Dialog */}
      <Dialog 
        open={createOpen} 
        onClose={handleCloseCreate} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          component: 'form',
          onSubmit: handleCreate,
          autoComplete: 'off',
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Role</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{createError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                required 
                autoFocus
                label="Role Name" 
                placeholder="e.g. Senior Consultant"
                value={createForm.name} 
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                multiline
                rows={3}
                label="Description" 
                placeholder="Describe responsibilities or scope of this role (optional)"
                value={createForm.description} 
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseCreate} disabled={createLoading} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={createLoading || !createForm.name.trim()} 
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)' 
            }}
          >
            {createLoading ? 'Creating...' : 'Create Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog 
        open={editOpen} 
        onClose={handleCloseEdit} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          component: 'form',
          onSubmit: handleEdit,
          autoComplete: 'off',
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Role</DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{editError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                required 
                autoFocus
                label="Role Name" 
                value={editForm.name} 
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                fullWidth 
                multiline
                rows={3}
                label="Description" 
                value={editForm.description} 
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseEdit} disabled={editLoading} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={editLoading || !editForm.name.trim()} 
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)' 
            }}
          >
            {editLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={handleCloseDelete} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Role</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
          <Typography variant="body1">
            Are you sure you want to delete the role <strong>&ldquo;{roleToDelete?.name}&rdquo;</strong>?
          </Typography>
          {roleToDelete?.agentCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
              Cannot delete role &ldquo;{roleToDelete.name}&rdquo; because it is currently assigned to {roleToDelete.agentCount} agent(s). Please reassign those agents before deleting this role.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDelete} disabled={deleteLoading} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleDelete} 
            disabled={deleteLoading || (roleToDelete?.agentCount > 0)}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
