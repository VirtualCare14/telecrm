import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, Paper,
  FormControl, InputLabel, Select, MenuItem, Chip, Divider, CircularProgress, FormHelperText
} from '@mui/material';
import { ArrowBack, Business, CheckCircle, Warning, InsertDriveFile, FileDownload, CloudUpload } from '@mui/icons-material';
import { createLead, checkDuplicates } from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { useNavigate } from 'react-router-dom';
import { LEAD_SOURCES, INDUSTRIES, ORGANIZATION_TYPES } from '../utils/constants';
import { useAuthStore } from '../store/authStore';
import ImportLeadsModal from '../components/ImportLeadsModal';
import { downloadExcelTemplate } from '../utils/excelImportHelper';
import { getDeviceInstallationId, getDeviceName, captureCurrentLocation } from '../utils/deviceLocationHelper';
import VisitLocationCaptureBox from '../components/VisitLocationCaptureBox';
import LiveCameraCapture from '../components/LiveCameraCapture';
import { calculateHaversineDistance, validateSalesAgentGeofence } from '../utils/geoUtils';

export default function CreateLead() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    organizationName: '', industry: '', organizationType: '', address: '', leadSource: '',
    hospitalLatitude: '', hospitalLongitude: '',
    leadTemperature: '',
  });
  const [customSource, setCustomSource] = useState('');
  const [remarks, setRemarks] = useState('');
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');
  const userAgentRole = (user?.agentRole || '').toLowerCase();
  const isSalesAgent = (user?.role === 'AGENT' || !isAdmin) && userAgentRole.includes('sales');

  // Location and Device state
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationData, setLocationData] = useState({
    status: 'Not Requested',
    latitude: null,
    longitude: null,
    accuracy: null,
    capturedAt: null,
    error: null,
    googleMapsUrl: null,
  });

  const fetchLocation = async () => {
    setLocationLoading(true);
    try {
      const res = await captureCurrentLocation();
      setLocationData(res);
    } catch (err) {
      setLocationData({
        status: 'Unavailable',
        latitude: null,
        longitude: null,
        accuracy: null,
        capturedAt: null,
        error: err.message || 'Unable to retrieve location',
        googleMapsUrl: null,
      });
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    const res = getDeviceInstallationId();
    const id = (typeof res === 'object' && res !== null) ? (res.deviceInstallationId || '') : (res || '');
    setDeviceId(id);
    const devName = getDeviceName();
    setDeviceName(devName);
    fetchLocation();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      getActiveAgents().then(setAgents).catch(() => {});
    }
  }, [isAdmin]);

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

    const newFieldErrors = {};
    if (!form.leadSource) {
      newFieldErrors.leadSource = 'Lead Source is required';
    } else if (form.leadSource === 'Other' && !customSource.trim()) {
      newFieldErrors.customSource = 'Please specify source';
    }
    if (!form.leadTemperature) {
      newFieldErrors.leadTemperature = 'Lead Temperature is required';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    // Mandatory live camera photo validation for Sales Agents
    if (isSalesAgent && !capturedPhoto) {
      setCreateError('A live camera photo of the visit is mandatory for Sales Agents before submitting this lead. Please capture a live photo.');
      return;
    }

    setSubmitting(true);
    try {
      const finalLeadSource = form.leadSource === 'Other' ? customSource.trim() : form.leadSource;
      const payload = {
        organizationName: form.organizationName,
        industry: form.industry,
        organizationType: form.organizationType,
        address: form.address,
        leadSource: finalLeadSource,
        leadTemperature: form.leadTemperature,
        remarks: remarks.trim(),
        contacts: [{
          name: contact.name,
          designation: contact.designation,
          phone: contact.phone,
          altPhone: contact.altPhone,
          email: contact.email,
        }],
        ...(form.hospitalLatitude && form.hospitalLongitude ? {
          hospitalCoordinates: {
            latitude: Number(form.hospitalLatitude),
            longitude: Number(form.hospitalLongitude),
            isVerified: true,
          }
        } : {}),
        ...(capturedPhoto ? {
          visitPhoto: {
            data: capturedPhoto,
            capturedAt: new Date().toISOString(),
          }
        } : {}),
        ...(isAdmin && selectedAgent ? { currentOwner: selectedAgent } : {}),
        createdLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          capturedAt: locationData.capturedAt,
          status: locationData.status || 'Not Requested',
        },
        createdDeviceInstallationId: (typeof deviceId === 'object' && deviceId !== null)
          ? (deviceId.deviceInstallationId || null)
          : (deviceId || null),
        createdDeviceName: deviceName || getDeviceName(),
      };
      const lead = await createLead(payload);
      navigate(isAdmin ? '/leads' : '/agent/leads', { state: { refresh: true, createdLeadId: lead?.lead?._id } });
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button 
            startIcon={<ArrowBack />} 
            onClick={() => navigate(isAdmin ? '/leads' : '/agent/leads')} 
            sx={{ 
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': {
                bgcolor: 'rgba(234, 88, 12, 0.08)'
              }
            }}
          >
            Back
          </Button>
          <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
            Create New Lead
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<FileDownload sx={{ color: '#107c41' }} />}
            onClick={downloadExcelTemplate}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              borderColor: '#107c41',
              color: '#107c41',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#0b582e',
                bgcolor: 'rgba(16, 124, 65, 0.05)'
              }
            }}
          >
            Download Template
          </Button>

          <Button
            variant="contained"
            startIcon={<CloudUpload />}
            onClick={() => setImportModalOpen(true)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#107c41',
              boxShadow: '0 4px 12px rgba(16, 124, 65, 0.25)',
              '&:hover': {
                bgcolor: '#0b582e',
                boxShadow: '0 6px 16px rgba(16, 124, 65, 0.35)'
              }
            }}
          >
            Import Leads from Excel
          </Button>
        </Box>
      </Box>

      {/* Import Modal */}
      <ImportLeadsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          setImportModalOpen(false);
          navigate(isAdmin ? '/leads' : '/agent/leads');
        }}
      />

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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Hospital Latitude (Verified Coordinates)"
                placeholder="e.g. 12.971598"
                value={form.hospitalLatitude}
                onChange={handleFormChange('hospitalLatitude')}
                helperText="Optional registered GPS coordinate"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Hospital Longitude (Verified Coordinates)"
                placeholder="e.g. 77.594562"
                value={form.hospitalLongitude}
                onChange={handleFormChange('hospitalLongitude')}
                helperText="Optional registered GPS coordinate"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required error={Boolean(fieldErrors.leadSource)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel id="create-lead-source-label">Lead Source</InputLabel>
                <Select
                  labelId="create-lead-source-label"
                  value={form.leadSource}
                  label="Lead Source"
                  onChange={(e) => {
                    handleFormChange('leadSource')(e);
                    if (e.target.value !== 'Other') {
                      setCustomSource('');
                    }
                    if (fieldErrors.leadSource || fieldErrors.customSource) {
                      setFieldErrors((prev) => ({ ...prev, leadSource: undefined, customSource: undefined }));
                    }
                  }}
                >
                  {LEAD_SOURCES.map((src) => (
                    <MenuItem key={src} value={src}>{src}</MenuItem>
                  ))}
                </Select>
                {fieldErrors.leadSource && <FormHelperText>{fieldErrors.leadSource}</FormHelperText>}
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required error={Boolean(fieldErrors.leadTemperature)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel id="create-lead-temperature-label">Lead Temperature</InputLabel>
                <Select
                  labelId="create-lead-temperature-label"
                  value={form.leadTemperature}
                  label="Lead Temperature"
                  onChange={(e) => {
                    handleFormChange('leadTemperature')(e);
                    if (fieldErrors.leadTemperature) {
                      setFieldErrors((prev) => ({ ...prev, leadTemperature: undefined }));
                    }
                  }}
                >
                  <MenuItem value="Hot">🔥 Hot</MenuItem>
                  <MenuItem value="Warm">🟠 Warm</MenuItem>
                  <MenuItem value="Cold">❄️ Cold</MenuItem>
                </Select>
                {fieldErrors.leadTemperature && <FormHelperText>{fieldErrors.leadTemperature}</FormHelperText>}
              </FormControl>
            </Grid>
            {form.leadSource === 'Other' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  required
                  label="Please specify source"
                  placeholder="Please specify source"
                  value={customSource}
                  onChange={(e) => {
                    setCustomSource(e.target.value);
                    if (fieldErrors.customSource) {
                      setFieldErrors((prev) => ({ ...prev, customSource: undefined }));
                    }
                  }}
                  error={Boolean(fieldErrors.customSource)}
                  helperText={fieldErrors.customSource}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            )}
            {isAdmin && (
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
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Remarks"
                placeholder="Enter remarks or additional notes..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>

          {isSalesAgent && (
            <Box sx={{ mb: 3 }}>
              <LiveCameraCapture
                photoData={capturedPhoto}
                onPhotoCaptured={(dataUrl) => {
                  setCapturedPhoto(dataUrl);
                  setCreateError(null);
                }}
                onRetake={() => setCapturedPhoto(null)}
                disabled={submitting}
              />
            </Box>
          )}

          <Box sx={{ mb: 3 }}>
            <VisitLocationCaptureBox
              title="Current Location & Device (Optional)"
              disclaimerText="* Captures initial lead-creation GPS presence and device ID if available. Location is optional and will not block lead creation."
              locationData={locationData}
              deviceId={deviceId}
              deviceName={deviceName}
              hospitalCoordinates={
                (form.hospitalLatitude && form.hospitalLongitude)
                  ? { latitude: Number(form.hospitalLatitude), longitude: Number(form.hospitalLongitude) }
                  : null
              }
              isSalesAgent={isSalesAgent}
              loading={locationLoading}
              onRetry={fetchLocation}
            />
          </Box>

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
              disabled={submitting || (isSalesAgent && !capturedPhoto)}
              sx={{ 
                borderRadius: 2, 
                textTransform: 'none', 
                px: 4,
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(234, 88, 12, 0.35)'
                }
              }}
            >
              {submitting ? 'Creating...' : 'Create Lead'}
            </Button>
          </Box>
          {isSalesAgent && !capturedPhoto && (
            <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 1.5, fontWeight: 600 }}>
              * A live camera photo of the visit is required for Sales Agents before this lead can be submitted.
            </Typography>
          )}
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
