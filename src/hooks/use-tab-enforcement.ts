'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

const CHANNEL_NAME = 'm232chat-tab'

type TabMessage =
  | { type: 'TAB_CLAIM';   tabId: string }
  | { type: 'TAB_RELEASE'; tabId: string }

export interface UseTabEnforcementResult {
  isActive:  boolean
  claimTab:  () => void
  supported: boolean
}

/**
 * Enforces a single-active-tab constraint using BroadcastChannel.
 *
 * On mount the tab broadcasts TAB_CLAIM and becomes active.
 * If another tab broadcasts TAB_CLAIM this tab becomes inactive.
 * When the active tab closes it broadcasts TAB_RELEASE so the next
 * inactive tab can reclaim automatically.
 */
export function useTabEnforcement(): UseTabEnforcementResult {
  const supported   = typeof window !== 'undefined' && 'BroadcastChannel' in window
  const tabId       = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36))
  const channelRef  = useRef<BroadcastChannel | null>(null)
  const [isActive, setIsActive] = useState(true)

  const claimTab = useCallback(() => {
    channelRef.current?.postMessage(
      { type: 'TAB_CLAIM', tabId: tabId.current } satisfies TabMessage
    )
    setIsActive(true)
  }, [])

  useEffect(() => {
    if (!supported) return

    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (e: MessageEvent<TabMessage>) => {
      const msg = e.data
      // BroadcastChannel never delivers to the sender, but guard anyway
      if (msg.tabId === tabId.current) return

      if (msg.type === 'TAB_CLAIM') {
        // Another tab claimed ownership — yield
        setIsActive(false)
      } else if (msg.type === 'TAB_RELEASE') {
        // Active tab closed — reclaim
        claimTab()
      }
    }

    // Announce ourselves as the active tab
    claimTab()

    const handleUnload = () => {
      channel.postMessage(
        { type: 'TAB_RELEASE', tabId: tabId.current } satisfies TabMessage
      )
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      channel.close()
      channelRef.current = null
    }
  }, [supported, claimTab])

  return { isActive, claimTab, supported }
}
