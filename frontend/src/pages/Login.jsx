import React, { useState } from 'react';
import {
  Box, Paper, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, Avatar, CircularProgress
} from '@mui/material';
import { Visibility, VisibilityOff, Business } from '@mui/icons-material';
import { login } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, accessTokenExpiresAt } = await login(usernameOrEmail, password);
      setAuth(user, accessTokenExpiresAt);
      if (user.role === 'ADMIN') navigate('/admin');
      else navigate('/agent');
    } catch (err) {
      if (err.response?.status === 409) {
        setError('This account is already logged in on another device. Please log out from the active session first.');
      } else {
        setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
      }}
    >
      {/* Left Side - Branding */}
      <Box
        sx={{
          flex: { xs: '0 0 auto', md: '1 1 50%' },
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: 'white',
          p: 6,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
          }
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 480 }}>
          <Avatar sx={{ mx: 'auto', mb: 3, bgcolor: 'primary.main', width: 80, height: 80, boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)' }}>
            <Business sx={{ fontSize: 40 }} />
          </Avatar>
          <Typography variant="h3" fontWeight={700} sx={{ mb: 2, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            TeleCRM
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, fontWeight: 400 }}>
            Streamline your sales process with powerful lead management and analytics
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: '📊', text: 'Advanced Analytics' },
              { icon: '👥', text: 'Team Management' },
              { icon: '📞', text: 'Call Tracking' },
              { icon: '🎯', text: 'Lead Management' }
            ].map((feature, idx) => (
              <Paper
                key={idx}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  minWidth: 140,
                  transition: 'all 0.3s',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                    transform: 'translateY(-4px)'
                  }
                }}
              >
                <Typography sx={{ fontSize: 32, mb: 1 }}>{feature.icon}</Typography>
                <Typography variant="body2" fontWeight={500}>{feature.text}</Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Right Side - Login Form */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', md: '1 1 50%' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 4, md: 6 },
          position: 'relative'
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4, md: 5 },
            maxWidth: 440,
            width: '100%',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)',
            backdropFilter: 'blur(10px)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)'
            }
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Avatar sx={{ mx: 'auto', mb: 2, bgcolor: 'primary.main', width: 56, height: 56, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
              <Business sx={{ fontSize: 28 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 1, color: 'text.primary' }}>Welcome Back</Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to continue to TeleCRM
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2, bgcolor: 'rgba(239, 68, 68, 0.1)' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email or Username"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              required
              autoFocus
              disabled={loading}
              sx={{ 
                '& .MuiOutlinedInput-root': { borderRadius: 2 },
                mb: 2
              }}
            />
            <TextField
              fullWidth
              type={showPassword ? 'text' : 'password'}
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              sx={{ 
                '& .MuiOutlinedInput-root': { borderRadius: 2 },
                mb: 3
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ 
                py: 1.5, 
                borderRadius: 2, 
                textTransform: 'none', 
                fontSize: 16,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)'
                }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </Box>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              © 2024 TeleCRM. All rights reserved.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
