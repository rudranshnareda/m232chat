import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { profilePhotoUrl } from '@/lib/storage'
import type { DbChatRequest, DbUser } from '@/types/database'

// ── GET /api/requests ──────────────────────────────────────────────────────
// Returns all incoming *pending* requests for the authenticated user,
// each with the sender's profile attached.
export async function GET(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createSupabaseAdminClient()

  const { data: requests, error } = await admin
    .from('chat_requests')
    .select('id, sender_id, receiver_id, status, created_at, responded_at')
    .eq('receiver_id', meId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false }) as {
      data: Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status' | 'created_at' | 'responded_at'>[] | null
      error: unknown
    }

  if (error || !requests) {
    return Response.json({ error: 'Failed to load requests.' }, { status: 500 })
  }

  if (requests.length === 0) return Response.json({ requests: [] })

  // Fetch sender profiles
  const senderIds = [...new Set(requests.map(r => r.sender_id))]
  const { data: senders } = await admin
    .from('users')
    .select('id, username, profile_photo, bio, last_seen_at')
    .in('id', senderIds) as {
      data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio' | 'last_seen_at'>[] | null
      error: unknown
    }

  const senderMap = new Map((senders ?? []).map(s => [s.id, s]))

  const result = requests.map(req => {
    const sender = senderMap.get(req.sender_id)
    return {
      id:          req.id,
      senderId:    req.sender_id,
      receiverId:  req.receiver_id,
      status:      req.status,
      createdAt:   req.created_at,
      respondedAt: req.responded_at,
      sender: sender
        ? {
            id:           sender.id,
            username:     sender.username,
            profilePhoto: profilePhotoUrl(sender.profile_photo),
            bio:          sender.bio,
            lastSeenAt:   sender.last_seen_at,
          }
        : null,
    }
  })

  return Response.json({ requests: result })
}

// ── POST /api/requests ─────────────────────────────────────────────────────
// Send a chat request to another user.
// Body: { receiverId: string }
export async function POST(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  let body: { receiverId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { receiverId } = body
  if (!receiverId) return Response.json({ error: 'receiverId is required.' }, { status: 422 })
  if (receiverId === meId) return Response.json({ error: 'Cannot send a request to yourself.' }, { status: 422 })

  const admin = createSupabaseAdminClient()

  // Check receiver exists
  const { data: receiver } = await admin
    .from('users')
    .select('id')
    .eq('id', receiverId)
    .maybeSingle() as { data: { id: string } | null; error: unknown }

  if (!receiver) return Response.json({ error: 'User not found.' }, { status: 404 })

  // Check there isn't already an accepted relationship
  const { data: existing } = await admin
    .from('chat_requests')
    .select('id, status')
    .or(
      `and(sender_id.eq.${meId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${meId})`
    )
    .in('status', ['pending', 'accepted'])
    .maybeSingle() as { data: { id: string; status: string } | null; error: unknown }

  if (existing?.status === 'accepted') {
    return Response.json({ error: 'You are already connected.' }, { status: 409 })
  }
  if (existing?.status === 'pending') {
    return Response.json({ error: 'A request is already pending.' }, { status: 409 })
  }

  // Insert
  const { data: req, error } = await admin
    .from('chat_requests')
    .insert({ sender_id: meId, receiver_id: receiverId })
    .select('id, sender_id, receiver_id, status, created_at')
    .single() as {
      data: Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status' | 'created_at'> | null
      error: unknown
    }

  if (error || !req) {
    return Response.json({ error: 'Failed to send request.' }, { status: 500 })
  }

  return Response.json({ request: req }, { status: 201 })
}

// ── DELETE /api/requests?receiverId=X ─────────────────────────────────────
// Cancel a pending request that the current user sent.
export async function DELETE(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const receiverId = request.nextUrl.searchParams.get('receiverId')
  if (!receiverId) return Response.json({ error: 'receiverId query param required.' }, { status: 422 })

  const admin = createSupabaseAdminClient()

  const { error } = await admin
    .from('chat_requests')
    .delete()
    .eq('sender_id', meId)
    .eq('receiver_id', receiverId)
    .eq('status', 'pending')

  if (error) {
    return Response.json({ error: 'Failed to cancel request.' }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
