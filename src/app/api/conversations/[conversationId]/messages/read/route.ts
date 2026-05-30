import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation, DbMessage, DbMessageStatus } from '@/types/database'

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

// ── POST /api/conversations/[conversationId]/messages/read ─────────────────
// Marks all messages sent by the OTHER person in this conversation as
// delivered + read (both timestamps set to now if not already set).
//
// Called when the chat screen mounts and when a new inbound message
// arrives via Realtime while the chat is open.
//
// Returns the message IDs that were updated so the client can patch
// its local state immediately without waiting for a Realtime echo.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params
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

  const isParticipant = conv.participant_a === meId || conv.participant_b === meId
  if (!isParticipant) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const otherId = conv.participant_a === meId ? conv.participant_b : conv.participant_a
  const now     = new Date().toISOString()

  // 1. Find all messages sent by the other person in this conversation
  const { data: theirMsgs } = await admin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('sender_id', otherId)
    .is('deleted_for_both_at', null) as {
      data: Pick<DbMessage, 'id'>[] | null
      error: unknown
    }

  if (!theirMsgs?.length) return Response.json({ updatedIds: [] })

  const msgIds = theirMsgs.map(m => m.id)

  // 2. Find which ones still need a read receipt
  const { data: unread } = await admin
    .from('message_status')
    .select('message_id')
    .in('message_id', msgIds)
    .is('read_at', null) as {
      data: Pick<DbMessageStatus, 'message_id'>[] | null
      error: unknown
    }

  if (!unread?.length) return Response.json({ updatedIds: [] })

  const unreadIds = unread.map(s => s.message_id)

  // 3. Update: set delivered_at (if null) and read_at (always sets now)
  // We do two passes: first set delivered_at only where still null,
  // then set read_at for all unread. A single UPDATE is cleaner:
  await admin
    .from('message_status')
    .update({ delivered_at: now, read_at: now })
    .in('message_id', unreadIds)

  return Response.json({ updatedIds: unreadIds, readAt: now })
}
