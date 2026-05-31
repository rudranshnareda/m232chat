import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { profilePhotoUrl } from '@/lib/storage'
import type { DbConversation, DbConversationSetting, DbMessage, DbMessageStatus, DbUser } from '@/types/database'

// ── GET /api/conversations ─────────────────────────────────────────────────
// Returns all conversations for the authenticated user, sorted by last
// message time descending (most recent first).
// Each item includes: other user's profile, last message preview, save_history.

export async function GET(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createSupabaseAdminClient()

  // 1. Fetch all conversations the user is part of
  const { data: convRows, error: convErr } = await admin
    .from('conversations')
    .select('id, participant_a, participant_b, created_at')
    .or(`participant_a.eq.${meId},participant_b.eq.${meId}`)
    .order('created_at', { ascending: false }) as {
      data: Pick<DbConversation, 'id' | 'participant_a' | 'participant_b' | 'created_at'>[] | null
      error: unknown
    }

  if (convErr || !convRows) {
    return Response.json({ error: 'Failed to load conversations.' }, { status: 500 })
  }

  if (convRows.length === 0) return Response.json({ conversations: [] })

  const convIds         = convRows.map(c => c.id)
  const otherIds        = convRows.map(c => c.participant_a === meId ? c.participant_b : c.participant_a)
  const uniqueOtherIds  = [...new Set(otherIds)]

  // 2. Parallelise: profiles + settings + last message per conversation
  const fetchProfiles = async () => {
    const { data } = await admin
      .from('users')
      .select('id, username, profile_photo, bio, last_seen_at')
      .in('id', uniqueOtherIds) as {
        data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio' | 'last_seen_at'>[] | null
        error: unknown
      }
    return data ?? []
  }

  const fetchSettings = async () => {
    const { data } = await admin
      .from('conversation_settings')
      .select('conversation_id, save_history')
      .eq('user_id', meId)
      .in('conversation_id', convIds) as {
        data: Pick<DbConversationSetting, 'conversation_id' | 'save_history'>[] | null
        error: unknown
      }
    return data ?? []
  }

  const fetchLastMsg = async (convId: string) => {
    const { data } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, content, message_type, created_at')
      .eq('conversation_id', convId)
      .is('deleted_for_both_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as {
        data: Pick<DbMessage, 'id' | 'conversation_id' | 'sender_id' | 'content' | 'message_type' | 'created_at'> | null
        error: unknown
      }
    return data
  }

  // Unread counts: messages sent by others with no read receipt yet.
  // Two batched queries instead of N per-conversation queries.
  const fetchUnreadCounts = async (): Promise<Map<string, number>> => {
    // All messages in these conversations NOT sent by me
    const { data: theirMsgs } = await admin
      .from('messages')
      .select('id, conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', meId)
      .is('deleted_for_both_at', null) as {
        data: Pick<DbMessage, 'id' | 'conversation_id'>[] | null
        error: unknown
      }

    if (!theirMsgs?.length) return new Map()

    const theirMsgIds = theirMsgs.map(m => m.id)

    // Which of those have no read receipt yet?
    const { data: unreadStatuses } = await admin
      .from('message_status')
      .select('message_id')
      .in('message_id', theirMsgIds)
      .is('read_at', null) as {
        data: Pick<DbMessageStatus, 'message_id'>[] | null
        error: unknown
      }

    const unreadSet = new Set((unreadStatuses ?? []).map(s => s.message_id))

    // Build convId → unread count
    const counts = new Map<string, number>()
    for (const msg of theirMsgs) {
      if (unreadSet.has(msg.id)) {
        counts.set(msg.conversation_id, (counts.get(msg.conversation_id) ?? 0) + 1)
      }
    }
    return counts
  }

  const [profiles, settings, unreadCounts, ...lastMessages] = await Promise.all([
    fetchProfiles(),
    fetchSettings(),
    fetchUnreadCounts(),
    ...convRows.map(c => fetchLastMsg(c.id)),
  ])

  // 3. Build lookup maps
  const profileMap   = new Map((profiles  as Awaited<ReturnType<typeof fetchProfiles>>).map(p => [p.id, p]))
  const settingsMap  = new Map((settings  as Awaited<ReturnType<typeof fetchSettings>>).map(s => [s.conversation_id, s.save_history]))
  const unreadMap    = unreadCounts as Awaited<ReturnType<typeof fetchUnreadCounts>>

  // 4. Assemble and sort
  const conversations = convRows
    .map((conv, i) => {
      const otherId     = conv.participant_a === meId ? conv.participant_b : conv.participant_a
      const profile     = profileMap.get(otherId)
      const saveHistory = settingsMap.get(conv.id) ?? false
      const lastMsg     = (lastMessages[i] as Awaited<ReturnType<typeof fetchLastMsg>>) ?? null

      return {
        id:          conv.id,
        createdAt:   conv.created_at,
        saveHistory,
        unreadCount: unreadMap.get(conv.id) ?? 0,
        otherUser: profile
          ? {
              id:           profile.id,
              username:     profile.username,
              profilePhoto: profilePhotoUrl(profile.profile_photo),
              bio:          profile.bio,
              lastSeenAt:   profile.last_seen_at,
            }
          : null,
        lastMessage: lastMsg
          ? {
              id:          lastMsg.id,
              senderId:    lastMsg.sender_id,
              content:     lastMsg.content,
              messageType: lastMsg.message_type,
              createdAt:   lastMsg.created_at,
            }
          : null,
      }
    })
    .sort((a, b) => {
      const tA = a.lastMessage?.createdAt ?? a.createdAt
      const tB = b.lastMessage?.createdAt ?? b.createdAt
      return tB.localeCompare(tA)
    })

  return Response.json({ conversations })
}
