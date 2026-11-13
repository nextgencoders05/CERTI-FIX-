import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { tokenStore } from '../services/api'

const AuthContext = createContext(null)

export function homePath(role) {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'organization') return '/org/dashboard'
  return '/app/dashboard'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null)
      setLoading(false)
      return null
    }
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      return data
    } catch {
      tokenStore.clear()
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onLogout = () => setUser(null)
    window.addEventListener('certifix:logout', onLogout)
    return () => window.removeEventListener('certifix:logout', onLogout)
  }, [refresh])

  const acceptToken = (data) => {
    tokenStore.set(data.access_token)
    setUser(data.user)
    return data.user
  }

  const value = useMemo(() => ({
    user,
    loading,
    refresh,
    setUser,
    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password })
      return acceptToken(data)
    },
    async register(payload) {
      const { data } = await api.post('/auth/register', payload)
      return acceptToken(data)
    },
    async registerOrganization(payload) {
      const { data } = await api.post('/auth/register-organization', payload)
      return acceptToken(data)
    },
    logout() {
      tokenStore.clear()
      setUser(null)
    },
  }), [user, loading, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
