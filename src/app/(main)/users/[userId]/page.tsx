'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, UserPlus, Clock, UserCheck, UserX } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { ConnectionStatus, UserProfile } from '@/types'

interface ProfileData {
  profile:          UserProfile
  connectionStatus: ConnectionStatus
  conversationId:   string | null
}

async function fetchProfile(userId: string): Promise<ProfileData> {
  const res = await fetch(`/api/users/${userId}`)
  if (!res.ok) throw new Error('Failed to load profile')
  return res.json()
}

async function sendRequest(userId: string): Promise<void> {
  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverId: userId }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Failed to send request')
  }
}

async function cancelRequest(userId: string): Promise<void> {
  const res = await fetch(`/api/requests?receiverId=${userId}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Failed to cancel request')
  }
}

interface PageProps {
  params: Promise<{ userId: string }>
}

export default function UserProfilePage({ params }: PageProps) {
  const { userId } = use(params)
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn:  () => fetchProfile(userId),
    staleTime: 60_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['user-profile', userId] })
    qc.invalidateQueries({ queryKey: ['user-search'] })
  }

  const sendMut = useMutation({
    mutationFn: () => sendRequest(userId),
    onSuccess: invalidate,
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelRequest(userId),
    onSuccess: invalidate,
  })

  const isBusy = sendMut.isPending || cancelMut.isPending

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PageHeader
        title="Profile"
        left={
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      <main className="flex flex-1 flex-col overflow-y-auto">
        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm text-destructive">
              {(error as Error).message ?? 'Failed to load profile'}
            </p>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['user-profile', userId] })}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {data && (
          <div className="flex flex-col items-center gap-5 px-6 py-8">
            {/* Avatar */}
            <UserAvatar
              username={data.profile.username}
              profilePhoto={data.profile.profilePhoto}
              size="lg"
            />

            {/* Username + bio */}
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">@{data.profile.username}</h2>
              {data.profile.bio && (
                <p className="mt-1.5 text-sm text-muted-foreground">{data.profile.bio}</p>
              )}
            </div>

            {/* Mutation error */}
            {(sendMut.isError || cancelMut.isError) && (
              <p className="text-sm text-destructive">
                {((sendMut.error ?? cancelMut.error) as Error)?.message ?? 'Something went wrong'}
              </p>
            )}

            {/* Action button */}
            <div className="w-full max-w-xs">
              {data.connectionStatus === 'connected' && data.conversationId && (
                <Link
                  href={`/chats/${data.conversationId}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" />
                  Message
                </Link>
              )}

              {data.connectionStatus === 'connected' && !data.conversationId && (
                <p className="text-center text-sm text-muted-foreground">Connected</p>
              )}

              {data.connectionStatus === 'none' && (
                <button
                  disabled={isBusy}
                  onClick={() => sendMut.mutate()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50 hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" />
                  {sendMut.isPending ? 'Sending…' : 'Add'}
                </button>
              )}

              {data.connectionStatus === 'request_sent' && (
                <button
                  disabled={isBusy}
                  onClick={() => cancelMut.mutate()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-50 hover:bg-muted"
                >
                  <Clock className="h-4 w-4" />
                  {cancelMut.isPending ? 'Cancelling…' : 'Pending — tap to cancel'}
                </button>
              )}

              {data.connectionStatus === 'request_received' && (
                <div className="flex gap-2">
                  {/* Accept */}
                  <AcceptButton userId={userId} onSuccess={invalidate} />
                  {/* Decline */}
                  <DeclineButton userId={userId} onSuccess={invalidate} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-buttons for accept / decline (need their own mutations) ──────────────

function AcceptButton({ userId, onSuccess }: { userId: string; onSuccess: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/requests/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: userId, action: 'accept' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to accept')
      }
    },
    onSuccess,
  })

  return (
    <button
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50 hover:opacity-90"
    >
      <UserCheck className="h-4 w-4" />
      {mut.isPending ? '…' : 'Accept'}
    </button>
  )
}

function DeclineButton({ userId, onSuccess }: { userId: string; onSuccess: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/requests/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: userId, action: 'decline' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to decline')
      }
    },
    onSuccess,
  })

  return (
    <button
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-50 hover:bg-muted"
    >
      <UserX className="h-4 w-4" />
      {mut.isPending ? '…' : 'Decline'}
    </button>
  )
}
