'use client'

import { createContext, useContext } from 'react'

export const PresenceContext = createContext<ReadonlySet<string>>(new Set())

/** Returns the Set of user IDs that are currently online. */
export function useOnlineUsers(): ReadonlySet<string> {
  return useContext(PresenceContext)
}

/** Convenience hook — returns true if a specific user is online. */
export function useIsOnline(userId: string | null | undefined): boolean {
  const online = useContext(PresenceContext)
  return !!userId && online.has(userId)
}
