import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation } from '@/types/database'

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

// ── PATCH /api/conversations/[conversationId]/settings ─────────────────────
// Update the current user's save_history preference for this conversation.
// Body: { saveHistory: boolean }
// Upserts the conversation_settings row — safe to call even if the row
// doesn't exist yet.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params

  let body: { saveHistory?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof body.saveHistory !== 'boolean') {
    return Response.json({ error: 'saveHistory must be a boolean.' }, { status: 422 })
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

  const now = new Date().toISOString()

  const { error } = await admin
    .from('conversation_settings')
    .upsert(
      {
        conversation_id: conversationId,
        user_id:         meId,
        save_history:    body.saveHistory,
        updated_at:      now,
      },
      { onConflict: 'conversation_id,user_id' }
    )

  if (error) {
    return Response.json({ error: 'Failed to update settings.' }, { status: 500 })
  }

  return Response.json({ ok: true, saveHistory: body.saveHistory })
}
