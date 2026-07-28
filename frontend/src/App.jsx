import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme/theme';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminAgents from './pages/AdminAgents';
import AgentDashboard from './pages/AgentDashboard';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import Leads from './pages/Leads';
import CreateLead from './pages/CreateLead';
import LeadDetails from './pages/LeadDetails';
import TransferRequests from './pages/TransferRequests';
import LandingPage from './pages/LandingPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppLayout from './layouts/AppLayout';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Protected routes with sidebar layout */}
        <Route element={<ProtectedRoute />}>
          {/* Admin only */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AppLayout><AdminDashboard /></AppLayout>} />
            <Route path="/admin/agents" element={<AppLayout><AdminAgents /></AppLayout>} />
          </Route>

          {/* Shared routes (Admin + Agent) */}
          <Route path="/agent" element={<AppLayout><AgentDashboard /></AppLayout>} />
          <Route path="/leads" element={<AppLayout><Leads /></AppLayout>} />
          <Route path="/leads/create" element={<AppLayout><CreateLead /></AppLayout>} />
          <Route path="/leads/:id" element={<AppLayout><LeadDetails /></AppLayout>} />
          <Route path="/transfer-requests" element={<AppLayout><TransferRequests /></AppLayout>} />
        </Route>

        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ThemeProvider>
  );
}
