import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Home, Business } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function NotFound() {
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
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Business sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h3" fontWeight={700} sx={{ mb: 1 }}>404</Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
          Page not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          The page you are looking for does not exist or has been moved.
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