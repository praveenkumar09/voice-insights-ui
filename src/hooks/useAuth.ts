import { useCallback, useEffect, useState } from 'react'
import { clearToken, getToken, login as apiLogin, logout as apiLogout, me, resetPassword as apiResetPassword, setToken, signup as apiSignup } from '../api/client'

export function useAuth() {
  const [email, setEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setChecking(false)
      return
    }
    me()
      .then((r) => setEmail(r.email))
      .catch(() => clearToken())
      .finally(() => setChecking(false))
  }, [])

  const login = useCallback(async (emailInput: string, password: string) => {
    const res = await apiLogin(emailInput, password)
    setToken(res.token)
    setEmail(res.email)
  }, [])

  const signup = useCallback(async (emailInput: string, password: string) => {
    const res = await apiSignup(emailInput, password)
    setToken(res.token)
    setEmail(res.email)
  }, [])

  const resetPassword = useCallback(
    (emailInput: string, newPassword: string, confirmPassword: string) =>
      apiResetPassword(emailInput, newPassword, confirmPassword),
    [],
  )

  const logout = useCallback(() => {
    apiLogout().catch(() => {})
    clearToken()
    setEmail(null)
  }, [])

  return { email, isAuthenticated: email !== null, checking, login, signup, resetPassword, logout }
}
