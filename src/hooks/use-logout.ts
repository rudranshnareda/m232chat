'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const router    = useRouter()

  return useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Best effort — clear client state regardless
    }
    clearAuth()
    router.push('/login')
  }, [clearAuth, router])
}
