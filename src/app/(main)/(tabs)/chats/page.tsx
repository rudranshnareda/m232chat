'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { PageHeader }               from '@/components/layout/page-header'
import { UserAvatar }               from '@/components/ui/user-avatar'
import { ConversationListSkeleton } from '@/components/ui/skeleton'
import { formatConvTime }           from '@/lib/format-time'
import { useUser }                  from '@/store/auth'
import { useOnlineUsers }           from '@/context/presence-context'
import { cn }                       from '@/lib/utils'
import type { MessageType, UserProfile } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface LastMessage {
  id:          string
  senderId:    string
  content:     string | null
  messageType: MessageType
  createdAt:   string
}

interface ConversationItem {
  id:          string
  createdAt:   string
  saveHistory: boolean
  unreadCount: number
  otherUser:   UserProfile | null
  lastMessage: LastMessage | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MSG_TYPE_PREVIEW: Partial<Record<MessageType, string>> = {
  image:  '📷 Photo',
  video:  '🎬 Video',
  audio:  '🎤 Voice note',
  file:   '📎 File',
  link:   '🔗 Link',
}

function lastMessagePreview(msg: LastMessage | null, meId: string): string {
  if (!msg) return 'No messages yet'
  const prefix = msg.senderId === meId ? 'You: ' : ''
  if (msg.messageType !== 'text') {
    return prefix + (MSG_TYPE_PREVIEW[msg.messageType] ?? msg.messageType)
  }
  const text = msg.content ?? ''
  return prefix + (text.length > 60 ? text.slice(0, 60) + '…' : text)
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchConversations(): Promise<ConversationItem[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new Error('Failed to load conversations')
  const data = await res.json()
  return data.conversations as ConversationItem[]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const me      = useUser()
  const online  = useOnlineUsers()

  const { data: conversations = [], isLoading, isError, refetch } = useQuery({
    queryKey:        ['conversations'],
    queryFn:         fetchConversations,
    staleTime:       20_000,
    refetchInterval: 30_000,
  })

  return (
    <>
      <PageHeader title="Chats" />

      <main className="flex flex-1 flex-col overflow-y-auto">
        {isLoading && <ConversationListSkeleton />}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm text-destructive">Failed to load chats</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && conversations.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">No chats yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Find someone in{' '}
                <Link href="/search" className="text-primary underline-offset-4 hover:underline">
                  Search
                </Link>
              </p>
            </div>
          </div>
        )}

        {!isLoading && conversations.length > 0 && (
          <ul className="divide-y divide-border">
            {conversations.map(conv => {
              const other = conv.otherUser
              if (!other) return null

              const preview = lastMessagePreview(conv.lastMessage, me?.id ?? '')
              const time    = conv.lastMessage
                ? formatConvTime(conv.lastMessage.createdAt)
                : formatConvTime(conv.createdAt)

              return (
                <li key={conv.id}>
                  <Link
                    href={`/chats/${conv.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <UserAvatar
                      username={other.username}
                      profilePhoto={other.profilePhoto}
                      size="md"
                      isOnline={online.has(other.id)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn(
                          'truncate text-sm text-foreground',
                          conv.unreadCount > 0 ? 'font-bold' : 'font-semibold'
                        )}>
                          @{other.username}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'truncate text-xs',
                          conv.unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                        )}>
                          {preview}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
