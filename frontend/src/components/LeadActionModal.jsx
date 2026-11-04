import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Divider,
} from '@mui/material';
import { Close as CloseIcon, LocalFireDepartment, Whatshot, AcUnit } from '@mui/icons-material';
import { LEAD_TEMPERATURES, LEAD_DISPOSITIONS } from '../utils/constants';
import { updateLeadClassification } from '../services/leadsService';

/**
 * LeadActionModal
 * Provides direct Lead Temperature (Hot, Warm, Cold) and Disposition classification
 * inside a modal without navigating away.
 */
export default function LeadActionModal({ open, onClose, lead, onUpdated }) {
  const [temperature, setTemperature] = useState('');
  const [disposition, setDisposition] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (lead && open) {
      // Initialize with existing lead temperature and disposition
      const initialTemp = lead.leadTemperature || lead.temperature || lead.classification?.temperature || '';
      setTemperature(initialTemp ? (initialTemp.charAt(0).toUpperCase() + initialTemp.slice(1).toLowerCase()) : '');
      setDisposition(lead.disposition || lead.latestDisposition || '');
      setRemark('');
      setError(null);
      setSuccess(false);
    }
  }, [lead, open]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!lead?._id) return;

    if (!temperature && !disposition) {
      setError('Please select at least a Lead Temperature or Disposition.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        leadTemperature: temperature || undefined,
        temperature: temperature || undefined,
        disposition: disposition || undefined,
        remark: remark.trim() || undefined,
      };

      const res = await updateLeadClassification(lead._id, payload);
      setSuccess(true);
      if (onUpdated) {
        onUpdated(res.lead || { ...lead, ...payload });
      }
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err) {
      console.error('Failed to update lead classification:', err);
      setError(err.response?.data?.message || 'Failed to update classification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: 2,
          px: 3,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', fontSize: '1.1rem' }}>
            Lead Action & Classification
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {lead.organizationName} {lead.leadNumber ? `(#${lead.leadNumber})` : ''}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} disabled={submitting}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ p: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }}>
              Lead classification updated successfully!
            </Alert>
          )}

          {/* Hospital Info Box */}
          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 3,
              bgcolor: 'rgba(234, 88, 12, 0.04)',
              border: '1px solid rgba(234, 88, 12, 0.15)',
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }}>
                {lead.organizationName}
              </Typography>
              <Chip
                label={lead.leadSource || 'Manual'}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: 11 }}
              />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
              Contact: <strong>{lead.primaryContact?.name || 'Receptionist'}</strong>
              {lead.primaryContact?.phone ? ` • ${lead.primaryContact.phone}` : ''}
              {lead.primaryContact?.designation ? ` (${lead.primaryContact.designation})` : ''}
            </Typography>
          </Paper>

          {/* Temperature Field */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#1e293b' }}>
              Lead Temperature *
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Classify hospital engagement level (Hot, Warm, or Cold):
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              {LEAD_TEMPERATURES.map((t) => {
                const isSelected = temperature.toLowerCase() === t.value.toLowerCase();
                return (
                  <Paper
                    key={t.value}
                    elevation={0}
                    onClick={() => setTemperature(t.value)}
                    sx={{
                      p: 1.5,
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderRadius: 2,
                      border: '2px solid',
                      borderColor: isSelected ? t.color : '#e2e8f0',
                      bgcolor: isSelected ? t.bg : '#ffffff',
                      transition: 'all 0.15s ease-in-out',
                      '&:hover': {
                        borderColor: t.color,
                        bgcolor: t.bg,
                      },
                    }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      sx={{ color: isSelected ? t.color : '#334155', fontSize: '0.95rem' }}
                    >
                      {t.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontSize: 11,
                        color: isSelected ? t.color : 'text.secondary',
                        mt: 0.5,
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {t.value === 'Hot' ? 'High Intent' : t.value === 'Warm' ? 'Engaged' : 'Low Interest'}
                    </Typography>
                  </Paper>
                );
              })}
            </Box>
          </Box>

          <Divider sx={{ my: 2.5 }} />

          {/* Disposition Dropdown */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#1e293b' }}>
              Disposition *
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Select the current outcome or next operational stage (independent of temperature):
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="disposition-select-label">Select Disposition</InputLabel>
              <Select
                labelId="disposition-select-label"
                value={disposition}
                label="Select Disposition"
                onChange={(e) => setDisposition(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {LEAD_DISPOSITIONS.map((disp) => (
                  <MenuItem key={disp} value={disp}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography fontSize={13} fontWeight={disposition === disp ? 700 : 500}>
                        {disp}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Action / Classification Remark */}
          <Box>
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Action Remarks (Optional)"
              placeholder="Add key remarks about the classification change, client feedback, or notes..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2.5, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
          <Button
            onClick={onClose}
            disabled={submitting}
            sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            startIcon={submitting && <CircularProgress size={16} color="inherit" />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              px: 3,
              bgcolor: 'primary.main',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            {submitting ? 'Saving...' : 'Save Classification'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

