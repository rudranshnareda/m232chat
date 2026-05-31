import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation, DbMessageReaction } from '@/types/database'

const ALLOWED_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏'])

interface RouteContext {
  params: Promise<{ conversationId: string; messageId: string }>
}

// POST /api/conversations/[conversationId]/messages/[messageId]/react
// Body: { emoji: string }
// Toggles a reaction — adds it if absent, removes it if the user already reacted.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId, messageId } = await params

  let body: { emoji?: string }
  try { body = await request.json() }
  catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const { emoji } = body
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return Response.json({ error: 'Invalid emoji.' }, { status: 422 })
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
  if (conv.participant_a !== meId && conv.participant_b !== meId) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Toggle: check if the reaction already exists
  const { data: existing } = await admin
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', meId)
    .eq('emoji', emoji)
    .maybeSingle() as { data: Pick<DbMessageReaction, 'id'> | null; error: unknown }

  if (existing) {
    await admin.from('message_reactions').delete().eq('id', existing.id)
    return Response.json({ ok: true, action: 'removed', emoji })
  }

  await admin.from('message_reactions').insert({
    message_id:      messageId,
    conversation_id: conversationId,
    user_id:         meId,
    emoji,
  })
  return Response.json({ ok: true, action: 'added', emoji })
}
