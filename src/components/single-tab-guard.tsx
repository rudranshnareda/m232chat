'use client'

import { Layers } from 'lucide-react'
import { useTabEnforcement } from '@/hooks/use-tab-enforcement'

/**
 * Renders children only when this tab is the active tab.
 * When another tab claims ownership this component replaces
 * the entire UI with an "already open" notice.
 *
 * Falls through (renders children) if BroadcastChannel is not
 * supported so SSR / old browsers are unaffected.
 */
export function SingleTabGuard({ children }: { children: React.ReactNode }) {
  const { isActive, claimTab, supported } = useTabEnforcement()

  // BroadcastChannel unsupported — just render normally
  if (!supported) return <>{children}</>

  if (!isActive) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-background px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Layers className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">
            m232chat is open in another tab
          </h1>
          <p className="text-sm text-muted-foreground">
            Only one tab can be active at a time to keep messages in sync.
          </p>
        </div>

        <button
          onClick={claimTab}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
        >
          Use this tab
        </button>
      </div>
    )
  }

  return <>{children}</>
}
