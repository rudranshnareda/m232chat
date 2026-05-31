'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Search, UserCheck, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatRequest } from '@/types'

const TABS = [
  { href: '/chats',    icon: MessageCircle, label: 'Chats'    },
  { href: '/search',   icon: Search,        label: 'Search'   },
  { href: '/requests', icon: UserCheck,     label: 'Requests' },
  { href: '/profile',  icon: User,          label: 'Profile'  },
] as const

async function fetchRequests(): Promise<ChatRequest[]> {
  const res = await fetch('/api/requests')
  if (!res.ok) return []
  const data = await res.json()
  return data.requests as ChatRequest[]
}

export function BottomNav() {
  const pathname = usePathname()

  const { data: requestCount = 0 } = useQuery({
    queryKey:        ['requests'],
    queryFn:         fetchRequests,
    staleTime:       60_000,
    refetchInterval: 2 * 60_000,
    select:          (data) => data.length,
  })

  return (
    <nav
      className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-14">
        {TABS.map(({ href, icon: Icon, label }) => {
          const isActive   = pathname === href
          const isRequests = href === '/requests'
          const badge      = isRequests && requestCount > 0 ? requestCount : 0

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
              <div className="relative">
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
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
