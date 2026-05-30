import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbUser, DbChatRequest, DbConversation } from '@/types/database'
import type { ConnectionStatus } from '@/types'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { userId } = await params

  if (userId === meId) {
    return Response.json({ error: 'Use /api/me for your own profile.' }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  // Fetch user profile
  const { data: user } = await admin
    .from('users')
    .select('id, username, profile_photo, bio, last_seen_at')
    .eq('id', userId)
    .maybeSingle() as {
      data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio' | 'last_seen_at'> | null
      error: unknown
    }

  if (!user) return Response.json({ error: 'User not found.' }, { status: 404 })

  // Fetch the most relevant chat request between the two users
  const { data: requests } = await admin
    .from('chat_requests')
    .select('id, sender_id, receiver_id, status')
    .or(
      `and(sender_id.eq.${meId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${meId})`
    )
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(5) as {
      data: Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status'>[] | null
      error: unknown
    }

  // Determine connection status — prefer accepted over pending
  let connectionStatus: ConnectionStatus = 'none'
  const accepted = (requests ?? []).find(r => r.status === 'accepted')
  const pending  = (requests ?? []).find(r => r.status === 'pending')
  const req = accepted ?? pending

  if (req) {
    if (req.status === 'accepted') {
      connectionStatus = 'connected'
    } else if (req.sender_id === meId) {
      connectionStatus = 'request_sent'
    } else {
      connectionStatus = 'request_received'
    }
  }

  // If connected, find the conversation id so the client can open the chat
  let conversationId: string | null = null
  if (connectionStatus === 'connected') {
    const a = meId < userId ? meId : userId
    const b = meId < userId ? userId : meId
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('participant_a', a)
      .eq('participant_b', b)
      .maybeSingle() as { data: Pick<DbConversation, 'id'> | null; error: unknown }
    conversationId = conv?.id ?? null
  }

  return Response.json({
    profile: {
      id:           user.id,
      username:     user.username,
      profilePhoto: user.profile_photo,
      bio:          user.bio,
      lastSeenAt:   user.last_seen_at,
    },
    connectionStatus,
    conversationId,
  })
}
