'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import type { AuthUser } from '@/types'

interface AuthProviderProps {
  children: React.ReactNode
  initialUser: AuthUser | null
  initialToken: string | null
}

const TOKEN_REFRESH_INTERVAL_MS = 13 * 60 * 1000   // 13 minutes
const SESSION_PING_INTERVAL_MS  = 30 * 1000         // 30 seconds

const PUBLIC_PATHS = ['/login', '/register']

export function AuthProvider({ children, initialUser, initialToken }: AuthProviderProps) {
  const { setAuth, updateToken, clearAuth, setInitialized } = useAuthStore()
  const router   = useRouter()
  const pathname = usePathname()

  const pingIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isPublicRoute = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  const doRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' })
      if (!res.ok) return false
      const data = await res.json()
      updateToken(data.accessToken, data.user)
      return true
    } catch {
      return false
    }
  }, [updateToken])

  // Track when last_seen_at was last written so we can skip the users
  // table update on most pings (server only writes it every 5 min).
  const lastSeenAtRef = useRef<string | null>(null)

  const doPing = useCallback(async () => {
    try {
      const headers: Record<string, string> = {}
      if (lastSeenAtRef.current) headers['x-last-seen-at'] = lastSeenAtRef.current

      const res = await fetch('/api/sessions/ping', { method: 'PATCH', headers })
      if (!res.ok) return
      const data = await res.json()
      if (data.sessionReplaced) {
        clearAuth()
        router.push('/login?reason=session_replaced')
        return
      }
      if (data.lastSeenAt) lastSeenAtRef.current = data.lastSeenAt
    } catch {
      // Network blip — ignore, will retry
    }
  }, [clearAuth, router])

  const startIntervals = useCallback(() => {
    if (pingIntervalRef.current)    clearInterval(pingIntervalRef.current)
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    pingIntervalRef.current    = setInterval(doPing, SESSION_PING_INTERVAL_MS)
    refreshIntervalRef.current = setInterval(doRefresh, TOKEN_REFRESH_INTERVAL_MS)
  }, [doPing, doRefresh])

  useEffect(() => {
    const init = async () => {
      if (initialUser && initialToken) {
        setAuth(initialUser, initialToken)
        if (!isPublicRoute) startIntervals()
      } else {
        const ok = await doRefresh()
        if (!ok) {
          if (!isPublicRoute) router.push('/login')
          setInitialized()
          return
        }
        if (!isPublicRoute) startIntervals()
      }
      setInitialized()
      // Fire-and-forget ephemeral cleanup — but only on REFRESH, not on
      // the very first open of a tab session. This lets users see messages
      // that arrived while the app was closed; messages vanish only after
      // they reload/refresh, not the moment they first open the app.
      //
      // sessionStorage survives F5 / Ctrl+R (same tab) but is cleared
      // when the tab is closed and a new one is opened — exactly the
      // boundary we want.
      if (!isPublicRoute) {
        const SESSION_KEY = 'm232-session-loaded'
        const isReload    = sessionStorage.getItem(SESSION_KEY) !== null
        sessionStorage.setItem(SESSION_KEY, '1')
        if (isReload) {
          fetch('/api/cleanup', { method: 'POST' }).catch(() => {})
        }
      }
    }

    init()

    return () => {
      if (pingIntervalRef.current)    clearInterval(pingIntervalRef.current)
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
