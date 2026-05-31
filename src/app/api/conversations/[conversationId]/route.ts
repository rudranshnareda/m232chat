import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { profilePhotoUrl } from '@/lib/storage'
import type { DbConversation, DbConversationSetting, DbUser } from '@/types/database'

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

// ── GET /api/conversations/[conversationId] ───────────────────────────────
// Returns conversation metadata: other user's profile + caller's save_history.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params
  const admin = createSupabaseAdminClient()

  // Verify participant + get other user id
  const { data: conv } = await admin
    .from('conversations')
    .select('id, participant_a, participant_b, created_at')
    .eq('id', conversationId)
    .maybeSingle() as {
      data: Pick<DbConversation, 'id' | 'participant_a' | 'participant_b' | 'created_at'> | null
      error: unknown
    }

  if (!conv) return Response.json({ error: 'Conversation not found.' }, { status: 404 })

  const isParticipant = conv.participant_a === meId || conv.participant_b === meId
  if (!isParticipant) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const otherId = conv.participant_a === meId ? conv.participant_b : conv.participant_a

  // Fetch other user profile + my save_history in parallel
  const [profileRes, settingRes] = await Promise.all([
    (async () => {
      const { data } = await admin
        .from('users')
        .select('id, username, profile_photo, bio, last_seen_at')
        .eq('id', otherId)
        .maybeSingle() as {
          data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio' | 'last_seen_at'> | null
          error: unknown
        }
      return data
    })(),
    (async () => {
      const { data } = await admin
        .from('conversation_settings')
        .select('save_history')
        .eq('conversation_id', conversationId)
        .eq('user_id', meId)
        .maybeSingle() as {
          data: Pick<DbConversationSetting, 'save_history'> | null
          error: unknown
        }
      return data
    })(),
  ])

  return Response.json({
    conversation: {
      id:          conv.id,
      createdAt:   conv.created_at,
      saveHistory: settingRes?.save_history ?? false,
      otherUser:   profileRes
        ? {
            id:           profileRes.id,
            username:     profileRes.username,
            profilePhoto: profilePhotoUrl(profileRes.profile_photo),
            bio:          profileRes.bio,
            lastSeenAt:   profileRes.last_seen_at,
          }
        : null,
    },
  })
}
