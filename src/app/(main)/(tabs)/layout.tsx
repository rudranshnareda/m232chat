import { BottomNav } from '@/components/layout/bottom-nav'

// Wraps the four main tab pages with the bottom navigation bar.
// Chat screens (/chats/[id]) use (main)/layout directly and skip this.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Scrollable content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <BottomNav />
    </>
  )
}
