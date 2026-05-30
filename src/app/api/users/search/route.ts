import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbUser, DbChatRequest } from '@/types/database'
import type { ConnectionStatus } from '@/types'

export async function GET(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''

  const admin = createSupabaseAdminClient()

  // If no query, return all users (excluding self); otherwise filter by username
  const baseQuery = admin
    .from('users')
    .select('id, username, profile_photo, bio, last_seen_at')
    .neq('id', meId)
    .order('username', { ascending: true })
    .limit(50)

  const { data: rows, error } = (q.length > 0
    ? await baseQuery.ilike('username', `%${q}%`)
    : await baseQuery) as {
      data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio' | 'last_seen_at'>[] | null
      error: unknown
    }

  if (error || !rows) {
    return Response.json({ error: 'Search failed.' }, { status: 500 })
  }

  if (rows.length === 0) return Response.json({ users: [] })

  const theirIds = rows.map(r => r.id)

  // Fetch all relevant chat requests in one query
  const { data: requests } = await admin
    .from('chat_requests')
    .select('id, sender_id, receiver_id, status')
    .or(
      theirIds
        .map(id => `and(sender_id.eq.${meId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${meId})`)
        .join(',')
    )
    .in('status', ['pending', 'accepted']) as {
      data: Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status'>[] | null
      error: unknown
    }

  // Build a map: theirId → latest relevant request
  const requestMap = new Map<string, Pick<DbChatRequest, 'id' | 'sender_id' | 'receiver_id' | 'status'>>()
  for (const req of requests ?? []) {
    const otherId = req.sender_id === meId ? req.receiver_id : req.sender_id
    // accepted overrides pending — take accepted first; otherwise last write wins (array is unordered)
    const existing = requestMap.get(otherId)
    if (!existing || req.status === 'accepted') {
      requestMap.set(otherId, req)
    }
  }

  const users = rows.map(row => {
    const req = requestMap.get(row.id)
    let connectionStatus: ConnectionStatus = 'none'
    if (req) {
      if (req.status === 'accepted') {
        connectionStatus = 'connected'
      } else if (req.sender_id === meId) {
        connectionStatus = 'request_sent'
      } else {
        connectionStatus = 'request_received'
      }
    }

    return {
      id:               row.id,
      username:         row.username,
      profilePhoto:     row.profile_photo,
      bio:              row.bio,
      lastSeenAt:       row.last_seen_at,
      connectionStatus,
    }
  })

  return Response.json({ users })
}
