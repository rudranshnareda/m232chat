'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore, useUser } from '@/store/auth'
import type { Message, MessageDeliveryStatus, MessageReaction } from '@/types'
import type { DbMessage, DbMessageReaction, DbMessageStatus } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMessage(row: DbMessage): Message {
  return {
    id:                   row.id,
    conversationId:       row.conversation_id,
    senderId:             row.sender_id,
    content:              row.content,
    messageType:          row.message_type,
    replyToMessageId:     row.reply_to_message_id,
    senderSaved:          row.sender_saved,
    receiverSaved:        row.receiver_saved,
    deletedForSenderAt:   row.deleted_for_sender_at,
    deletedForReceiverAt: row.deleted_for_receiver_at,
    deletedForBothAt:     row.deleted_for_both_at,
    createdAt:            row.created_at,
    deliveredAt:          null,
    readAt:               null,
  }
}

function resolveDeliveryStatus(msg: Message, meId: string): MessageDeliveryStatus | undefined {
  if (msg.senderId !== meId) return undefined
  if (msg.deliveryStatus === 'sending' || msg.deliveryStatus === 'failed') return msg.deliveryStatus
  if (msg.readAt)      return 'read'
  if (msg.deliveredAt) return 'delivered'
  return 'sent'
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseChatMessagesResult {
  messages:       Message[]
  isLoading:      boolean
  loadError:      string | null
  isSending:      boolean
  isSendingMedia: boolean
  hasMore:        boolean
  loadOlder:      () => Promise<void>
  sendMessage:    (content: string, replyToMessageId?: string | null) => Promise<void>
  sendMedia:      (file: File, replyToMessageId?: string | null, duration?: number) => Promise<void>
  retryFailed:    (tempId: string, content: string) => Promise<void>
  deleteMessage:   (messageId: string, target: 'me' | 'both') => Promise<void>
  toggleReaction:  (messageId: string, emoji: string) => Promise<void>
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChatMessages(
  conversationId: string,
  saveHistory: boolean | undefined,
): UseChatMessagesResult {
  const supabase = useAuthStore(s => s.supabase)
  const me       = useUser()

  const [messages,       setMessages]       = useState<Message[]>([])
  const [isLoading,      setIsLoading]      = useState(true)
  const [loadError,      setLoadError]      = useState<string | null>(null)
  const [isSending,      setIsSending]      = useState(false)
  const [isSendingMedia, setIsSendingMedia] = useState(false)
  const [hasMore,        setHasMore]        = useState(false)

  const loadedRef = useRef(false)

  // ── Mark incoming messages as read ────────────────────────────────────────
  const markRead = useCallback(async () => {
    try {
      const res  = await fetch(`/api/conversations/${conversationId}/messages/read`, { method: 'POST' })
      const data = await res.json()
      const updatedIds: string[] = data.updatedIds ?? []
      const readAt: string       = data.readAt ?? new Date().toISOString()
      if (updatedIds.length > 0) {
        setMessages(prev => prev.map(m =>
          updatedIds.includes(m.id)
            ? { ...m, deliveredAt: readAt, readAt, deliveryStatus: undefined }
            : m
        ))
      }
    } catch { /* ignore */ }
  }, [conversationId])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (saveHistory === undefined) return

    loadedRef.current = false
    setMessages([])
    setLoadError(null)

    // Even in ephemeral mode we load messages from the DB — they exist until
    // the next login triggers cleanup. Skipping the fetch here meant any
    // message sent while the app was closed was silently lost.
    setIsLoading(true)
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const meId = me?.id ?? ''
        const msgs: Message[] = (data.messages ?? []).map((m: Message) => ({
          ...m,
          deliveryStatus: resolveDeliveryStatus(m, meId),
        }))
        setMessages(msgs)
        setHasMore(msgs.length === 50)
        loadedRef.current = true
        markRead()
      })
      .catch(err => setLoadError((err as Error).message ?? 'Failed to load messages'))
      .finally(() => setIsLoading(false))
  }, [conversationId, saveHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load older ────────────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || !hasMore) return
    const meId = me?.id ?? ''
    const res  = await fetch(
      `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.createdAt)}`
    )
    const data = await res.json()
    if (data.error) return
    const older: Message[] = (data.messages ?? []).map((m: Message) => ({
      ...m,
      deliveryStatus: resolveDeliveryStatus(m, meId),
    }))
    setMessages(prev => [...older, ...prev])
    setHasMore(older.length === 50)
  }, [conversationId, messages, hasMore, me?.id])

  // ── Realtime: new messages ────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages',
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!loadedRef.current) return
          const incoming = toMessage(payload.new as DbMessage)
          const isInbound = incoming.senderId !== me?.id
          setMessages(prev => {
            if (prev.some(m => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
          if (isInbound) markRead()
        }
      )
      // ── Realtime: message soft-deletes (deleted_for_both by the other person)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages',
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as DbMessage
          if (updated.deleted_for_both_at) {
            setMessages(prev => prev.filter(m => m.id !== updated.id))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, conversationId, me?.id, markRead])

  // ── Realtime: delivery status updates ────────────────────────────────────
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`status:${conversationId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_status' },
        (payload) => {
          const s = payload.new as DbMessageStatus
          setMessages(prev => prev.map(m => {
            if (m.id !== s.message_id) return m
            const deliveryStatus: MessageDeliveryStatus =
              s.read_at ? 'read' : s.delivered_at ? 'delivered' : 'sent'
            return { ...m, deliveredAt: s.delivered_at, readAt: s.read_at, deliveryStatus }
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, conversationId])

  // ── Realtime: reaction inserts/deletes ────────────────────────────────────
  // Table needs REPLICA IDENTITY FULL so DELETE payloads include full row data.
  // Filter by conversation_id so each chat only receives its own reactions.
  useEffect(() => {
    if (!supabase || !me?.id) return
    const meId = me.id
    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on('postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!loadedRef.current) return
          const r = payload.new as DbMessageReaction
          // Skip own reactions — already applied optimistically
          if (r.user_id === meId) return
          setMessages(prev => prev.map(m => {
            if (m.id !== r.message_id) return m
            const reactions = m.reactions ?? []
            const hit = reactions.find(x => x.emoji === r.emoji)
            if (hit) return { ...m, reactions: reactions.map(x => x.emoji === r.emoji ? { ...x, count: x.count + 1 } : x) }
            return { ...m, reactions: [...reactions, { emoji: r.emoji, count: 1, byMe: false }] }
          }))
        }
      )
      .on('postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!loadedRef.current) return
          const r = payload.old as Partial<DbMessageReaction>
          if (!r.message_id || !r.emoji) return
          // Skip own removals — already applied optimistically
          if (r.user_id === meId) return
          setMessages(prev => prev.map(m => {
            if (m.id !== r.message_id) return m
            const reactions = m.reactions ?? []
            const hit = reactions.find(x => x.emoji === r.emoji)
            if (!hit) return m
            if (hit.count <= 1) return { ...m, reactions: reactions.filter(x => x.emoji !== r.emoji) }
            return { ...m, reactions: reactions.map(x => x.emoji === r.emoji ? { ...x, count: x.count - 1 } : x) }
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, conversationId, me?.id])

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    content: string,
    replyToMessageId?: string | null,
  ) => {
    if (!me) return

    const tempId = `opt-${Date.now()}-${Math.random()}`
    const now    = new Date().toISOString()

    const optimistic: Message = {
      id:                   tempId,
      conversationId,
      senderId:             me.id,
      content,
      messageType:          'text',
      replyToMessageId:     replyToMessageId ?? null,
      senderSaved:          saveHistory ?? true,
      receiverSaved:        false,
      deletedForSenderAt:   null,
      deletedForReceiverAt: null,
      deletedForBothAt:     null,
      createdAt:            now,
      deliveredAt:          null,
      readAt:               null,
      deliveryStatus:       'sending',
      isOptimistic:         true,
    }

    setMessages(prev => [...prev, optimistic])
    setIsSending(true)

    try {
      const res  = await fetch(`/api/conversations/${conversationId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content, replyToMessageId: replyToMessageId ?? null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')

      const real: Message = { ...data.message, deliveryStatus: 'sent' as MessageDeliveryStatus }
      setMessages(prev => {
        if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== tempId)
        return prev.map(m => m.id === tempId ? real : m)
      })
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, deliveryStatus: 'failed' as MessageDeliveryStatus } : m)
      )
    } finally {
      setIsSending(false)
    }
  }, [me, conversationId])

  // ── Send media ───────────────────────────────────────────────────────────
  const sendMedia = useCallback(async (
    file: File,
    replyToMessageId?: string | null,
    duration?: number, // duration in milliseconds
  ) => {
    if (!me) return

    const tempId = `opt-${Date.now()}-${Math.random()}`
    const now = new Date().toISOString()

    // Determine message type from MIME
    let messageType: 'image' | 'video' | 'audio' | 'file'
    if (file.type.startsWith('image/'))      messageType = 'image'
    else if (file.type.startsWith('video/')) messageType = 'video'
    else if (file.type.startsWith('audio/')) messageType = 'audio'
    else                                     messageType = 'file'

    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: me.id,
      content: file.name,
      messageType,
      replyToMessageId: replyToMessageId ?? null,
      senderSaved: saveHistory ?? true,
      receiverSaved: false,
      deletedForSenderAt: null,
      deletedForReceiverAt: null,
      deletedForBothAt: null,
      createdAt: now,
      deliveredAt: null,
      readAt: null,
      deliveryStatus: 'sending',
      isOptimistic: true,
    }

    setMessages(prev => [...prev, optimistic])
    setIsSendingMedia(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('messageType', messageType)
      if (replyToMessageId) formData.append('replyToMessageId', replyToMessageId)
      if (duration !== undefined) formData.append('duration', duration.toString())

      const res = await fetch(
        `/api/conversations/${conversationId}/messages/upload`,
        { method: 'POST', body: formData }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      const real: Message = { ...data.message, deliveryStatus: 'sent' as const }
      setMessages(prev => {
        if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== tempId)
        return prev.map(m => m.id === tempId ? real : m)
      })
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, deliveryStatus: 'failed' as const } : m)
      )
    } finally {
      setIsSendingMedia(false)
    }
  }, [me, conversationId])

  // ── Toggle reaction ───────────────────────────────────────────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!me) return

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const reactions = m.reactions ?? []
      const hit = reactions.find(r => r.emoji === emoji)
      let next: MessageReaction[]
      if (hit?.byMe) {
        // Remove our reaction
        next = hit.count <= 1
          ? reactions.filter(r => r.emoji !== emoji)
          : reactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, byMe: false } : r)
      } else if (hit) {
        // Someone else has it — add ours too
        next = reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, byMe: true } : r)
      } else {
        // Brand new emoji
        next = [...reactions, { emoji, count: 1, byMe: true }]
      }
      return { ...m, reactions: next }
    }))

    await fetch(
      `/api/conversations/${conversationId}/messages/${messageId}/react`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) }
    ).catch(() => {})
  }, [me, conversationId])

  // ── Retry ─────────────────────────────────────────────────────────────────
  const retryFailed = useCallback(async (tempId: string, content: string) => {
    setMessages(prev => prev.filter(m => m.id !== tempId))
    await sendMessage(content)
  }, [sendMessage])

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (
    messageId: string,
    target: 'me' | 'both',
  ) => {
    // Optimistically remove from local state
    setMessages(prev => prev.filter(m => m.id !== messageId))

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages/${messageId}/delete`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ target }),
        }
      )
      if (!res.ok) {
        // Restore is complex without a snapshot; just reload
        // For now, a failed delete silently leaves the message gone locally
        // The server didn't change it, so it'll reappear on next full reload
        console.error('Delete failed')
      }
    } catch {
      console.error('Delete request failed')
    }
  }, [conversationId])

  return {
    messages, isLoading, loadError, isSending, isSendingMedia, hasMore,
    loadOlder, sendMessage, sendMedia, retryFailed, deleteMessage, toggleReaction,
  }
}
