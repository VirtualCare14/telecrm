import React, { useState } from 'react';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Box, Typography, Skeleton, TableContainer, Paper,
  Button, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Alert
} from '@mui/material';
import {
  KeyboardArrowDown, Delete as DeleteIcon, Visibility, PhoneInTalk,
  Schedule, DirectionsWalk, Event as EventIcon, AssignmentInd,
  PersonAdd, SwapHoriz, EmojiEvents, Cancel, WarningAmber,
  WhatsApp as WhatsAppIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { formatDateTime } from '../utils/dateHelpers';
import { getLeadActionMenuItems } from '../utils/leadActionHelper';
import { deleteLead } from '../services/leadsService';

export default function LeadTable({ leads, loading, onLeadDeleted, onDeleteLead }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = Boolean(
    user?.role?.toUpperCase() === 'ADMIN' ||
    (user?.agentRole && user.agentRole.toLowerCase() === 'admin') ||
    user?.username?.toLowerCase() === 'admin'
  );

  // Action Menu state
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const [actionMenuLead, setActionMenuLead] = useState(null);

  // Delete Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleOpenActionMenu = (event, lead) => {
    event.stopPropagation();
    setActionMenuAnchorEl(event.currentTarget);
    setActionMenuLead(lead);
  };

  const handleCloseActionMenu = () => {
    setActionMenuAnchorEl(null);
    setActionMenuLead(null);
  };

  const handleSelectAction = (actionKey) => {
    const targetLead = actionMenuLead;
    handleCloseActionMenu();
    if (!targetLead) return;

    if (actionKey === 'delete_lead') {
      if (onDeleteLead) {
        onDeleteLead(targetLead);
      } else {
        setLeadToDelete(targetLead);
        setDeleteError(null);
        setDeleteDialogOpen(true);
      }
    } else if (actionKey === 'view_lead') {
      navigate(`/leads/${targetLead._id}`);
    } else {
      navigate(`/leads/${targetLead._id}?action=${actionKey}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!leadToDelete?._id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteLead(leadToDelete._id);
      setDeleteDialogOpen(false);
      const deleted = leadToDelete;
      setLeadToDelete(null);
      if (onLeadDeleted) {
        onLeadDeleted(deleted);
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete lead. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const renderActionMenuIcon = (key) => {
    switch (key) {
      case 'log_call':
        return <PhoneInTalk sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'schedule_followup':
        return <Schedule sx={{ fontSize: 16, color: '#0284c7' }} />;
      case 'schedule_walkin':
        return <DirectionsWalk sx={{ fontSize: 16, color: '#059669' }} />;
      case 'schedule_demo':
        return <EventIcon sx={{ fontSize: 16, color: '#4f46e5' }} />;
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
      case 'delete_lead':
        return <DeleteIcon sx={{ fontSize: 16, color: '#dc2626' }} />;
      case 'view_lead':
      default:
        return <Visibility sx={{ fontSize: 16, color: '#64748b' }} />;
    }
  };

  const colCount = isAdmin ? 10 : 9;

  if (loading) {
    return (
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              {['Lead #', 'Organization', 'Primary Contact', 'Phone', 'Source', 'Latest Disposition', 'Follow-up', 'Owner', 'Status'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
              ))}
              {isAdmin && <TableCell align="center" sx={{ fontWeight: 600 }}>Action</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(colCount)].map((_, j) => (
                  <TableCell key={j}><Skeleton /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <>
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Lead #</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Organization</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Primary Contact</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Phone</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Source</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Latest Disposition</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Follow-up</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Owner</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Status</TableCell>
              {isAdmin && (
                <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13 }}>Action</TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No leads found</Typography>
                </TableCell>
              </TableRow>
            ) : leads.map((l) => {
              const isOverdue = l.nextFollowUpAt && l.closureStatus === 'OPEN' && new Date(l.nextFollowUpAt) < new Date();
              const isUpcoming = l.nextFollowUpAt && l.closureStatus === 'OPEN' && new Date(l.nextFollowUpAt) >= new Date();
              const isClosed = l.closureStatus !== 'OPEN';
              return (
                <TableRow
                  key={l._id}
                  hover
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.04)' } }}
                  onClick={() => navigate(`/leads/${l._id}`)}
                >
                  <TableCell>
                    <Typography fontWeight={600} fontSize={13}>
                      {l.leadNumber}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={500} fontSize={13}>
                      {l.organizationName}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{l.primaryContact?.name || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{l.primaryContact?.phone || '—'}</TableCell>
                  <TableCell>
                    <Chip label={l.leadSource} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13 }}>{l.latestDisposition || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    {l.nextFollowUpAt ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap' }}>
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: isOverdue ? 'error.main' : isUpcoming ? '#38bdf8' : 'text.secondary',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatDateTime(l.nextFollowUpAt)}
                        </Typography>
                        {isOverdue && (
                          <Chip
                            label="Overdue"
                            size="small"
                            color="error"
                            sx={{ height: 20, fontSize: 10, fontWeight: 600, borderRadius: 1.5 }}
                          />
                        )}
                        {isUpcoming && (
                          <Chip
                            label="Upcoming"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 600,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                            }}
                          />
                        )}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 12 }} color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{l.currentOwner?.fullName || l.currentOwner?.username || '—'}</TableCell>
                  <TableCell>
                    {isClosed ? (
                      <Chip
                        label={l.closureStatus}
                        size="small"
                        color={l.closureStatus === 'WON' ? 'success' : 'error'}
                        clickable
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/leads/${l._id}`);
                        }}
                        sx={{ height: 22, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      />
                    ) : (
                      <Chip
                        label="Open"
                        size="small"
                        variant="outlined"
                        clickable
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/leads/${l._id}`);
                        }}
                        sx={{ height: 22, fontSize: 11, cursor: 'pointer' }}
                      />
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant="contained"
                        endIcon={<KeyboardArrowDown sx={{ fontSize: 15 }} />}
                        onClick={(e) => handleOpenActionMenu(e, l)}
                        sx={{
                          borderRadius: 1.5,
                          textTransform: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          py: 0.4,
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
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Unified Action Dropdown Menu */}
      <Menu
        anchorEl={actionMenuAnchorEl}
        open={Boolean(actionMenuAnchorEl && actionMenuLead)}
        onClose={handleCloseActionMenu}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: {
            minWidth: 200,
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
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
          let items = getLeadActionMenuItems(actionMenuLead, user, isAdmin);
          if (isAdmin) {
            if (!items.some((it) => it.key === 'delete_lead')) {
              items = [
                ...items,
                {
                  key: 'delete_lead',
                  label: 'Delete Lead',
                  category: 'delete',
                  color: '#dc2626',
                },
              ];
            }
          } else {
            items = items.filter((it) => it.key !== 'delete_lead');
          }
          const menuElements = [];
          let lastCategory = null;

          items.forEach((item, index) => {
            const currentGroup = (item.category === 'call' || item.category === 'followup') ? 'call_group' : item.category;
            if (lastCategory && lastCategory !== currentGroup) {
              menuElements.push(<Divider key={`tbl-act-div-${index}`} sx={{ my: 0.5, borderColor: '#f1f5f9' }} />);
            }
            lastCategory = currentGroup;

            menuElements.push(
              <MenuItem
                key={item.key}
                onClick={() => handleSelectAction(item.key)}
                sx={{
                  py: 0.8,
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
                <ListItemIcon sx={{ minWidth: 26 }}>
                  {renderActionMenuIcon(item.key)}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: 13,
                    fontWeight: item.key === 'delete_lead' ? 700 : 500,
                    color: item.color || '#334155',
                  }}
                />
              </MenuItem>
            );
          });

          return menuElements;
        })()}
      </Menu>

      {/* Delete Lead Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={deleting ? undefined : () => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, color: '#dc2626' }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              bgcolor: 'rgba(220, 38, 38, 0.12)',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DeleteIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} fontSize={17}>
              Delete Lead Permanently
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This action cannot be undone
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 1.5 }}>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" sx={{ mb: 2, color: 'text.primary' }}>
            Are you sure you want to delete lead{' '}
            <strong>"{leadToDelete?.organizationName}"</strong> ({leadToDelete?.leadNumber})?
          </Typography>
          <Alert severity="warning" icon={<WarningAmber />} sx={{ borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              All associated data will be removed:
            </Typography>
            <Box component="ul" sx={{ pl: 2, m: 0, fontSize: 12, lineHeight: 1.6 }}>
              <li>Contact persons and numbers</li>
              <li>Activity history and call logs</li>
              <li>Scheduled demos and walk-in records</li>
              <li>Follow-ups and ownership records</li>
            </Box>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1, gap: 1 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            disabled={deleting}
            variant="contained"
            color="error"
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: '#dc2626',
              '&:hover': { bgcolor: '#b91c1c' },
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Lead'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}