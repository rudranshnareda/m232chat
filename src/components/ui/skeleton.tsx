import React from 'react'
import { cn } from '@/lib/utils'

// ── Base ─────────────────────────────────────────────────────────────────────

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} style={style} />
  )
}

// ── Conversation list row ─────────────────────────────────────────────────────

function ConversationRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Avatar */}
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-48" />
      </div>
    </li>
  )
}

export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <ConversationRowSkeleton key={i} />
      ))}
    </ul>
  )
}

// ── Chat message bubbles ──────────────────────────────────────────────────────

type BubbleAlign = 'left' | 'right'

function MessageBubbleSkeleton({ align, width }: { align: BubbleAlign; width: string }) {
  return (
    <div className={cn('flex w-full', align === 'right' ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex flex-col space-y-1.5', align === 'right' ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'h-10 animate-pulse rounded-2xl bg-muted',
            align === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm',
          )}
          style={{ width }}
        />
        <Skeleton className="h-2.5 w-10" />
      </div>
    </div>
  )
}

const SKELETON_BUBBLES: { align: BubbleAlign; width: string }[] = [
  { align: 'left',  width: '160px' },
  { align: 'right', width: '200px' },
  { align: 'right', width: '120px' },
  { align: 'left',  width: '220px' },
  { align: 'left',  width: '140px' },
  { align: 'right', width: '180px' },
  { align: 'left',  width: '100px' },
  { align: 'right', width: '240px' },
]

export function MessageListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {SKELETON_BUBBLES.map((b, i) => (
        <MessageBubbleSkeleton key={i} {...b} />
      ))}
    </div>
  )
}

// ── Generic list rows ─────────────────────────────────────────────────────────

function UserRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-8 w-20 rounded-full" />
    </li>
  )
}

export function UserListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <UserRowSkeleton key={i} />
      ))}
    </ul>
  )
}
