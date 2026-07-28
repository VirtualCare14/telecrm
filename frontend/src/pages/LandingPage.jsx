import React from 'react';
import {
  Box, Typography, Button, Container, AppBar, Toolbar,
  CssBaseline, Paper, Grid, Card, CardContent
} from '@mui/material';
import {
  Business, People, Analytics, Phone, ArrowForward,
  Login as LoginIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Business sx={{ fontSize: 40 }} />,
      title: 'Lead Management',
      description: 'Efficiently manage and track all your leads in one place'
    },
    {
      icon: <People sx={{ fontSize: 40 }} />,
      title: 'Agent Management',
      description: 'Organize your sales team and track performance'
    },
    {
      icon: <Phone sx={{ fontSize: 40 }} />,
      title: 'Call Logging',
      description: 'Record and track all customer interactions'
    },
    {
      icon: <Analytics sx={{ fontSize: 40 }} />,
      title: 'Analytics & Reports',
      description: 'Get insights with powerful dashboards and KPI tracking'
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CssBaseline />
      
      {/* Navigation Bar */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'white', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Business sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h5" fontWeight={700} color="primary">
              TeleCRM
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => navigate('/login')}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Login
          </Button>
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 12, textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" fontWeight={700} sx={{ mb: 3 }}>
            Welcome to TeleCRM
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
            Streamline your sales process with powerful lead management, call tracking, and analytics
          </Typography>
          <Button
            variant="contained"
            size="large"
            endIcon={<ArrowForward />}
            onClick={() => navigate('/login')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: 'white',
              color: 'primary.main',
              '&:hover': { bgcolor: 'grey.100' },
              px: 4,
              py: 1.5
            }}
          >
            Get Started
          </Button>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 10, flex: 1 }}>
        <Typography variant="h3" fontWeight={700} textAlign="center" sx={{ mb: 6 }}>
          Powerful Features
        </Typography>
        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    borderColor: 'primary.main'
                  }
                }}
              >
                <CardContent sx={{ textAlign: 'center', p: 4 }}>
                  <Box sx={{ color: 'primary.main', mb: 2, display: 'flex', justifyContent: 'center' }}>
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Footer */}
      <Box sx={{ bgcolor: 'grey.100', py: 4, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          © 2024 TeleCRM. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}