import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  PhotoCamera,
  Replay,
  CheckCircle,
  Videocam,
  VideocamOff,
  FlipCameraIos,
  Warning,
  Security,
} from '@mui/icons-material';

/**
 * LiveCameraCapture
 * 
 * Strict live camera photo capture component for Sales Agents.
 * - Enforces direct WebRTC device camera capture only (no file pickers / gallery uploads).
 * - Prefers rear-facing camera on mobile devices (facingMode: { ideal: 'environment' }).
 * - Renders a live viewfinder with capture, preview, and retake capabilities.
 * - Handles camera permissions, unsupported devices, and hardware cleanups safely.
 */
export default function LiveCameraCapture({
  onPhotoCaptured,
  photoData,
  onRetake,
  disabled = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [capturedTimestamp, setCapturedTimestamp] = useState(null);

  // Stop camera tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Start device camera
  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setCameraError(null);

    // Verify browser support for WebRTC mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Live camera access is not supported by your browser, or the page is not running in a secure (HTTPS) context. Please use a modern browser over HTTPS or localhost.'
      );
      setCameraLoading(false);
      return;
    }

    try {
      // Prefer rear camera on mobile (ideal: 'environment'), gracefully fall back to default
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setCameraLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      stopCameraStream();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Camera access is mandatory for Sales Agents to record hospital visits. Please allow camera permissions in your browser/device settings and click "Retry Camera".'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError(
          'No camera device was detected on your hardware. A working camera is mandatory for Sales Agent lead creation.'
        );
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError(
          'The camera is currently in use by another application or locked by the operating system. Please close other camera apps and retry.'
        );
      } else {
        setCameraError(
          err.message || 'Unable to access the camera. Please check camera permissions.'
        );
      }
      setCameraLoading(false);
    }
  }, [stopCameraStream]);

  // Clean up media streams on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // If no photo has been captured yet and camera isn't active, initialize camera
  useEffect(() => {
    if (!photoData && !cameraActive && !cameraLoading && !cameraError) {
      startCamera();
    }
  }, [photoData, cameraActive, cameraLoading, cameraError, startCamera]);

  // Capture frame from active video stream
  const handleCapture = () => {
    if (!videoRef.current || !cameraActive) return;

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      // Scale to max 1280px on longest dimension for optimal transmission & detail
      let targetW = width;
      let targetH = height;
      const maxDim = 1280;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const timestamp = new Date();

      stopCameraStream();
      setCapturedTimestamp(timestamp);
      if (onPhotoCaptured) {
        onPhotoCaptured(dataUrl);
      }
    } catch (err) {
      console.error('Frame capture error:', err);
      setCameraError('Failed to capture photo frame. Please try again.');
    }
  };

  // Retake photo: discard captured frame and restart camera
  const handleRetake = () => {
    setCapturedTimestamp(null);
    if (onRetake) {
      onRetake();
    }
    startCamera();
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1.5px solid',
        borderColor: photoData
          ? '#10b981'
          : cameraError
          ? '#ef4444'
          : 'rgba(234, 88, 12, 0.4)',
        bgcolor: photoData
          ? 'rgba(16, 185, 129, 0.02)'
          : 'rgba(255, 255, 255, 0.95)',
        boxShadow: photoData
          ? '0 2px 10px rgba(16, 185, 129, 0.08)'
          : '0 2px 12px rgba(234, 88, 12, 0.08)',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: photoData ? 'rgba(16, 185, 129, 0.12)' : 'rgba(234, 88, 12, 0.12)',
              color: photoData ? '#059669' : '#ea580c',
            }}
          >
            <PhotoCamera sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: 15, color: 'text.primary', lineHeight: 1.2 }}>
              Live Hospital Visit Photo
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              Mandatory for Sales Agents • Live device camera capture only
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            label="MANDATORY"
            sx={{
              height: 22,
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: 0.5,
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          />
          {photoData && (
            <Chip
              size="small"
              icon={<CheckCircle sx={{ fontSize: '14px !important', color: '#059669 !important' }} />}
              label="PHOTO CAPTURED"
              sx={{
                height: 22,
                fontWeight: 700,
                fontSize: 10,
                bgcolor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            />
          )}
        </Box>
      </Box>

      {/* Main Viewport Container */}
      <Box sx={{ position: 'relative', width: '100%', mb: 2 }}>
        {/* State 1: Photo is captured -> Show Preview */}
        {photoData ? (
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              borderRadius: 2.5,
              overflow: 'hidden',
              border: '2px solid #10b981',
              bgcolor: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Box
              component="img"
              src={photoData}
              alt="Live visit proof"
              sx={{
                width: '100%',
                maxHeight: 340,
                objectFit: 'contain',
                display: 'block',
              }}
            />
            {/* Timestamp & Verification banner overlay */}
            <Box
              sx={{
                width: '100%',
                py: 1,
                px: 2,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#fff',
                fontSize: 12,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle sx={{ fontSize: 16, color: '#10b981' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#f8fafc' }}>
                  Live Camera Proof Verified
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: '#cbd5e1', fontSize: 11 }}>
                Captured: {capturedTimestamp ? capturedTimestamp.toLocaleTimeString() : 'Just now'}
              </Typography>
            </Box>
          </Box>
        ) : (
          /* State 2: Live Camera Viewfinder or Loading/Error */
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              minHeight: 280,
              maxHeight: 360,
              borderRadius: 2.5,
              overflow: 'hidden',
              bgcolor: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: cameraError ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Live Video Element */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{
                width: '100%',
                height: '100%',
                maxHeight: 360,
                objectFit: 'cover',
                display: cameraActive && !cameraLoading && !cameraError ? 'block' : 'none',
              }}
            />

            {/* Target Reticle Viewfinder Overlay */}
            {cameraActive && !cameraLoading && !cameraError && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  sx={{
                    width: '75%',
                    height: '70%',
                    border: '1.5px dashed rgba(255, 255, 255, 0.6)',
                    borderRadius: 2,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.25)',
                    position: 'relative',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      bottom: 8,
                      width: '100%',
                      textAlign: 'center',
                      color: 'rgba(255, 255, 255, 0.85)',
                      fontWeight: 600,
                      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    Position hospital / reception in frame
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Loading State */}
            {cameraLoading && (
              <Box sx={{ textAlign: 'center', p: 3, color: '#f8fafc' }}>
                <CircularProgress size={36} sx={{ color: '#ea580c', mb: 1.5 }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Connecting to device camera...
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                  Please accept the camera permission prompt
                </Typography>
              </Box>
            )}

            {/* Error State */}
            {cameraError && !cameraLoading && (
              <Box sx={{ p: 3, textAlign: 'center', maxWidth: 420 }}>
                <VideocamOff sx={{ fontSize: 44, color: '#ef4444', mb: 1.5 }} />
                <Typography variant="subtitle2" sx={{ color: '#f8fafc', fontWeight: 700, mb: 1 }}>
                  Camera Access Required
                </Typography>
                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'block', mb: 2, lineHeight: 1.4 }}>
                  {cameraError}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Replay />}
                  onClick={startCamera}
                  sx={{
                    bgcolor: '#ea580c',
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    '&:hover': { bgcolor: '#c2410c' },
                  }}
                >
                  Retry Camera Access
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Action Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        {photoData ? (
          <>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Photo is locked and ready for submission. Click Retake to replace it.
            </Typography>
            <Button
              variant="outlined"
              size="medium"
              startIcon={<Replay />}
              onClick={handleRetake}
              disabled={disabled}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#64748b',
                color: '#334155',
                '&:hover': { borderColor: '#0f172a', bgcolor: 'rgba(15, 23, 42, 0.04)' },
              }}
            >
              Retake Photo
            </Button>
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Security sx={{ fontSize: 16, color: '#ea580c' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Device camera strictly enforced. Gallery uploads disabled.
              </Typography>
            </Box>

            <Button
              variant="contained"
              size="large"
              startIcon={<PhotoCamera />}
              onClick={handleCapture}
              disabled={!cameraActive || cameraLoading || Boolean(cameraError) || disabled}
              sx={{
                bgcolor: '#ea580c',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2.5,
                px: 3.5,
                py: 1.25,
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                '&:hover': {
                  bgcolor: '#c2410c',
                  boxShadow: '0 6px 18px rgba(234, 88, 12, 0.45)',
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(234, 88, 12, 0.25)',
                  color: 'rgba(255, 255, 255, 0.7)',
                },
              }}
            >
              Capture Photo
            </Button>
          </>
        )}
      </Box>
    </Paper>
  );
}
