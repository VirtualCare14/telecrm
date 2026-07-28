import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, Paper,
  FormControl, InputLabel, Select, MenuItem, Chip, Divider, CircularProgress
} from '@mui/material';
import { ArrowBack, Business, CheckCircle, Warning } from '@mui/icons-material';
import { createLead, checkDuplicates } from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { useNavigate } from 'react-router-dom';
import { LEAD_SOURCES, INDUSTRIES, ORGANIZATION_TYPES } from '../utils/constants';
import { useAuthStore } from '../store/authStore';

export default function CreateLead() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    organizationName: '', industry: '', organizationType: '', address: '', leadSource: '',
  });
  const [contact, setContact] = useState({
    name: '', designation: '', phone: '', altPhone: '', email: '',
  });
  const [selectedAgent, setSelectedAgent] = useState('');
  const [agents, setAgents] = useState([]);
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      getActiveAgents().then(setAgents).catch(() => {});
    }
  }, [user]);

  const handleFormChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const handleContactChange = (field) => (e) => setContact((prev) => ({ ...prev, [field]: e.target.value }));

  const handleCheckDuplicates = async () => {
    setDuplicateLoading(true);
    setDuplicateError(null);
    setDuplicateChecked(true);
    try {
      const matches = await checkDuplicates({
        organizationName: form.organizationName,
        contactName: contact.name,
        phone: contact.phone,
      });
      setDuplicateMatches(matches);
    } catch (err) {
      setDuplicateError(err.response?.data?.message || 'Unable to check duplicates');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const payload = {
        organizationName: form.organizationName,
        industry: form.industry,
        organizationType: form.organizationType,
        address: form.address,
        leadSource: form.leadSource,
        contacts: [{
          name: contact.name,
          designation: contact.designation,
          phone: contact.phone,
          altPhone: contact.altPhone,
          email: contact.email,
        }],
        ...(user?.role === 'ADMIN' && selectedAgent ? { currentOwner: selectedAgent } : {}),
      };
      const lead = await createLead(payload);
      navigate(`/leads/${lead._id}`);
    } catch (err) {
      if (err.validationErrors) {
        setFieldErrors(err.validationErrors);
      } else {
        setCreateError(err.response?.data?.message || 'Unable to create lead');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Button 
          startIcon={<ArrowBack />} 
          onClick={() => navigate('/leads')} 
          sx={{ 
            textTransform: 'none',
            borderRadius: 2,
            '&:hover': {
              bgcolor: 'rgba(25, 118, 210, 0.08)'
            }
          }}
        >
          Back
        </Button>
        <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
          Create New Lead
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ 
        p: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        {createError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{createError}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2.5, display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
            <Business fontSize="small" /> Organization Information
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth required label="Organization Name"
                value={form.organizationName} onChange={handleFormChange('organizationName')}
                error={Boolean(fieldErrors.organizationName)} helperText={fieldErrors.organizationName}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel>Industry</InputLabel>
                <Select value={form.industry} label="Industry" onChange={handleFormChange('industry')}>
                  <MenuItem value=""><em>Select Industry</em></MenuItem>
                  {INDUSTRIES.map((ind) => (
                    <MenuItem key={ind} value={ind}>{ind}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel>Organization Type</InputLabel>
                <Select value={form.organizationType} label="Organization Type" onChange={handleFormChange('organizationType')}>
                  <MenuItem value=""><em>Select Type</em></MenuItem>
                  {ORGANIZATION_TYPES.map((ot) => (
                    <MenuItem key={ot} value={ot}>{ot}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Address" multiline rows={2}
                value={form.address} onChange={handleFormChange('address')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel>Lead Source</InputLabel>
                <Select value={form.leadSource} label="Lead Source" onChange={handleFormChange('leadSource')}>
                  {LEAD_SOURCES.map((src) => (
                    <MenuItem key={src} value={src}>{src}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {user?.role === 'ADMIN' && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                  <InputLabel>Assign to Agent</InputLabel>
                  <Select value={selectedAgent} label="Assign to Agent" onChange={(e) => setSelectedAgent(e.target.value)}>
                    <MenuItem value=""><em>Assign to me (Admin)</em></MenuItem>
                    {agents.map((a) => (
                      <MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2.5, color: 'primary.main' }}>
            Primary Contact Person
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth required label="Full Name"
                value={contact.name} onChange={handleContactChange('name')}
                error={Boolean(fieldErrors['contacts.0.name'] || fieldErrors['contacts[0].name'])}
                helperText={fieldErrors['contacts.0.name'] || fieldErrors['contacts[0].name'] || ''}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth label="Designation"
                value={contact.designation} onChange={handleContactChange('designation')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth required label="Phone Number"
                value={contact.phone} onChange={handleContactChange('phone')}
                error={Boolean(fieldErrors['contacts.0.phone'] || fieldErrors['contacts[0].phone'])}
                helperText={fieldErrors['contacts.0.phone'] || fieldErrors['contacts[0].phone'] || ''}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth label="Alternate Phone"
                value={contact.altPhone} onChange={handleContactChange('altPhone')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth label="Email"
                value={contact.email} onChange={handleContactChange('email')}
                error={Boolean(fieldErrors['contacts.0.email'] || fieldErrors['contacts[0].email'])}
                helperText={fieldErrors['contacts.0.email'] || fieldErrors['contacts[0].email'] || ''}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 3 }}>
            <Button
              variant="outlined"
              startIcon={<Warning />}
              onClick={handleCheckDuplicates}
              disabled={duplicateLoading || (!form.organizationName && !contact.name && !contact.phone)}
              sx={{ 
                borderRadius: 2, 
                textTransform: 'none',
                borderColor: 'warning.main',
                color: 'warning.main',
                '&:hover': {
                  borderColor: 'warning.dark',
                  bgcolor: 'rgba(255, 152, 0, 0.04)'
                }
              }}
            >
              {duplicateLoading ? 'Checking...' : 'Check Duplicates'}
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <CheckCircle />}
              disabled={submitting}
              sx={{ 
                borderRadius: 2, 
                textTransform: 'none', 
                px: 4,
                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)'
                }
              }}
            >
              {submitting ? 'Creating...' : 'Create Lead'}
            </Button>
          </Box>
        </Box>

        {/* Duplicate Check Results */}
        {duplicateChecked && (
          <Box sx={{ mt: 3, p: 2.5, bgcolor: '#fff8e1', borderRadius: 2, border: '1px solid', borderColor: 'warning.main' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
              <Warning fontSize="small" color="warning" /> Duplicate Check Results
            </Typography>
            {duplicateError && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>{duplicateError}</Alert>}
            {duplicateMatches.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                ✅ No duplicate leads found.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {duplicateMatches.map((match, idx) => {
                  const orgName = match.type === 'organization' ? match.lead.organizationName : match.contact?.lead?.organizationName;
                  const leadNum = match.type === 'organization' ? match.lead.leadNumber : match.contact?.lead?.leadNumber;
                  return (
                    <Chip
                      key={idx}
                      label={`${orgName} (#${leadNum})`}
                      color="warning"
                      variant="outlined"
                      size="small"
                      onClick={() => match.lead?._id && navigate(`/leads/${match.lead._id}`)}
                      sx={{ cursor: 'pointer', borderRadius: 1.5 }}
                    />
                  );
                })}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block', fontStyle: 'italic' }}>
              You can still create this lead. The warning is for your reference only.
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
