import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  CircularProgress,
  FormHelperText,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import {
  ArrowBack,
  Business,
  CheckCircle,
  Warning,
  FileDownload,
  CloudUpload,
  LocationOn,
  AssignmentInd,
  Check,
  Phone,
  PhoneInTalk,
  ArrowForward,
  Visibility,
  Add,
  Close,
} from '@mui/icons-material';
import { createLead, checkDuplicates } from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { useNavigate } from 'react-router-dom';
import { LEAD_SOURCES, INDUSTRIES, ORGANIZATION_TYPES } from '../utils/constants';
import { useAuthStore } from '../store/authStore';
import ImportLeadsModal from '../components/ImportLeadsModal';
import AddCallLogModal from '../components/AddCallLogModal';
import { downloadExcelTemplate } from '../utils/excelImportHelper';
import { getDeviceInstallationId, getDeviceName, captureCurrentLocation } from '../utils/deviceLocationHelper';
import { formatDateTime } from '../utils/dateHelpers';
import VisitLocationCaptureBox from '../components/VisitLocationCaptureBox';
import LiveCameraCapture from '../components/LiveCameraCapture';

export default function CreateLead() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');
  const userAgentRole = (user?.agentRole || '').toLowerCase();
  const isSalesAgent = (user?.role === 'AGENT' || !isAdmin) && userAgentRole.includes('sales');

  // Form State
  const [form, setForm] = useState({
    organizationName: '',
    industry: '',
    organizationType: '',
    address: '',
    hospitalLatitude: '',
    hospitalLongitude: '',
    leadSource: '',
    leadTemperature: '',
  });
  const [customSource, setCustomSource] = useState('');
  const [remarks, setRemarks] = useState('');


  const [selectedAgent, setSelectedAgent] = useState('');
  const [agents, setAgents] = useState([]);
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState('create_and_log'); // 'create_and_log' | 'create'
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  // Post-Creation Call Logging Workflow State
  const [createdLead, setCreatedLead] = useState(null);
  const [callLogModalOpen, setCallLogModalOpen] = useState(false);
  const [leadSuccessModalOpen, setLeadSuccessModalOpen] = useState(false);
  const [callSuccessModalOpen, setCallSuccessModalOpen] = useState(false);
  const [savedCallLog, setSavedCallLog] = useState(null);

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
    const id = typeof res === 'object' && res !== null ? res.deviceInstallationId || '' : res || '';
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

  const handleFormChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCheckDuplicates = async () => {
    if (!form.organizationName.trim()) return;
    setDuplicateLoading(true);
    setDuplicateError(null);
    setDuplicateChecked(true);
    try {
      const matches = await checkDuplicates({
        organizationName: form.organizationName.trim(),
      });
      setDuplicateMatches(matches);
    } catch (err) {
      setDuplicateError(err.response?.data?.message || 'Unable to check duplicates');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const handleSaveLead = async (andLogCall = true) => {
    setCreateError(null);
    setFieldErrors({});

    const newFieldErrors = {};
    if (!form.organizationName.trim()) {
      newFieldErrors.organizationName = 'Organization Name is required';
    }
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Mandatory live camera photo validation for Sales Agents
    if (isSalesAgent && !capturedPhoto) {
      setCreateError(
        'A live camera photo of the visit is mandatory for Sales Agents before submitting this lead. Please capture a live photo.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setSubmitAction(andLogCall ? 'create_and_log' : 'create');

    try {
      const finalLeadSource = form.leadSource === 'Other' ? customSource.trim() : form.leadSource;

      const payload = {
        organizationName: form.organizationName.trim(),
        industry: form.industry,
        organizationType: form.organizationType,
        address: form.address.trim(),
        leadSource: finalLeadSource,
        leadTemperature: form.leadTemperature,
        remarks: remarks.trim(),
        contacts: [],
        ...(form.hospitalLatitude && form.hospitalLongitude
          ? {
              hospitalCoordinates: {
                latitude: Number(form.hospitalLatitude),
                longitude: Number(form.hospitalLongitude),
                isVerified: true,
              },
            }
          : {}),
        ...(capturedPhoto
          ? {
              visitPhoto: {
                data: capturedPhoto,
                capturedAt: new Date().toISOString(),
              },
            }
          : {}),
        ...(isAdmin && selectedAgent ? { currentOwner: selectedAgent } : {}),
        createdLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          capturedAt: locationData.capturedAt,
          status: locationData.status || 'Not Requested',
        },
        createdDeviceInstallationId:
          typeof deviceId === 'object' && deviceId !== null
            ? deviceId.deviceInstallationId || null
            : deviceId || null,
        createdDeviceName: deviceName || getDeviceName(),
      };

      const result = await createLead(payload);
      const newLead = result?.lead || result;
      setCreatedLead(newLead);

      // Notify global listeners that a new lead was created
      window.dispatchEvent(
        new CustomEvent('telecrm:lead-updated', {
          detail: { leadId: newLead?._id, lead: newLead },
        })
      );

      if (andLogCall) {
        // Open Add Call Log modal immediately without extra navigation or searches!
        setCallLogModalOpen(true);
      } else {
        // Show successful lead creation confirmation with prominent "Log Call Now" action
        setLeadSuccessModalOpen(true);
      }
    } catch (err) {
      if (err.validationErrors) {
        setFieldErrors(err.validationErrors);
      } else {
        setCreateError(err.response?.data?.message || 'Unable to create lead');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallLogSuccess = (savedLog, updatedLead) => {
    setSavedCallLog(savedLog);
    setCallLogModalOpen(false);
    setCallSuccessModalOpen(true);
  };

  const handleCallLogClose = () => {
    // When user closes/cancels Add Call Log modal, newly created lead is safe!
    // Show the lead creation confirmation dialog so the agent can see options
    setCallLogModalOpen(false);
    setLeadSuccessModalOpen(true);
  };

  const handleResetForm = () => {
    setForm({
      organizationName: '',
      industry: '',
      organizationType: '',
      address: '',
      hospitalLatitude: '',
      hospitalLongitude: '',
      leadSource: '',
      leadTemperature: '',
    });
    setCustomSource('');
    setRemarks('');
    setSelectedAgent('');
    setCapturedPhoto(null);
    setDuplicateMatches([]);
    setDuplicateChecked(false);
    setFieldErrors({});
    setCreateError(null);
    setCreatedLead(null);
    setSavedCallLog(null);
    setLeadSuccessModalOpen(false);
    setCallSuccessModalOpen(false);
    setCallLogModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', pb: 6 }}>
      {/* ===================== PAGE HEADER & ACTIONS ===================== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate(isAdmin ? '/leads' : '/agent/leads')}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              fontWeight: 600,
              color: '#475569',
              '&:hover': {
                bgcolor: 'rgba(234, 88, 12, 0.08)',
                color: '#ea580c',
              },
            }}
          >
            Back
          </Button>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
              Create New Lead
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Fill out hospital details vertically to register a lead
            </Typography>
          </Box>
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
              bgcolor: '#ffffff',
              '&:hover': {
                borderColor: '#0b582e',
                bgcolor: 'rgba(16, 124, 65, 0.05)',
              },
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
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(16, 124, 65, 0.25)',
              '&:hover': {
                bgcolor: '#0b582e',
                boxShadow: '0 6px 16px rgba(16, 124, 65, 0.35)',
              },
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

      {/* ===================== MAIN FORM PAPER ===================== */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3.5, md: 4 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            bgcolor: '#ea580c',
          },
        }}
      >
        {createError && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {createError}
          </Alert>
        )}

        <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSaveLead(true); }}>
          {/* ========================================================================= */}
          {/* SECTION 1: ORGANIZATION INFORMATION                                      */}
          {/* ========================================================================= */}
          <Typography
            variant="subtitle1"
            fontWeight={800}
            sx={{
              mb: 2.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: '#ea580c',
              fontSize: '1.05rem',
            }}
          >
            <Business sx={{ fontSize: 22 }} /> Section 1: Organization Information
          </Typography>

          <Stack spacing={2.5}>
            {/* 1. Organization Name * */}
            <TextField
              fullWidth
              required
              label="Organization Name"
              placeholder="e.g. City Care Multispeciality Hospital"
              value={form.organizationName}
              onChange={handleFormChange('organizationName')}
              error={Boolean(fieldErrors.organizationName)}
              helperText={fieldErrors.organizationName}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* 2. Industry */}
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
              <InputLabel id="industry-label">Industry</InputLabel>
              <Select
                labelId="industry-label"
                value={form.industry}
                label="Industry"
                onChange={handleFormChange('industry')}
              >
                <MenuItem value="">
                  <em>Select Industry</em>
                </MenuItem>
                {INDUSTRIES.map((ind) => (
                  <MenuItem key={ind} value={ind}>
                    {ind}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 3. Organization Type */}
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
              <InputLabel id="org-type-label">Organization Type</InputLabel>
              <Select
                labelId="org-type-label"
                value={form.organizationType}
                label="Organization Type"
                onChange={handleFormChange('organizationType')}
              >
                <MenuItem value="">
                  <em>Select Type</em>
                </MenuItem>
                {ORGANIZATION_TYPES.map((ot) => (
                  <MenuItem key={ot} value={ot}>
                    {ot}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 4. Address */}
            <TextField
              fullWidth
              label="Address"
              placeholder="Enter physical address, street, locality or city..."
              multiline
              rows={2}
              value={form.address}
              onChange={handleFormChange('address')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* 5. Hospital Latitude (Verified Coordinates) */}
            <TextField
              fullWidth
              label="Hospital Latitude (Verified Coordinates)"
              placeholder="e.g. 12.971598"
              value={form.hospitalLatitude}
              onChange={handleFormChange('hospitalLatitude')}
              helperText="Optional registered hospital GPS latitude coordinate"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* 6. Hospital Longitude (Verified Coordinates) */}
            <TextField
              fullWidth
              label="Hospital Longitude (Verified Coordinates)"
              placeholder="e.g. 77.594562"
              value={form.hospitalLongitude}
              onChange={handleFormChange('hospitalLongitude')}
              helperText="Optional registered hospital GPS longitude coordinate"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* 7. Lead Source * */}
            <FormControl
              fullWidth
              required
              error={Boolean(fieldErrors.leadSource)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            >
              <InputLabel id="lead-source-label">Lead Source</InputLabel>
              <Select
                labelId="lead-source-label"
                value={form.leadSource}
                label="Lead Source"
                onChange={(e) => {
                  handleFormChange('leadSource')(e);
                  if (e.target.value !== 'Other') {
                    setCustomSource('');
                  }
                  if (fieldErrors.leadSource || fieldErrors.customSource) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      leadSource: undefined,
                      customSource: undefined,
                    }));
                  }
                }}
              >
                {LEAD_SOURCES.map((src) => (
                  <MenuItem key={src} value={src}>
                    {src}
                  </MenuItem>
                ))}
              </Select>
              {fieldErrors.leadSource && <FormHelperText>{fieldErrors.leadSource}</FormHelperText>}
            </FormControl>

            {/* Custom Source (appears if Lead Source is Other) */}
            {form.leadSource === 'Other' && (
              <TextField
                fullWidth
                required
                label="Please specify source *"
                placeholder="Enter custom lead source name"
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
            )}

            {/* 8. Lead Temperature * */}
            <FormControl
              fullWidth
              required
              error={Boolean(fieldErrors.leadTemperature)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            >
              <InputLabel id="lead-temperature-label">Lead Temperature</InputLabel>
              <Select
                labelId="lead-temperature-label"
                value={form.leadTemperature}
                label="Lead Temperature"
                onChange={(e) => {
                  handleFormChange('leadTemperature')(e);
                  if (fieldErrors.leadTemperature) {
                    setFieldErrors((prev) => ({ ...prev, leadTemperature: undefined }));
                  }
                }}
              >
                <MenuItem value="Hot">🔥 Hot (High purchase intent)</MenuItem>
                <MenuItem value="Warm">🟠 Warm (Engaged / Follow-up required)</MenuItem>
                <MenuItem value="Cold">❄️ Cold (Low engagement)</MenuItem>
              </Select>
              {fieldErrors.leadTemperature && (
                <FormHelperText>{fieldErrors.leadTemperature}</FormHelperText>
              )}
            </FormControl>

            {/* 9. Remarks */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Remarks"
              placeholder="Enter initial remarks, hospital background, or notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>

          {/* ========================================================================= */}
          {/* SECTION 2: CURRENT LOCATION & DEVICE                                      */}
          {/* ========================================================================= */}
          <Divider sx={{ my: 4, borderColor: '#e2e8f0' }} />

          <Typography
            variant="subtitle1"
            fontWeight={800}
            sx={{
              mb: 2.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: '#ea580c',
              fontSize: '1.05rem',
            }}
          >
            <LocationOn sx={{ fontSize: 22 }} /> Section 2: Current Location & Device
          </Typography>

          <Stack spacing={2.5}>
            {isSalesAgent && (
              <Box>
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

            <VisitLocationCaptureBox
              title="Current Location & Device (Optional)"
              disclaimerText="* Captures initial lead-creation GPS presence and device ID if available. Location is optional and will not block lead creation."
              locationData={locationData}
              deviceId={deviceId}
              deviceName={deviceName}
              hospitalCoordinates={
                form.hospitalLatitude && form.hospitalLongitude
                  ? {
                      latitude: Number(form.hospitalLatitude),
                      longitude: Number(form.hospitalLongitude),
                    }
                  : null
              }
              isSalesAgent={isSalesAgent}
              loading={locationLoading}
              onRetry={fetchLocation}
            />
          </Stack>

          {/* ========================================================================= */}
          {/* SECTION 3: ADDITIONAL DETAILS & OWNERSHIP                                  */}
          {/* ========================================================================= */}
          <Divider sx={{ my: 4, borderColor: '#e2e8f0' }} />

          <Typography
            variant="subtitle1"
            fontWeight={800}
            sx={{
              mb: 2.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: '#ea580c',
              fontSize: '1.05rem',
            }}
          >
            <AssignmentInd sx={{ fontSize: 22 }} /> Section 3: Additional Details & Ownership
          </Typography>

          <Stack spacing={2.5}>
            {isAdmin ? (
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <InputLabel id="assign-agent-label">Assign to Agent</InputLabel>
                <Select
                  labelId="assign-agent-label"
                  value={selectedAgent}
                  label="Assign to Agent"
                  onChange={(e) => setSelectedAgent(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Assign to me (Admin)</em>
                  </MenuItem>
                  {agents.map((a) => (
                    <MenuItem key={a._id} value={a._id}>
                      {a.fullName || a.username} ({a.agentRole || a.role || 'Agent'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <AssignmentInd sx={{ color: '#64748b', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                    Lead Ownership Assignment
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#0f172a' }}>
                    Assigned to: {user?.fullName || user?.username || 'Current Agent'} (You)
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>

          {/* ========================================================================= */}
          {/* SECTION 5: CREATE LEAD & LOG CALL ACTIONS AT THE BOTTOM                  */}
          {/* ========================================================================= */}
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #e2e8f0' }}>
            <Stack spacing={2}>
              {/* Option 1: Create Lead & Log Call (Primary Workflow for Calling Agents) */}
              <Button
                type="button"
                variant="contained"
                size="large"
                fullWidth
                onClick={() => handleSaveLead(true)}
                disabled={submitting || (isSalesAgent && !capturedPhoto)}
                startIcon={
                  submitting && submitAction === 'create_and_log' ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <PhoneInTalk sx={{ fontSize: 22 }} />
                  )
                }
                sx={{
                  borderRadius: 2.5,
                  py: 1.6,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  bgcolor: '#ea580c',
                  textTransform: 'none',
                  boxShadow: '0 4px 16px rgba(234, 88, 12, 0.32)',
                  '&:hover': {
                    bgcolor: '#c2410c',
                    boxShadow: '0 6px 20px rgba(234, 88, 12, 0.42)',
                  },
                }}
              >
                {submitting && submitAction === 'create_and_log'
                  ? 'Creating Lead...'
                  : 'Create Lead & Log Call'}
              </Button>

              {/* Option 2: Create Lead Only (Without immediate call) */}
              <Button
                type="button"
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => handleSaveLead(false)}
                disabled={submitting || (isSalesAgent && !capturedPhoto)}
                startIcon={
                  submitting && submitAction === 'create' ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <CheckCircle sx={{ fontSize: 22, color: '#16a34a' }} />
                  )
                }
                sx={{
                  borderRadius: 2.5,
                  py: 1.35,
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  borderColor: '#16a34a',
                  color: '#15803d',
                  bgcolor: '#ffffff',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#15803d',
                    bgcolor: 'rgba(22, 163, 74, 0.06)',
                  },
                }}
              >
                {submitting && submitAction === 'create'
                  ? 'Creating Lead...'
                  : 'Create Lead (Without Call)'}
              </Button>

              {/* Check Duplicates Button */}
              <Button
                type="button"
                variant="outlined"
                fullWidth
                startIcon={<Warning sx={{ color: '#f59e0b' }} />}
                onClick={handleCheckDuplicates}
                disabled={
                  duplicateLoading ||
                  !form.organizationName?.trim()
                }
                sx={{
                  borderRadius: 2.5,
                  py: 1.25,
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    borderColor: '#f59e0b',
                    color: '#d97706',
                    bgcolor: 'rgba(245, 158, 11, 0.04)',
                  },
                }}
              >
                {duplicateLoading ? 'Checking Duplicates...' : 'Check Duplicates'}
              </Button>
            </Stack>

            {isSalesAgent && !capturedPhoto && (
              <Typography
                variant="caption"
                sx={{ color: 'error.main', display: 'block', mt: 1.5, fontWeight: 600, textAlign: 'center' }}
              >
                * A live camera photo of the visit is mandatory for Sales Agents before this lead can be submitted.
              </Typography>
            )}
          </Box>
        </Box>

        {/* ===================== DUPLICATE CHECK RESULTS ===================== */}
        {duplicateChecked && (
          <Box
            sx={{
              mt: 3.5,
              p: 2.5,
              bgcolor: '#fff8e1',
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'warning.main',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontWeight: 700,
                color: '#92400e',
              }}
            >
              <Warning fontSize="small" color="warning" /> Duplicate Check Results
            </Typography>

            {duplicateError && (
              <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
                {duplicateError}
              </Alert>
            )}

            {duplicateMatches.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Check sx={{ fontSize: 18 }} /> No duplicate leads found. You can safely create this lead.
              </Typography>
            ) : (
              <Box>
                <Typography variant="body2" sx={{ color: '#92400e', mb: 1, fontWeight: 600 }}>
                  Potential matching hospital leads detected:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {duplicateMatches.map((match, idx) => {
                    const orgName =
                      match.type === 'organization'
                        ? match.lead?.organizationName
                        : match.contact?.lead?.organizationName;
                    const leadNum =
                      match.type === 'organization'
                        ? match.lead?.leadNumber
                        : match.contact?.lead?.leadNumber;
                    const leadId = match.lead?._id || match.contact?.lead?._id;

                    return (
                      <Chip
                        key={idx}
                        label={`${orgName || 'Hospital'} (#${leadNum || 'Lead'})`}
                        color="warning"
                        variant="outlined"
                        size="small"
                        onClick={() => leadId && navigate(`/leads/${leadId}`)}
                        sx={{
                          cursor: 'pointer',
                          borderRadius: 2,
                          fontWeight: 600,
                          bgcolor: '#ffffff',
                          '&:hover': { bgcolor: 'rgba(245, 158, 11, 0.1)' },
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1.5, display: 'block', fontStyle: 'italic' }}
            >
              You can still proceed with lead creation. This warning is for your reference to avoid duplicate entries.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* ===================== DIRECT ADD CALL LOG MODAL ===================== */}
      {createdLead && (
        <AddCallLogModal
          open={callLogModalOpen}
          onClose={handleCallLogClose}
          lead={createdLead}
          onSuccess={handleCallLogSuccess}
        />
      )}

      {/* ===================== LEAD CREATED SUCCESS DIALOG ===================== */}
      <Dialog
        open={leadSuccessModalOpen}
        onClose={() => setLeadSuccessModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <CheckCircle sx={{ color: '#16a34a', fontSize: 30 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a' }}>
              Hospital Lead Created Successfully!
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Hospital registered and saved in TeleCRM
            </Typography>
          </Box>
          <IconButton
            onClick={() => setLeadSuccessModalOpen(false)}
            sx={{ color: '#64748b' }}
            aria-label="Close dialog"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 2.5,
              borderRadius: 2.5,
              bgcolor: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1,
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a' }}>
                {createdLead?.organizationName}
              </Typography>
              {(createdLead?.leadNumber || createdLead?.customLeadId) && (
                <Chip
                  label={`Lead #${createdLead?.leadNumber || createdLead?.customLeadId}`}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: 'rgba(234, 88, 12, 0.12)',
                    color: '#ea580c',
                  }}
                />
              )}
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {createdLead?.leadTemperature && (
                <Chip
                  label={createdLead.leadTemperature}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: 11,
                    bgcolor:
                      createdLead.leadTemperature === 'Hot'
                        ? 'rgba(239, 68, 68, 0.12)'
                        : createdLead.leadTemperature === 'Warm'
                        ? 'rgba(234, 88, 12, 0.12)'
                        : 'rgba(2, 132, 199, 0.12)',
                    color:
                      createdLead.leadTemperature === 'Hot'
                        ? '#b91c1c'
                        : createdLead.leadTemperature === 'Warm'
                        ? '#c2410c'
                        : '#0369a1',
                  }}
                />
              )}
              {createdLead?.leadSource && (
                <Chip
                  label={`Source: ${createdLead.leadSource}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 11 }}
                />
              )}
            </Stack>
          </Paper>

          <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
            Would you like to log your first call interaction with this hospital right now?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0, flexDirection: 'column', gap: 1.5, alignItems: 'stretch' }}>
          {/* Primary Action: Log Call Now */}
          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={<PhoneInTalk />}
            onClick={() => {
              setLeadSuccessModalOpen(false);
              setCallLogModalOpen(true);
            }}
            sx={{
              borderRadius: 2.5,
              py: 1.3,
              fontWeight: 800,
              bgcolor: '#ea580c',
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)',
              '&:hover': { bgcolor: '#c2410c' },
            }}
          >
            Log Call Now
          </Button>

          <Box sx={{ display: 'flex', gap: 1.5, width: '100%', flexWrap: 'wrap' }}>
            {/* Go to My Leads */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ArrowForward />}
              onClick={() => navigate(isAdmin ? '/leads' : '/agent/leads')}
              sx={{
                flex: 1,
                borderRadius: 2,
                py: 1.1,
                fontWeight: 600,
                borderColor: '#cbd5e1',
                color: '#334155',
                textTransform: 'none',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Go to My Leads
            </Button>

            {/* View Lead Details */}
            {createdLead?._id && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<Visibility />}
                onClick={() => navigate(`/leads/${createdLead._id}`)}
                sx={{
                  flex: 1,
                  borderRadius: 2,
                  py: 1.1,
                  fontWeight: 600,
                  borderColor: '#cbd5e1',
                  color: '#334155',
                  textTransform: 'none',
                  '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                }}
              >
                View Details
              </Button>
            )}
          </Box>

          {/* Create Another Lead */}
          <Button
            variant="text"
            startIcon={<Add />}
            onClick={handleResetForm}
            sx={{
              borderRadius: 2,
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'none',
              '&:hover': { color: '#0f172a', bgcolor: 'transparent' },
            }}
          >
            Create Another Lead
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== CALL LOGGED SUCCESS DIALOG ===================== */}
      <Dialog
        open={callSuccessModalOpen}
        onClose={() => setCallSuccessModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <CheckCircle sx={{ color: '#16a34a', fontSize: 30 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a' }}>
              Call Logged Successfully!
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Call record and lead history updated in real-time
            </Typography>
          </Box>
          <IconButton
            onClick={() => setCallSuccessModalOpen(false)}
            sx={{ color: '#64748b' }}
            aria-label="Close dialog"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ py: 2 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              bgcolor: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a', mb: 1 }}>
              {createdLead?.organizationName}
            </Typography>
            <Stack spacing={1}>
              {savedCallLog?.disposition && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', minWidth: 100 }}>
                    Disposition:
                  </Typography>
                  <Chip
                    label={savedCallLog.disposition}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      fontSize: 11,
                      bgcolor: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                    }}
                  />
                </Box>
              )}
              {savedCallLog?.calledContact?.name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', minWidth: 100 }}>
                    Contact Person:
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#1e293b' }}>
                    {savedCallLog.calledContact.name}
                  </Typography>
                </Box>
              )}
              {savedCallLog?.followUpAt && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', minWidth: 100 }}>
                    Next Follow-up:
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#ea580c' }}>
                    {formatDateTime(savedCallLog.followUpAt)}
                  </Typography>
                </Box>
              )}
              {savedCallLog?.remark && (
                <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed #e2e8f0' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>
                    Call Notes:
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#334155', fontStyle: 'italic' }}>
                    "{savedCallLog.remark}"
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0, flexDirection: 'column', gap: 1.5, alignItems: 'stretch' }}>
          {/* Primary Action: View Lead Details & Call History */}
          {createdLead?._id && (
            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={<Visibility />}
              onClick={() => navigate(`/leads/${createdLead._id}`)}
              sx={{
                borderRadius: 2.5,
                py: 1.3,
                fontWeight: 800,
                bgcolor: '#ea580c',
                textTransform: 'none',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)',
                '&:hover': { bgcolor: '#c2410c' },
              }}
            >
              View Lead & Call History
            </Button>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, width: '100%', flexWrap: 'wrap' }}>
            {/* Go to My Leads */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ArrowForward />}
              onClick={() => navigate(isAdmin ? '/leads' : '/agent/leads')}
              sx={{
                flex: 1,
                borderRadius: 2,
                py: 1.1,
                fontWeight: 600,
                borderColor: '#cbd5e1',
                color: '#334155',
                textTransform: 'none',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Go to My Leads
            </Button>

            {/* Create Another Lead */}
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Add />}
              onClick={handleResetForm}
              sx={{
                flex: 1,
                borderRadius: 2,
                py: 1.1,
                fontWeight: 600,
                borderColor: '#cbd5e1',
                color: '#334155',
                textTransform: 'none',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Create Another Lead
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
