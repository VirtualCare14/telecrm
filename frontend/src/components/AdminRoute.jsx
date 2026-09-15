import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  const isAdmin = user.role === 'ADMIN' || (user.agentRole && user.agentRole.toLowerCase() === 'admin');
  if (!isAdmin) return <Navigate to="/agent" replace />;
  return <Outlet />;
}