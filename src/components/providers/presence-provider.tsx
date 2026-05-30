'use client'

import { useEffect, useState } from 'react'
import { useAuthStore, useUser } from '@/store/auth'
import { PresenceContext } from '@/context/presence-context'

type PresencePayload = { user_id: string; online_at: string }

/**
 * Joins the global `online-users` Realtime presence channel and
 * broadcasts the current user's presence. Provides a Set of online
 * user IDs to all descendants via PresenceContext.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useAuthStore(s => s.supabase)
  const me       = useUser()

  const [onlineUsers, setOnlineUsers] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!supabase || !me?.id) return

    const channel = supabase.channel('online-users', {
      config: { presence: { key: me.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>()
        const ids = new Set(
          Object.values(state)
            .flat()
            .map(p => p.user_id)
            .filter(Boolean)
        )
        setOnlineUsers(ids)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id:   me.id,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [supabase, me?.id])

  return (
    <PresenceContext.Provider value={onlineUsers}>
      {children}
    </PresenceContext.Provider>
  )
}
