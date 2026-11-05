import React, { useState } from 'react';
import {
  Box, Typography, Paper, Chip, Button, CircularProgress, Tooltip, Stack, Link, IconButton, Alert
} from '@mui/material';
import {
  MyLocation, LocationOn, LocationOff, Refresh, OpenInNew, Devices, GpsFixed, WarningAmber,
  DevicesOther, ContentCopy, Check as CheckIcon, CheckCircle, Cancel, Verified, Shield
} from '@mui/icons-material';
import { getDeviceName } from '../utils/deviceLocationHelper';
import {
  calculateHaversineDistance,
  validateSalesAgentGeofence,
  MAX_PERMITTED_ACCURACY_METRES,
  MAX_PERMITTED_DISTANCE_METRES
} from '../utils/geoUtils';

/**
 * VisitLocationCaptureBox
 * 
 * Renders the live Location, Device, and Role-Based GPS Geofencing verification
 * in the Visit / Walk-in / Lead entry forms.
 * 
 * Props:
 * - locationData: { status, latitude, longitude, accuracy, capturedAt, error, googleMapsUrl }
 * - deviceId: string
 * - deviceName: string (optional)
 * - hospitalCoordinates: { latitude, longitude, isVerified } (optional)
 * - isSalesAgent: boolean (optional)
 * - loading: boolean
 * - onRetry: function to re-trigger capture
 */
