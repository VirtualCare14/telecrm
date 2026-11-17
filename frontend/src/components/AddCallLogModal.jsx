import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import { Phone, Close, CheckCircle } from '@mui/icons-material';
import CalendarDatePicker from './CalendarDatePicker';
import {
  formatDateToYYYYMMDD,
  formatTimeTo24H,
  combineDateAndTime,
} from '../utils/dateHelpers';
import { CALL_DISPOSITIONS, SOFTWARE_OPTIONS } from '../utils/constants';
import { createCallLog, getLeadContacts } from '../services/leadsService';

/**
 * Reusable AddCallLogModal
 *
 * Props:
 * - open: boolean
 * - onClose: () => void (handles cancellation/close)
 * - lead: { _id, organizationName, leadNumber, customLeadId, leadTemperature, existingSoftwareUsed, softwareName, primaryContact }
 * - initialContacts: optional array of contacts
 * - onSuccess: (callLog, lead) => void
 */
export default function AddCallLogModal({
  open,
  onClose,
  lead,
  initialContacts = null,
  onSuccess,
}) {
  const [contacts, setContacts] = useState(initialContacts || []);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [savingCall, setSavingCall] = useState(false);
  const [callError, setCallError] = useState(null);

  const [callData, setCallData] = useState({
    calledContactId: '',
    calledContactName: '',
    calledContactPhone: '',
    callDate: formatDateToYYYYMMDD(new Date()),
    callTime: formatTimeTo24H(new Date()),
    leadTemperature: '',
    disposition: '',
    remark: '',
    followUpDate: '',
    followUpTime: '10:00',
    existingSoftwareUsed: '',
    softwareName: '',
  });

  // Reset form and load contacts when modal opens or lead changes
  useEffect(() => {
    if (!open || !lead?._id) return;

    setCallError(null);
    setSavingCall(false);

    const initTime = formatTimeTo24H(new Date());
    const initDate = formatDateToYYYYMMDD(new Date());

    setCallData({
      calledContactId: lead.primaryContact?._id || '',
      calledContactName: lead.primaryContact?.name || '',
      calledContactPhone: lead.primaryContact?.phone || '',
      callDate: initDate,
      callTime: initTime,
      leadTemperature: lead.leadTemperature || '',
      disposition: '',
      remark: '',
      followUpDate: '',
      followUpTime: '10:00',
      existingSoftwareUsed: lead.existingSoftwareUsed || '',
      softwareName: lead.softwareName || '',
    });

    if (initialContacts && Array.isArray(initialContacts) && initialContacts.length > 0) {
      setContacts(initialContacts);
      if (!lead.primaryContact?._id) {
        const prim = initialContacts.find((c) => c.isPrimary) || initialContacts[0];
        if (prim) {
          setCallData((p) => ({
            ...p,
            calledContactId: prim._id,
            calledContactName: prim.name,
            calledContactPhone: prim.phone || '',
          }));
        }
      }
    } else {
      // Fetch fresh contacts for this lead
      setLoadingContacts(true);
      getLeadContacts(lead._id)
        .then((fetched) => {
          const list = fetched || [];
          setContacts(list);
          const prim = list.find((c) => c.isPrimary) || list[0];
          if (prim && !callData.calledContactId) {
            setCallData((p) => ({
              ...p,
              calledContactId: prim._id,
              calledContactName: prim.name,
              calledContactPhone: prim.phone || '',
            }));
          }
        })
        .catch(() => {
          setContacts([]);
        })
        .finally(() => {
          setLoadingContacts(false);
        });
    }
  }, [open, lead?._id]);

  const handleSave = async () => {
    setCallError(null);

    const hasContact = Boolean(callData.calledContactId || callData.calledContactName?.trim());
    if (!hasContact) {
      setCallError('Please select an existing contact or enter a contact person name');
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
    if (!callData.remark?.trim()) {
      setCallError('Call Remark is required');
      return;
    }
    if (callData.followUpDate) {
      const fuIso = combineDateAndTime(callData.followUpDate, callData.followUpTime || '10:00');
      if (!fuIso) {
        setCallError('Please provide a valid Follow-up Date and Time');
        return;
      }
    }

    setSavingCall(true);
    try {
      const calledAt =
        combineDateAndTime(callData.callDate, callData.callTime) || new Date().toISOString();
      const followUpAt = callData.followUpDate
        ? combineDateAndTime(callData.followUpDate, callData.followUpTime || '10:00')
        : undefined;

      const payload = {
        calledContactId: callData.calledContactId || undefined,
        calledContactName: callData.calledContactName?.trim() || undefined,
        calledContactPhone: callData.calledContactPhone?.trim() || undefined,
        calledAt,
        leadTemperature: callData.leadTemperature || undefined,
        disposition: callData.disposition,
        remark: callData.remark.trim(),
        followUpAt,
        existingSoftwareUsed: callData.existingSoftwareUsed || undefined,
        softwareName: callData.softwareName?.trim() || undefined,
      };

      const res = await createCallLog(lead._id, payload);

      // Notify global app listeners to refresh dashboards and drawers
      window.dispatchEvent(
        new CustomEvent('telecrm:lead-updated', {
          detail: { leadId: lead._id },
        })
      );

      if (onSuccess) {
        onSuccess(res, lead);
      }
    } catch (err) {
      setCallError(err.response?.data?.message || 'Unable to save call log');
    } finally {
      setSavingCall(false);
    }
  };

  if (!open || !lead) return null;

  const leadOrg = lead.organizationName || 'Hospital';
  const leadNum = lead.leadNumber || lead.customLeadId || '';

  return (
    <Dialog
      open={open}
      onClose={() => !savingCall && onClose && onClose()}
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
        <Phone sx={{ color: 'primary.main', fontSize: 24 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem' }}>
              Add Call Log
            </Typography>
            {leadNum && (
              <Chip
                label={`#${leadNum}`}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: 11,
                  bgcolor: 'rgba(234, 88, 12, 0.1)',
                  color: 'primary.main',
                }}
              />
            )}
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {leadOrg}
          </Typography>
        </Box>
        <IconButton
          sx={{ ml: 'auto', color: 'text.secondary' }}
          onClick={() => !savingCall && onClose && onClose()}
          disabled={savingCall}
          aria-label="Close call log modal"
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
          {/* Contact Person Called (Select or Type New) */}
          <Grid item xs={12}>
            <Autocomplete
              freeSolo
              size="small"
              options={contacts}
              loading={loadingContacts}
              getOptionLabel={(option) => {
                if (typeof option === 'string') return option;
                if (!option) return '';
                return `${option.name}${option.isPrimary ? ' (Primary)' : ''}${
                  option.phone ? ` - ${option.phone}` : ''
                }`;
              }}
              isOptionEqualToValue={(option, value) => {
                if (typeof value === 'string') return option.name === value;
                return option._id === value?._id;
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
                    (c) => c.name?.toLowerCase() === newValue.toLowerCase()
                  );
                  if (matched) {
                    setCallData((p) => ({
                      ...p,
                      calledContactId: matched._id,
                      calledContactName: matched.name,
                      calledContactPhone: matched.phone || '',
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
                    calledContactPhone: newValue.phone || '',
                  }));
                }
              }}
              onInputChange={(event, newInputValue, reason) => {
                if (reason === 'input') {
                  const matched = contacts.find(
                    (c) =>
                      c.name?.toLowerCase() === newInputValue.toLowerCase() ||
                      `${c.name}${c.isPrimary ? ' (Primary)' : ''} - ${c.phone}`.toLowerCase() ===
                        newInputValue.toLowerCase()
                  );
                  if (matched) {
                    setCallData((p) => ({
                      ...p,
                      calledContactId: matched._id,
                      calledContactName: matched.name,
                      calledContactPhone: matched.phone || '',
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
                  label="Contact Person Called *"
                  placeholder="Select contact or type contact person name..."
                  helperText={
                    !callData.calledContactId && callData.calledContactName
                      ? 'New contact name (will be automatically saved for this hospital)'
                      : contacts.length === 0
                      ? 'No saved contacts. Type contact person name above.'
                      : 'Select existing contact or type a new name'
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option._id || option.name}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', py: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography fontSize={13} fontWeight={option.isPrimary ? 700 : 500}>
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
                      {option.phone || 'No phone'} {option.designation ? `• ${option.designation}` : ''}
                    </Typography>
                  </Box>
                </li>
              )}
            />
          </Grid>

          {/* Contact Phone (editable when new contact or empty phone) */}
          {(!callData.calledContactId || !callData.calledContactPhone) && Boolean(callData.calledContactName) && (
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Contact Phone"
                placeholder="Enter contact phone number (optional)"
                value={callData.calledContactPhone || ''}
                onChange={(e) =>
                  setCallData((p) => ({ ...p, calledContactPhone: e.target.value }))
                }
                helperText="Will be saved with the new contact person"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          )}

          {/* Row 1: Left = Call Date, Right = Call Time */}
          <Grid item xs={12} sm={6}>
            <CalendarDatePicker
              fullWidth
              required
              size="small"
              label="Call Date *"
              value={callData.callDate}
              onChange={(e) => setCallData((p) => ({ ...p, callDate: e.target.value }))}
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
                onChange={(e) =>
                  setCallData((p) => ({ ...p, leadTemperature: e.target.value }))
                }
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">
                  <em>No change ({lead.leadTemperature || 'Unclassified'})</em>
                </MenuItem>
                <MenuItem value="Hot">🔥 Hot</MenuItem>
                <MenuItem value="Warm">🟠 Warm</MenuItem>
                <MenuItem value="Cold">❄️ Cold</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Row 3: Existing Software */}
          <Grid item xs={12} sm={callData.existingSoftwareUsed === 'Yes' ? 6 : 12}>
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

          {callData.existingSoftwareUsed === 'Yes' && (
            <Grid item xs={12} sm={6}>
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

          {/* Row 4: Call Remark (full width) */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Call Remark *"
              multiline
              rows={3}
              placeholder="Enter call notes, discussion summary, key insights..."
              value={callData.remark}
              onChange={(e) => setCallData((p) => ({ ...p, remark: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>

          {/* Row 5: Next Follow-up Date & Next Follow-up Time */}
          <Grid item xs={12} sm={6}>
            <CalendarDatePicker
              fullWidth
              size="small"
              label="Next Follow-up Date"
              value={callData.followUpDate}
              onChange={(e) => setCallData((p) => ({ ...p, followUpDate: e.target.value }))}
              min={formatDateToYYYYMMDD(new Date())}
              helperText="Optional: Schedule next follow-up date"
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

      <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
        <Button
          onClick={() => !savingCall && onClose && onClose()}
          disabled={savingCall}
          sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={savingCall}
          startIcon={
            savingCall ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <Phone sx={{ fontSize: 18 }} />
            )
          }
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            bgcolor: '#ea580c',
            color: '#ffffff',
            px: 2.5,
            '&:hover': { bgcolor: '#c2410c' },
          }}
        >
          {savingCall ? 'Saving Call...' : 'Save Call Log'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

