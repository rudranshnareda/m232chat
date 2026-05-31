'use client'

import { use, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown,
  BookOpen, BookDashed, X,
} from 'lucide-react'
import { useUser } from '@/store/auth'
import { useIsOnline } from '@/context/presence-context'
import { useChatMessages } from '@/hooks/use-chat-messages'
import { MessageBubble }       from '@/components/chat/message-bubble'
import { MessageInput }        from '@/components/chat/message-input'
import { MessageActionSheet }  from '@/components/chat/message-action-sheet'
import { MessageInfoSheet }    from '@/components/chat/message-info-sheet'
import { UserAvatar }          from '@/components/ui/user-avatar'
import { MessageListSkeleton } from '@/components/ui/skeleton'
import { cn }                  from '@/lib/utils'
import type { Message, UserProfile } from '@/types'

// ── Conversation metadata + save-history toggle ──────────────────────────────

interface ConvMeta {
  id:          string
  saveHistory: boolean
  otherUser:   UserProfile | null
}

function useConvMeta(conversationId: string) {
  const [meta,        setMeta]        = useState<ConvMeta | null>(null)
  const [metaError,   setMetaError]   = useState(false)
  const [isToggling,  setIsToggling]  = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then(data => { if (data.error) { setMetaError(true); return }; setMeta(data.conversation) })
      .catch(() => setMetaError(true))
  }, [conversationId])

  const toggleSaveHistory = useCallback(async () => {
    if (!meta || isToggling) return
    const next = !meta.saveHistory
    setMeta(prev => prev ? { ...prev, saveHistory: next } : prev)
    setToggleError(null)
    setIsToggling(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveHistory: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setMeta(prev => prev ? { ...prev, saveHistory: !next } : prev)
      setToggleError('Could not update setting. Try again.')
    } finally { setIsToggling(false) }
  }, [meta, isToggling, conversationId])

  return { meta, metaError, isToggling, toggleError, toggleSaveHistory, refetchMeta: () => {
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setMeta(data.conversation) })
      .catch(() => {})
  }}
}