export default function VisitLocationCaptureBox({
  title = 'Visit Location & Device Verification',
  disclaimerText = "* Coordinates verify on-site presence and are kept separate from the hospital's registered address.",
  locationData = {},
  deviceId = '',
  deviceName = '',
  hospitalCoordinates = null,
  isSalesAgent = false,
  loading = false,
  onRetry = () => {},
}) {
  const [copied, setCopied] = useState(false);

  const {
    status = 'Unavailable',
    latitude = null,
    longitude = null,
    accuracy = null,
    capturedAt = null,
    error = null,
    googleMapsUrl = null,
  } = locationData;

  const isCaptured = status === 'Captured' && latitude !== null && longitude !== null;
  const isDenied = status === 'Permission Denied';
  const isTimedOut = status === 'Timed Out';

  const displayDeviceId = (typeof deviceId === 'object' && deviceId !== null)
    ? (deviceId.deviceInstallationId || '')
    : (deviceId ? String(deviceId) : '');

  const resolvedDeviceName = deviceName || (typeof window !== 'undefined' ? getDeviceName() : 'Unknown Device');

  // Hospital Coordinates presence check
  const hasHospitalCoords = hospitalCoordinates &&
    hospitalCoordinates.latitude !== null && hospitalCoordinates.latitude !== undefined &&
    hospitalCoordinates.longitude !== null && hospitalCoordinates.longitude !== undefined;

  // Haversine distance calculation
  const distance = (isCaptured && hasHospitalCoords)
    ? calculateHaversineDistance(latitude, longitude, hospitalCoordinates.latitude, hospitalCoordinates.longitude)
    : null;

  // Geofence validation result
  const geofenceValidation = (hasHospitalCoords && isCaptured)
    ? validateSalesAgentGeofence({
        agentLat: latitude,
        agentLng: longitude,
        accuracy,
        hospitalLat: hospitalCoordinates.latitude,
        hospitalLng: hospitalCoordinates.longitude,
      })
    : null;

  const isGeofencePass = geofenceValidation?.allowed === true;
  const isAccuracyPass = accuracy !== null && Number(accuracy) <= MAX_PERMITTED_ACCURACY_METRES;
  const isDistancePass = distance !== null && distance <= MAX_PERMITTED_DISTANCE_METRES;

  const handleCopyId = () => {
    if (!displayDeviceId) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(displayDeviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: isSalesAgent
          ? (isGeofencePass ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)')
          : (isCaptured ? 'rgba(16, 185, 129, 0.04)' : isDenied ? 'rgba(245, 158, 11, 0.04)' : '#f8fafc'),
        border: '1px solid',
        borderColor: isSalesAgent
          ? (isGeofencePass ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)')
          : (isCaptured ? 'rgba(16, 185, 129, 0.3)' : isDenied ? 'rgba(245, 158, 11, 0.3)' : '#e2e8f0'),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MyLocation sx={{ fontSize: 18, color: isCaptured ? '#059669' : isDenied ? '#d97706' : '#64748b' }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }}>
            {title}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="text"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={12} color="inherit" /> : <Refresh sx={{ fontSize: 14 }} />}
          onClick={onRetry}
          sx={{ textTransform: 'none', fontSize: 11, py: 0.25, px: 1, color: '#2563eb' }}
        >
          {loading ? 'Acquiring...' : 'Refresh GPS'}
        </Button>
      </Box>

      {/* Status Chips & Accuracy Indicator */}
      <Stack spacing={1.25}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {loading ? (
            <Chip
              icon={<CircularProgress size={12} color="inherit" />}
              label="Acquiring GPS coordinates..."
              size="small"
              sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', fontWeight: 600, fontSize: 11 }}
            />
          ) : isCaptured ? (
            <Chip
              icon={<LocationOn sx={{ fontSize: '14px !important', color: '#059669' }} />}
              label="GPS Captured"
              size="small"
              sx={{
                bgcolor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                fontWeight: 700,
                fontSize: 11,
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            />
          ) : isDenied ? (
            <Chip
              icon={<LocationOff sx={{ fontSize: '14px !important', color: '#d97706' }} />}
              label="Permission Denied"
              size="small"
              sx={{
                bgcolor: 'rgba(245, 158, 11, 0.12)',
                color: '#d97706',
                fontWeight: 700,
                fontSize: 11,
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            />
          ) : (
            <Chip
              icon={<WarningAmber sx={{ fontSize: '14px !important', color: '#dc2626' }} />}
              label={isTimedOut ? 'Location Timed Out' : 'GPS Unavailable'}
              size="small"
              sx={{
                bgcolor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                fontWeight: 700,
                fontSize: 11,
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            />
          )}

          {isCaptured && accuracy !== null && (
            <Tooltip title={`Required: ≤ ${MAX_PERMITTED_ACCURACY_METRES}m for Sales Agent on-site restriction`}>
              <Chip
                icon={<GpsFixed sx={{ fontSize: '12px !important' }} />}
                label={`Accuracy: ±${accuracy}m (${isAccuracyPass ? 'Pass ≤90m' : 'Exceeds 90m'})`}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  height: 22,
                  borderColor: isAccuracyPass ? '#059669' : '#dc2626',
                  color: isAccuracyPass ? '#059669' : '#dc2626',
                  bgcolor: isAccuracyPass ? 'rgba(5, 150, 105, 0.05)' : 'rgba(220, 38, 38, 0.05)',
                }}
              />
            </Tooltip>
          )}

          {isSalesAgent ? (
            <Chip
              icon={<Shield sx={{ fontSize: '12px !important' }} />}
              label="Role: Sales Agent (Location Optional)"
              size="small"
              sx={{ fontSize: 10, fontWeight: 700, bgcolor: '#f1f5f9', color: '#334155' }}
            />
          ) : (
            <Chip
              icon={<Shield sx={{ fontSize: '12px !important' }} />}
              label="Remote Access: Remote Permitted"
              size="small"
              sx={{ fontSize: 10, fontWeight: 600, bgcolor: 'rgba(59, 130, 246, 0.08)', color: '#2563eb' }}
            />
          )}
        </Box>

        {/* Captured Coordinates Display */}
        {isCaptured && (
          <Box sx={{ mt: 0.5, bgcolor: '#ffffff', p: 1.25, borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                Captured GPS: Lat: {latitude?.toFixed(6)}, Lng: {longitude?.toFixed(6)}
              </Typography>
              {googleMapsUrl && (
                <Link
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#2563eb',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  View on Map <OpenInNew sx={{ fontSize: 11 }} />
                </Link>
              )}
            </Box>
            {capturedAt && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, mt: 0.25 }}>
                Captured: {new Date(capturedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </Typography>
            )}
          </Box>
        )}

        {/* Geofence Verification Status Card (Requirements 1, 3, 4, 7) */}
        {hasHospitalCoords ? (
          <Paper
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 1.5,
              bgcolor: isSalesAgent
                ? (isGeofencePass ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)')
                : 'rgba(59, 130, 246, 0.05)',
              border: '1px solid',
              borderColor: isSalesAgent
                ? (isGeofencePass ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)')
                : 'rgba(59, 130, 246, 0.2)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Verified sx={{ fontSize: 15, color: '#059669' }} />
                <Typography variant="caption" fontWeight={700} sx={{ color: '#0f172a' }}>
                  Hospital Verified Coordinates:
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                  {Number(hospitalCoordinates.latitude).toFixed(6)}, {Number(hospitalCoordinates.longitude).toFixed(6)}
                </Typography>
              </Box>
              <Chip
                label="Target Radius: 150m"
                size="small"
                sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1' }}
              />
            </Box>

            {/* Calculated Straight-line Haversine Distance */}
            {distance !== null ? (
              <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 700, color: isDistancePass ? '#059669' : '#d97706' }}>
                  Calculated Distance: {Math.round(distance)} metres {isDistancePass ? `(Within 150m)` : `(Exceeds 150m)`}
                </Typography>

                <Chip
                  icon={isSalesAgent ? (isGeofencePass ? <CheckCircle sx={{ fontSize: '13px !important' }} /> : <WarningAmber sx={{ fontSize: '13px !important' }} />) : <CheckCircle sx={{ fontSize: '13px !important' }} />}
                  label={
                    isSalesAgent
                      ? (isGeofencePass ? 'Geofence Verified (<=150m)' : 'Outside 150m (Optional)')
                      : 'Calling Agent: Remote Allowed'
                  }
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: isSalesAgent
                      ? (isGeofencePass ? '#059669' : '#d97706')
                      : '#2563eb',
                    color: '#ffffff',
                  }}
                />
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', display: 'block', mt: 0.5, fontSize: 11 }}>
                {loading ? 'Calculating distance from hospital...' : 'Awaiting current GPS coordinates to calculate hospital distance.'}
              </Typography>
            )}

            {/* Live Explanation / Guidance for Sales Agent */}
            {isSalesAgent && geofenceValidation && !isGeofencePass && (
              <Alert severity="info" sx={{ mt: 1, py: 0.25, px: 1, '& .MuiAlert-message': { fontSize: 11 } }}>
                {geofenceValidation.reason} (Note: Location is optional and will not block lead creation or visit logging).
              </Alert>
            )}

            {isSalesAgent && isGeofencePass && (
              <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600, display: 'block', mt: 0.5, fontSize: 11 }}>
                ✓ Verified within 150m radius ({Math.round(distance)}m) with accuracy ±{Math.round(accuracy)}m.
              </Typography>
            )}
          </Paper>
        ) : (
          isSalesAgent && (
            <Alert severity="info" sx={{ py: 0.25, px: 1, '& .MuiAlert-message': { fontSize: 11 } }}>
              Hospital coordinates are optional. You can create leads and log visits without verified coordinates.
            </Alert>
          )
        )}

        {/* Error message / Fallback notice */}
        {error && !isCaptured && !loading && (
          <Typography variant="caption" sx={{ color: isDenied ? '#b45309' : '#dc2626', display: 'block', mt: 0.5, fontSize: 11 }}>
            {error}
          </Typography>
        )}

        {/* Device Name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
          <DevicesOther sx={{ fontSize: 14, color: '#64748b' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 600 }}>
            Device Name:
          </Typography>
          <Chip
            size="small"
            label={resolvedDeviceName}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: 1.5,
            }}
          />
        </Box>

        {/* Device Installation Identifier */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
          <Devices sx={{ fontSize: 14, color: '#64748b' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, fontWeight: 600 }}>
            Device Installation ID:
          </Typography>
          {displayDeviceId ? (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                bgcolor: '#f1f5f9',
                px: 1,
                py: 0.25,
                borderRadius: 1.5,
                border: '1px solid #cbd5e1',
                maxWidth: '100%',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: '#475569',
                  fontSize: 11,
                  wordBreak: 'break-all',
                }}
              >
                {displayDeviceId}
              </Typography>
              <Tooltip title={copied ? 'Copied ID!' : 'Copy Device ID'}>
                <IconButton
                  size="small"
                  onClick={handleCopyId}
                  sx={{
                    p: 0.25,
                    color: copied ? '#059669' : '#64748b',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                  }}
                >
                  {copied ? <CheckIcon sx={{ fontSize: 13, color: '#059669' }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 11 }}>
              Unavailable
            </Typography>
          )}
        </Box>

        {disclaimerText && (
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 10, fontStyle: 'italic', display: 'block' }}>
            {disclaimerText}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
