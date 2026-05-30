'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Renders a dismissible banner at the top of the viewport when the
 * browser reports it is offline. Automatically hides when back online.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    // Initial check (navigator.onLine can be undefined in some envs)
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false)

    const goOffline = () => setOffline(true)
    const goOnline  = () => setOffline(false)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-center gap-2 bg-destructive/90 px-4 py-2 text-destructive-foreground"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <p className="text-xs font-medium">No internet connection</p>
    </div>
  )
}
