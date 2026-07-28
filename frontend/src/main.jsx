import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { me } from './services/authService';
import { useAuthStore } from './store/authStore';

// Try to restore session from httpOnly cookie on app load
async function boot() {
  try {
    const user = await me();
    if (user) {
      useAuthStore.getState().setAuth(user, null);
    }
  } catch (e) {
    // Not authenticated - user will be redirected to login
    useAuthStore.getState().clearAuth();
  }
}

boot();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);