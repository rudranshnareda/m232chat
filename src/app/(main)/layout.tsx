import { PresenceProvider } from '@/components/providers/presence-provider'
import { SingleTabGuard }  from '@/components/single-tab-guard'
import { OfflineBanner }   from '@/components/ui/offline-banner'

// Full-height shell for all authenticated pages.
// Proxy guarantees the user is authenticated before this renders.
// Bottom nav is in the nested (tabs) layout — chat screens skip it.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <PresenceProvider>
      <SingleTabGuard>
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
          <OfflineBanner />
          {children}
        </div>
      </SingleTabGuard>
    </PresenceProvider>
  )
}
