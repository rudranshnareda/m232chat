'use client'

import { create } from 'zustand'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthUser } from '@/types'

interface AuthStore {
  user: AuthUser | null
  accessToken: string | null
  // Supabase client instance scoped to the current user's JWT.
  // Recreated when the access token is refreshed.
  supabase: SupabaseClient | null
  // True once the initial auth check (cookie refresh on mount) is complete.
  isInitialized: boolean

  setAuth: (user: AuthUser, accessToken: string) => void
  updateToken: (accessToken: string, user?: AuthUser) => void
  clearAuth: () => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  supabase: null,
  isInitialized: false,

  setAuth: (user, accessToken) => {
    set({
      user,
      accessToken,
      supabase: createSupabaseBrowserClient(accessToken),
    })
  },

  updateToken: (accessToken, user) => {
    set((state) => ({
      accessToken,
      supabase: createSupabaseBrowserClient(accessToken),
      user: user ?? state.user,
    }))
  },

  clearAuth: () => {
    // Tear down any active Realtime channels before clearing
    const { supabase } = get()
    if (supabase) supabase.removeAllChannels()
    set({ user: null, accessToken: null, supabase: null })
  },

  setInitialized: () => set({ isInitialized: true }),
}))

// Convenience selectors
export const useUser     = () => useAuthStore((s) => s.user)
export const useSupabase = () => useAuthStore((s) => s.supabase)
export const useIsAuthed = () => useAuthStore((s) => !!s.user && !!s.accessToken)
