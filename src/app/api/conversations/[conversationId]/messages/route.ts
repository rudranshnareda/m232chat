import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation, DbConversationSetting, DbMessage, DbMessageReaction, DbMessageStatus } from '@/types/database'
import type { Message, MessageReaction } from '@/types'

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

// ── Transform DB row → app Message type ───────────────────────────────────
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

// ── GET /api/conversations/[conversationId]/messages ───────────────────────
// Returns up to 50 messages (oldest first), with delivery status and
// reply-to content resolved inline.
// Optional ?before=<iso> for cursor-based pagination.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params
  const before = request.nextUrl.searchParams.get('before')
  const admin  = createSupabaseAdminClient()

  // Verify participant
  const { data: conv } = await admin
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle() as {
      data: Pick<DbConversation, 'participant_a' | 'participant_b'> | null
      error: unknown
    }

  if (!conv) return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  if (conv.participant_a !== meId && conv.participant_b !== meId) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Fetch messages
  let query = admin
    .from('messages')
    .select('id, conversation_id, sender_id, content, message_type, reply_to_message_id, sender_saved, receiver_saved, deleted_for_sender_at, deleted_for_receiver_at, deleted_for_both_at, created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_for_both_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (before) query = query.lt('created_at', before)

  const { data: rows, error } = await query as { data: DbMessage[] | null; error: unknown }
  if (error || !rows) return Response.json({ error: 'Failed to load messages.' }, { status: 500 })

  // Per-user soft-delete filter
  const visible = rows.filter(row =>
    row.sender_id === meId
      ? row.deleted_for_sender_at === null
      : row.deleted_for_receiver_at === null
  )

  const visibleIds = visible.map(r => r.id)

  // Collect reply-to IDs that need resolving
  const replyIds = [...new Set(
    visible.map(r => r.reply_to_message_id).filter(Boolean) as string[]
  )]

  // Batch: message_status + reply-to rows + reactions in parallel
  const [statusRows, replyRows, reactionRows] = await Promise.all([
    (async () => {
      const { data } = await admin
        .from('message_status')
        .select('message_id, delivered_at, read_at')
        .in('message_id', visibleIds) as {
          data: Pick<DbMessageStatus, 'message_id' | 'delivered_at' | 'read_at'>[] | null
          error: unknown
        }
      return data ?? []
    })(),
    replyIds.length > 0
      ? (async () => {
          const { data } = await admin
            .from('messages')
            .select('id, sender_id, content, message_type')
            .in('id', replyIds) as {
              data: Pick<DbMessage, 'id' | 'sender_id' | 'content' | 'message_type'>[] | null
              error: unknown
            }
          return data ?? []
        })()
      : Promise.resolve([] as Pick<DbMessage, 'id' | 'sender_id' | 'content' | 'message_type'>[]),
    visibleIds.length > 0
      ? (async () => {
          const { data } = await admin
            .from('message_reactions')
            .select('message_id, user_id, emoji')
            .in('message_id', visibleIds) as {
              data: Pick<DbMessageReaction, 'message_id' | 'user_id' | 'emoji'>[] | null
              error: unknown
            }
          return data ?? []
        })()
      : Promise.resolve([] as Pick<DbMessageReaction, 'message_id' | 'user_id' | 'emoji'>[]),
  ])

  const statusMap = new Map(statusRows.map(s => [s.message_id, s]))
  const replyMap  = new Map(replyRows.map(r => [r.id, r]))

  // Group raw reaction rows into MessageReaction[] per message
  const reactionsMap = new Map<string, MessageReaction[]>()
  for (const r of reactionRows) {
    const arr = reactionsMap.get(r.message_id) ?? []
    const existing = arr.find(x => x.emoji === r.emoji)
    if (existing) {
      existing.count++
      if (r.user_id === meId) existing.byMe = true
    } else {
      arr.push({ emoji: r.emoji, count: 1, byMe: r.user_id === meId })
    }
    reactionsMap.set(r.message_id, arr)
  }

  const messages = visible.reverse().map(row => {
    const status   = statusMap.get(row.id)
    const replyRow = row.reply_to_message_id ? replyMap.get(row.reply_to_message_id) : null

    return {
      ...toMessage(row),
      deliveredAt: status?.delivered_at ?? null,
      readAt:      status?.read_at      ?? null,
      reactions:   reactionsMap.get(row.id) ?? [],
      replyTo: replyRow
        ? {
            id:          replyRow.id,
            senderId:    replyRow.sender_id,
            content:     replyRow.content,
            messageType: replyRow.message_type,
          }
        : null,
    }
  })

  return Response.json({ messages })
}

// ── POST /api/conversations/[conversationId]/messages ──────────────────────
// Send a text message. Snapshots both users' save_history at send time.
// Accepts optional replyToMessageId.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params

  let body: { content?: string; replyToMessageId?: string | null }
  try { body = await request.json() }
  catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const content = body.content?.trim()
  if (!content)               return Response.json({ error: 'Message content is required.' }, { status: 422 })
  if (content.length > 4000)  return Response.json({ error: 'Message too long (max 4000 chars).' }, { status: 422 })

  const admin = createSupabaseAdminClient()

  // Verify participant + get other user id
  const { data: conv } = await admin
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle() as {
      data: Pick<DbConversation, 'participant_a' | 'participant_b'> | null
      error: unknown
    }

  if (!conv) return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  if (conv.participant_a !== meId && conv.participant_b !== meId) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const otherId = conv.participant_a === meId ? conv.participant_b : conv.participant_a

  // Snapshot save_history for both users
  const { data: settings } = await admin
    .from('conversation_settings')
    .select('user_id, save_history')
    .eq('conversation_id', conversationId)
    .in('user_id', [meId, otherId]) as {
      data: Pick<DbConversationSetting, 'user_id' | 'save_history'>[] | null
      error: unknown
    }

  const senderSaved   = settings?.find(s => s.user_id === meId)?.save_history    ?? false
  const receiverSaved = settings?.find(s => s.user_id === otherId)?.save_history ?? false

  // Validate replyToMessageId belongs to this conversation (if provided)
  const replyToId = body.replyToMessageId ?? null
  if (replyToId) {
    const { data: replyMsg } = await admin
      .from('messages')
      .select('id')
      .eq('id', replyToId)
      .eq('conversation_id', conversationId)
      .maybeSingle() as { data: { id: string } | null; error: unknown }
    if (!replyMsg) return Response.json({ error: 'Reply-to message not found.' }, { status: 404 })
  }

  // Insert
  const { data: msgRow, error: msgErr } = await admin
    .from('messages')
    .insert({
      conversation_id:      conversationId,
      sender_id:            meId,
      content,
      message_type:         'text',
      sender_saved:         senderSaved,
      receiver_saved:       receiverSaved,
      reply_to_message_id:  replyToId,
    })
    .select('id, conversation_id, sender_id, content, message_type, reply_to_message_id, sender_saved, receiver_saved, deleted_for_sender_at, deleted_for_receiver_at, deleted_for_both_at, created_at')
    .single() as { data: DbMessage | null; error: unknown }

  if (msgErr || !msgRow) return Response.json({ error: 'Failed to send message.' }, { status: 500 })

  await admin.from('message_status').insert({ message_id: msgRow.id })

  return Response.json({ message: toMessage(msgRow) }, { status: 201 })
}
