import { create } from 'zustand'

export const useAuthStore = create((set, get) => ({
  user: null,
  _expiryTimeout: null,
  _expiryAt: null,
  setAuth: (user, expiryAt) => {
    const prev = get()._expiryTimeout
    if (prev) clearTimeout(prev)
    set({ user })
    if (expiryAt) {
      set({ _expiryAt: expiryAt })
      const ms = expiryAt - Date.now()
      if (ms <= 0) {
        get().clearAuth()
      } else {
        const id = setTimeout(() => get().clearAuth(), ms)
        set({ _expiryTimeout: id })
      }
    }
  },
  clearAuth: () => {
    const t = get()._expiryTimeout
    if (t) clearTimeout(t)
    set({ user: null, _expiryTimeout: null, _expiryAt: null })
  },
}));
