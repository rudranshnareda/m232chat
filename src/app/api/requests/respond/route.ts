import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbChatRequest, DbConversation } from '@/types/database'

// ── POST /api/requests/respond ─────────────────────────────────────────────
// Accept or decline an incoming chat request.
// Body: { senderId: string, action: 'accept' | 'decline' }
//
// On accept:
//  1. Update chat_request status → 'accepted'
//  2. Insert conversation (participant_a < participant_b enforced)
//  3. Upsert conversation_settings for both participants (save_history = false)
export async function POST(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  let body: { senderId?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { senderId, action } = body
  if (!senderId) return Response.json({ error: 'senderId is required.' }, { status: 422 })
  if (action !== 'accept' && action !== 'decline') {
    return Response.json({ error: 'action must be "accept" or "decline".' }, { status: 422 })
  }

  const admin = createSupabaseAdminClient()

  // Find the pending request — only the receiver (me) can respond
  const { data: req } = await admin
    .from('chat_requests')
    .select('id, sender_id, receiver_id, status')
    .eq('sender_id', senderId)
    .eq('receiver_id', meId)
    .eq('status', 'pending')
    .maybeSingle() as {
      data: Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status'> | null
      error: unknown
    }

  if (!req) {
    return Response.json({ error: 'No pending request found.' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Update the request status
  const { error: updateErr } = await admin
    .from('chat_requests')
    .update({ status: action === 'accept' ? 'accepted' : 'declined', responded_at: now })
    .eq('id', req.id)

  if (updateErr) {
    return Response.json({ error: 'Failed to respond to request.' }, { status: 500 })
  }

  if (action === 'decline') {
    return Response.json({ ok: true })
  }

  // ── Accept path ──────────────────────────────────────────────────────────
  // Enforce participant_a < participant_b ordering
  const participantA = senderId < meId ? senderId : meId
  const participantB = senderId < meId ? meId : senderId

  // Upsert conversation (idempotent — safe if somehow called twice)
  const { data: conv, error: convErr } = await admin
    .from('conversations')
    .upsert(
      { participant_a: participantA, participant_b: participantB },
      { onConflict: 'participant_a,participant_b', ignoreDuplicates: false }
    )
    .select('id')
    .single() as { data: Pick<DbConversation, 'id'> | null; error: unknown }

  if (convErr || !conv) {
    return Response.json({ error: 'Failed to create conversation.' }, { status: 500 })
  }

  // Upsert conversation_settings for both users (save_history = false by default)
  await admin
    .from('conversation_settings')
    .upsert(
      [
        { conversation_id: conv.id, user_id: senderId,  save_history: false, updated_at: now },
        { conversation_id: conv.id, user_id: meId,      save_history: false, updated_at: now },
      ],
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
    )

  return Response.json({ ok: true, conversationId: conv.id })
}
