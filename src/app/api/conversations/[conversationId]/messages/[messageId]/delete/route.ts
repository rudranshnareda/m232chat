import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation, DbMessage } from '@/types/database'

interface RouteContext {
  params: Promise<{ conversationId: string; messageId: string }>
}

// ── POST /api/conversations/[conversationId]/messages/[messageId]/delete ───
// Soft-deletes a message.
// Body: { target: 'me' | 'both' }
//
//  target='me'   — deletes from the caller's view only:
//                  if caller is sender   → deleted_for_sender_at = now()
//                  if caller is receiver → deleted_for_receiver_at = now()
//
//  target='both' — deletes for both users, only the original sender may do this:
//                  sets deleted_for_both_at = now()
export async function POST(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId, messageId } = await params

  let body: { target?: string }
  try { body = await request.json() }
  catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const { target } = body
  if (target !== 'me' && target !== 'both') {
    return Response.json({ error: 'target must be "me" or "both".' }, { status: 422 })
  }

  const admin = createSupabaseAdminClient()

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

  const isParticipant = conv.participant_a === meId || conv.participant_b === meId
  if (!isParticipant) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  // Fetch the message
  const { data: msg } = await admin
    .from('messages')
    .select('id, sender_id, deleted_for_both_at')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle() as {
      data: Pick<DbMessage, 'id' | 'sender_id' | 'deleted_for_both_at'> | null
      error: unknown
    }

  if (!msg) return Response.json({ error: 'Message not found.' }, { status: 404 })
  if (msg.deleted_for_both_at) return Response.json({ error: 'Message already deleted.' }, { status: 409 })

  const now     = new Date().toISOString()
  const isSender = msg.sender_id === meId

  if (target === 'both') {
    if (!isSender) return Response.json({ error: 'Only the sender can delete for both.' }, { status: 403 })

    await admin
      .from('messages')
      .update({ deleted_for_both_at: now })
      .eq('id', messageId)

    return Response.json({ ok: true, target: 'both', deletedAt: now })
  }

  // target === 'me'
  const field = isSender ? 'deleted_for_sender_at' : 'deleted_for_receiver_at'
  await admin
    .from('messages')
    .update({ [field]: now })
    .eq('id', messageId)

  return Response.json({ ok: true, target: 'me', field, deletedAt: now })
}
