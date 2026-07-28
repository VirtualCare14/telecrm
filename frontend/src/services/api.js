import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

export default api

// Axios response interceptor to handle 401 Unauthorized globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const payload = err.response?.data
    if (payload?.errors && Array.isArray(payload.errors)) {
      err.validationErrors = payload.errors.reduce((acc, errorItem) => {
        if (errorItem.field) acc[errorItem.field] = errorItem.msg
        return acc
      }, {})
    }
    if (status === 401) {
      try {
        useAuthStore.getState().clearAuth()
      } catch (e) {
        // ignore
      }
    }
    return Promise.reject(err)
  }
)
