'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle, Search, UserCheck, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/chats',    icon: MessageCircle, label: 'Chats'    },
  { href: '/search',   icon: Search,        label: 'Search'   },
  { href: '/requests', icon: UserCheck,     label: 'Requests' },
  { href: '/profile',  icon: User,          label: 'Profile'  },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-14">
        {TABS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-primary/70'
              )}
            >
              <Icon
                className="h-[22px] w-[22px]"
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span className={cn('text-[10px]', isActive ? 'font-semibold' : 'font-normal')}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