// ── Last-seen formatting ──────────────────────────────────────────────────────

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'last seen just now'
  if (mins < 60)  return `last seen ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `last seen ${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'last seen yesterday'
  if (days  < 7)  return `last seen ${days} days ago`
  return `last seen ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

/** Ticking "last seen" label — re-computes every 60 s. */
function useLastSeenLabel(iso: string | null | undefined, isOnline: boolean): string {
  const [label, setLabel] = useState(() => isOnline ? '' : formatLastSeen(iso))

  useEffect(() => {
    if (isOnline) { setLabel(''); return }
    setLabel(formatLastSeen(iso))
    const id = setInterval(() => setLabel(formatLastSeen(iso)), 60_000)
    return () => clearInterval(id)
  }, [iso, isOnline])

  return label
}

// ── Chat page ────────────────────────────────────────────────────────────────

interface ChatPageProps { params: Promise<{ conversationId: string }> }

export default function ChatPage({ params }: ChatPageProps) {
  const { conversationId } = use(params)
  const me     = useUser()
  const router = useRouter()
  const qc     = useQueryClient()

  // Bust conversations list cache on unmount so unread badge reflects reads
  useEffect(() => {
    return () => { qc.invalidateQueries({ queryKey: ['conversations'] }) }
  }, [qc])

  const { meta, metaError, isToggling, toggleError, toggleSaveHistory, refetchMeta } = useConvMeta(conversationId)
  const saveHistory = meta?.saveHistory

  const {
    messages, isLoading, loadError, isSending, isSendingMedia,
    hasMore, loadOlder, sendMessage, sendMedia, retryFailed, deleteMessage,
  } = useChatMessages(conversationId, saveHistory)

  // ── O(1) message lookup for reply-to resolution ───────────────────────────
  const messagesById = useMemo(
    () => new Map(messages.map(m => [m.id, m])),
    [messages]
  )

  // ── Reply state ───────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleReply = useCallback((msg: Message) => {
    setReplyTo(msg)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSend = useCallback(async (content: string) => {
    await sendMessage(content, replyTo?.id ?? null)
    setReplyTo(null)
  }, [sendMessage, replyTo])

  // ── Action sheet state ────────────────────────────────────────────────────
  const [actionMsg,  setActionMsg]  = useState<Message | null>(null)
  const [infoMsg,    setInfoMsg]    = useState<Message | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const closeSheet = useCallback(() => { setActionMsg(null); setInfoMsg(null) }, [])

  // ── Scroll management ──────────────────────────────────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
    setShowScrollBtn(false)
  }, [])

  useEffect(() => {
    if (!isLoading && messages.length > 0) scrollToBottom(false)
  }, [isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevCountRef.current
    const curr = messages.length
    prevCountRef.current = curr
    if (curr <= prev) return
    const newest = messages[curr - 1]
    if (newest?.senderId === me?.id || isNearBottom()) scrollToBottom(true)
    else setShowScrollBtn(true)
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => { setShowScrollBtn(!isNearBottom()) }, [isNearBottom])

  const handleScrollTop = useCallback(async () => {
    const el = scrollRef.current
    if (!el || !hasMore || el.scrollTop > 60) return
    const prevH = el.scrollHeight
    await loadOlder()
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevH
    })
  }, [hasMore, loadOlder])

  // ── Date separator label ──────────────────────────────────────────────────
  function dayLabel(iso: string) {
    const d = new Date(iso), now = new Date()
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86_400_000)
    if (d >= today)     return 'Today'
    if (d >= yesterday) return 'Yesterday'
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const otherUser   = meta?.otherUser
  const myUsername  = me?.username ? `@${me.username}` : 'You'
  const otherName   = otherUser?.username ? `@${otherUser.username}` : 'Them'
  const otherOnline = useIsOnline(otherUser?.id)

  // Re-fetch meta when the other user goes offline so lastSeenAt is fresh
  const prevOnlineRef = useRef(otherOnline)
  useEffect(() => {
    if (prevOnlineRef.current && !otherOnline) refetchMeta()
    prevOnlineRef.current = otherOnline
  }, [otherOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  const lastSeenLabel = useLastSeenLabel(otherUser?.lastSeenAt, otherOnline)

  return (
    <div className="flex h-dvh flex-col overflow-hidden">

      {/* ── Header ── */}
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur-sm"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          onClick={() => router.push('/chats')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {otherUser ? (
          <Link href={`/users/${otherUser.id}`} className="flex flex-1 items-center gap-2.5 overflow-hidden">
            <UserAvatar
              username={otherUser.username}
              profilePhoto={otherUser.profilePhoto}
              size="sm"
              isOnline={otherOnline}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">@{otherUser.username}</p>
              {otherOnline
                ? <p className="text-[10px] text-green-500 leading-none">Online</p>
                : lastSeenLabel
                  ? <p className="text-[10px] text-muted-foreground leading-none">{lastSeenLabel}</p>
                  : null
              }
            </div>
          </Link>
        ) : <div className="flex-1" />}

        <button
          onClick={() => setSettingsOpen(true)}
          disabled={!meta}
          aria-label="Chat settings"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          {saveHistory === false ? <BookDashed className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </button>
      </header>

      {/* ── Ephemeral banner ── */}
      {saveHistory === false && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500/10 px-4 py-1.5">
          <BookDashed className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            History off — messages disappear when you reload
          </p>
        </div>
      )}

      {/* ── Message list ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onScrollCapture={handleScrollTop}
        className="relative flex flex-1 flex-col overflow-y-auto px-3 py-3"
      >
        {hasMore && (
          <div className="mb-2 flex justify-center">
            <button onClick={loadOlder} className="text-xs text-primary underline-offset-4 hover:underline">
              Load older messages
            </button>
          </div>
        )}

        {isLoading && <MessageListSkeleton />}

        {loadError && !isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        )}

        {!isLoading && !loadError && messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {`Say hello${otherUser ? ` to @${otherUser.username}` : ''}! 👋`}
            </p>
          </div>
        )}

        {!isLoading && messages.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {messages.map((msg, i) => {
              const prev    = messages[i - 1]
              const showSep = new Date(msg.createdAt).toDateString() !== prev?.createdAt && (
                !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
              )
              const resolvedReplyTo = msg.replyToMessageId
                ? (msg.replyTo ?? messagesById.get(msg.replyToMessageId) ?? null)
                : null

              // Detect history setting change from the current user's perspective.
              // myFlag = the flag that controls whether I see this message after a refresh.
              const myFlag     = (m: typeof msg) => m.senderId === me?.id ? m.senderSaved : m.receiverSaved
              const flagNow    = myFlag(msg)
              const flagPrev   = prev ? myFlag(prev) : flagNow
              const showHistorySep = !!prev && flagNow !== flagPrev

              return (
                <div key={msg.id}>
                  {showSep && (
                    <div className="my-2 flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] text-muted-foreground">{dayLabel(msg.createdAt)}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {showHistorySep && (
                    <div className="my-2 flex items-center gap-3 px-1">
                      <div className="h-px flex-1 border-t border-dashed border-border/60" />
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                        {flagNow ? 'history on' : 'history off'}
                      </span>
                      <div className="h-px flex-1 border-t border-dashed border-border/60" />
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    isMe={msg.senderId === me?.id}
                    meId={me?.id ?? ''}
                    myUsername={myUsername}
                    otherUsername={otherName}
                    replyTo={resolvedReplyTo as Pick<Message, 'id' | 'senderId' | 'content' | 'messageType'> | null}
                    onLongPress={() => {
                      if (!msg.isOptimistic) setActionMsg(msg)
                    }}
                    onRetry={msg.deliveryStatus === 'failed' && msg.content
                      ? () => retryFailed(msg.id, msg.content!)
                      : undefined}
                  />
                </div>
              )
            })}
          </div>
        )}

        <div ref={bottomRef} className="h-1" />

        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom(true)}
            className="fixed bottom-24 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground"
            aria-label="Scroll to latest"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ── Input bar ── */}
      <MessageInput
        ref={inputRef}
        onSend={handleSend}
        onSendMedia={(file) => sendMedia(file, replyTo?.id ?? null)}
        disabled={isSending || metaError}
        isSendingMedia={isSendingMedia}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        myUsername={myUsername}
        otherUsername={otherName}
        meId={me?.id ?? ''}
      />

      {/* ── Action sheet ── */}
      {actionMsg && (
        <MessageActionSheet
          message={actionMsg}
          isMe={actionMsg.senderId === me?.id}
          onReply={() => { handleReply(actionMsg); closeSheet() }}
          onInfo={() => { setInfoMsg(actionMsg); setActionMsg(null) }}
          onDeleteForMe={() => { deleteMessage(actionMsg.id, 'me'); closeSheet() }}
          onDeleteForBoth={actionMsg.senderId === me?.id
            ? () => { deleteMessage(actionMsg.id, 'both'); closeSheet() }
            : undefined}
          onClose={closeSheet}
        />
      )}

      {/* ── Info sheet ── */}
      {infoMsg && (
        <MessageInfoSheet message={infoMsg} onClose={() => setInfoMsg(null)} />
      )}

      {/* ── Settings sheet ── */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSettingsOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-background px-6 pb-10 pt-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Chat settings</h3>
              <button onClick={() => setSettingsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={toggleSaveHistory}
              disabled={isToggling}
              className="flex w-full items-start gap-4 rounded-xl p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                meta?.saveHistory ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/10 text-muted-foreground'
              )}>
                {meta?.saveHistory ? <BookOpen className="h-5 w-5" /> : <BookDashed className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Save message history</p>
                  <div className={cn('relative h-6 w-10 rounded-full transition-colors',
                    meta?.saveHistory ? 'bg-primary' : 'bg-muted-foreground/30')}>
                    <div className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      meta?.saveHistory ? 'translate-x-4' : 'translate-x-0.5')} />
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {meta?.saveHistory
                    ? 'Messages are kept between sessions.'
                    : 'Messages vanish from your view when you reload. Kept on server for 30 days.'}
                </p>
              </div>
            </button>

            {toggleError && <p className="mt-2 px-3 text-xs text-destructive">{toggleError}</p>}
            <p className="mt-4 px-3 text-[11px] text-muted-foreground">
              This setting only affects your own view. Each person controls their history independently.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
