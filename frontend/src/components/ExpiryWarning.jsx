import React, { useEffect, useState } from 'react'
import { Snackbar, Alert, Button } from '@mui/material'
import { useAuthStore } from '../store/authStore'
import { refreshAuth, me } from '../services/authService'
import { useNavigate } from 'react-router-dom'

const WARNING_MS = 5 * 60 * 1000 // 5 minutes

function formatMs(ms) {
  if (ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export default function ExpiryWarning() {
  const expiryAt = useAuthStore((s) => s._expiryAt)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [open, setOpen] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let timer
    function tick() {
      if (!expiryAt) {
        setOpen(false)
        setRemaining(null)
        return
      }
      const rem = expiryAt - Date.now()
      setRemaining(rem)
      if (rem > 0 && rem <= WARNING_MS) setOpen(true)
      if (rem <= 0) {
        setOpen(false)
        clearAuth()
      }
    }
    tick()
    timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiryAt, clearAuth])

  if (!open) return null

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const handleStaySigned = async () => {
    try {
      const res = await refreshAuth()
      if (res.accessTokenExpiresAt) {
        const user = await me()
        useAuthStore.getState().setAuth(user, res.accessTokenExpiresAt)
      }
    } catch (e) {
      clearAuth()
      navigate('/login')
    }
  }

  const handleClose = () => setOpen(false)

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      <Alert severity="warning" action={<>
        <Button color="inherit" size="small" onClick={handleStaySigned}>Stay signed in</Button>
        <Button color="inherit" size="small" onClick={handleLogout}>Logout</Button>
        <Button color="inherit" size="small" onClick={handleClose}>Dismiss</Button>
      </>}>
        Session expires in {formatMs(remaining)}
      </Alert>
    </Snackbar>
  )
}
