// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createContext, createSignal, useContext, type ParentComponent } from "solid-js"
import {
  getCurrentToken,
  isAuthenticated,
  login as startLogin,
  logout as authLogout,
  type AuthState,
} from "../auth/auth-manager"

type AuthContextValue = {
  authState: () => AuthState
  authStatus: () => string
  token: () => string | null
  checkAuth: () => Promise<void>
  login: () => Promise<boolean>
  logout: () => Promise<void>
  setAuthStatus: (status: string) => void
}

const AuthContext = createContext<AuthContextValue>()

type AuthProviderProps = {
  autoCheck?: boolean
}

export const AuthProvider: ParentComponent<AuthProviderProps> = (props) => {
  const [authState, setAuthState] = createSignal<AuthState>("unauthenticated")
  const [authStatus, setAuthStatus] = createSignal("")
  const [token, setToken] = createSignal<string | null>(null)

  const checkAuth = async () => {
    try {
      const authenticated = await isAuthenticated()
      if (!authenticated) {
        setToken(null)
        setAuthState("unauthenticated")
        return
      }

      const stored = await getCurrentToken()
      if (!stored) {
        setToken(null)
        setAuthState("unauthenticated")
        return
      }

      setToken(stored.token)
      setAuthState("authenticated")
    } catch (err) {
      setToken(null)
      setAuthState("unauthenticated")
      setAuthStatus(err instanceof Error ? err.message : "Failed to read credentials")
    }
  }

  const login = async () => {
    setAuthState("authenticating")
    setAuthStatus("Starting authentication...")

    let result
    try {
      result = await startLogin((status) => {
        setAuthStatus(status)
      })
    } catch (err) {
      setAuthState("unauthenticated")
      setAuthStatus(err instanceof Error ? err.message : "Authentication failed")
      return false
    }

    if (!result.success) {
      setAuthState("unauthenticated")
      setAuthStatus(result.error ?? "Authentication failed")
      return false
    }

    try {
      const stored = await getCurrentToken()
      if (stored) {
        setToken(stored.token)
        setAuthState("authenticated")
        setAuthStatus("")
        return true
      }

      setAuthState("unauthenticated")
      setAuthStatus("Authentication succeeded but no token found")
      return false
    } catch (err) {
      setAuthState("unauthenticated")
      setAuthStatus(err instanceof Error ? err.message : "Failed to read credentials")
      return false
    }
  }

  const logout = async () => {
    try {
      await authLogout()
    } finally {
      setToken(null)
      setAuthState("unauthenticated")
      setAuthStatus("")
    }
  }

  if (props.autoCheck) {
    void checkAuth()
  }

  return (
    <AuthContext.Provider
      value={{
        authState,
        authStatus,
        token,
        checkAuth,
        login,
        logout,
        setAuthStatus,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
