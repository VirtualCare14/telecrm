import api from './api'

export async function login(usernameOrEmail, password) {
  const res = await api.post('/auth/login', { usernameOrEmail, password })
  const { user, accessTokenExpiresAt } = res.data
  return { user, accessTokenExpiresAt }
}

export async function logout() {
  try {
    await api.post('/auth/logout')
  } catch (e) {
    // ignore
  }
  // server clears cookies
}

export async function me() {
  const res = await api.get('/auth/me')
  return res.data.user
}

export async function refreshAuth() {
  const res = await api.post('/auth/refresh')
  const { accessTokenExpiresAt } = res.data
  return { accessTokenExpiresAt }
}
