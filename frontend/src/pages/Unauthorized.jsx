import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Lock, Home } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Unauthorized() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f5f6fa',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 5,
          textAlign: 'center',
          maxWidth: 420,
          width: '100%',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Lock sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
        <Typography variant="h3" fontWeight={700} sx={{ mb: 1 }}>
          403
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Unauthorized Access
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          You do not have permission to access this page. Please contact your administrator if you believe this is an error.
        </Typography>
        <Button
          variant="contained"
          startIcon={<Home />}
          onClick={() => {
            if (user?.role === 'ADMIN') navigate('/admin');
            else if (user?.role === 'AGENT') navigate('/agent');
            else navigate('/login');
          }}
          sx={{ borderRadius: 2, textTransform: 'none' }}
        >
          Go to Dashboard
        </Button>
      </Paper>
    </Box>
  );
}
