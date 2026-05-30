'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { UserCheck, UserX, Inbox } from 'lucide-react'
import { PageHeader }     from '@/components/layout/page-header'
import { UserAvatar }     from '@/components/ui/user-avatar'
import { UserListSkeleton } from '@/components/ui/skeleton'
import type { ChatRequest } from '@/types'

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchRequests(): Promise<ChatRequest[]> {
  const res = await fetch('/api/requests')
  if (!res.ok) throw new Error('Failed to load requests')
  const data = await res.json()
  return data.requests as ChatRequest[]
}

async function respond(senderId: string, action: 'accept' | 'decline'): Promise<{ conversationId?: string }> {
  const res = await fetch('/api/requests/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId, action }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Failed to respond')
  }
  return res.json()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const qc = useQueryClient()

  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey:  ['requests'],
    queryFn:   fetchRequests,
    // Refetch every 30 s so new requests appear without manual refresh
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const respondMut = useMutation({
    mutationFn: ({ senderId, action }: { senderId: string; action: 'accept' | 'decline' }) =>
      respond(senderId, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] })
      // Bust profile cache so profile pages show updated connection status
      qc.invalidateQueries({ queryKey: ['user-profile'] })
      qc.invalidateQueries({ queryKey: ['user-search'] })
    },
  })

  return (
    <>
      <PageHeader title="Requests" />

      <main className="flex flex-1 flex-col overflow-y-auto">
        {isLoading && <UserListSkeleton count={3} />}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm text-destructive">Failed to load requests</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && requests.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No pending requests</p>
          </div>
        )}

        {!isLoading && requests.length > 0 && (
          <ul className="divide-y divide-border">
            {requests.map(req => {
              const sender = req.sender
              if (!sender) return null
              const isPending = respondMut.isPending && respondMut.variables?.senderId === req.senderId

              return (
                <li key={req.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Tap avatar / name to view profile */}
                  <Link href={`/users/${sender.id}`} className="shrink-0">
                    <UserAvatar username={sender.username} profilePhoto={sender.profilePhoto} size="md" />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link href={`/users/${sender.id}`}>
                      <p className="truncate text-sm font-medium text-foreground">@{sender.username}</p>
                      {sender.bio && (
                        <p className="truncate text-xs text-muted-foreground">{sender.bio}</p>
                      )}
                    </Link>
                    {respondMut.isError && respondMut.variables?.senderId === req.senderId && (
                      <p className="text-xs text-destructive">
                        {(respondMut.error as Error)?.message ?? 'Something went wrong'}
                      </p>
                    )}
                  </div>

                  {/* Accept / Decline */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => respondMut.mutate({ senderId: req.senderId, action: 'accept' })}
                      aria-label="Accept request"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-50 hover:opacity-90"
                    >
                      <UserCheck className="h-4 w-4" />
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => respondMut.mutate({ senderId: req.senderId, action: 'decline' })}
                      aria-label="Decline request"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors disabled:opacity-50 hover:bg-muted"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
