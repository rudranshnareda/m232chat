import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbUserSession } from '@/types/database'

// Only update last_seen_at every 5 minutes to reduce DB writes.
// The ping itself fires every 2 minutes, but last_seen_at precision
// of ~5 minutes is plenty for "last seen X ago" display.
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000

export async function PATCH(request: NextRequest) {
  const sessionId    = request.headers.get('x-session-id')
  const userId       = request.headers.get('x-user-id')
  const lastSeenHeader = request.headers.get('x-last-seen-at')

  if (!sessionId || !userId) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()

  const { data: session } = await admin
    .from('user_sessions')
    .select('id, is_active')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle() as { data: Pick<DbUserSession, 'id' | 'is_active'> | null; error: unknown }

  if (!session?.is_active) {
    return Response.json({ sessionReplaced: true }, { status: 200 })
  }

  const now = new Date().toISOString()

  // Decide whether to update last_seen_at this ping
  const lastSeenAt   = lastSeenHeader ? new Date(lastSeenHeader).getTime() : 0
  const shouldUpdate = Date.now() - lastSeenAt >= LAST_SEEN_UPDATE_INTERVAL_MS

  const updates: Promise<unknown>[] = [
    admin
      .from('user_sessions')
      .update({ last_ping_at: now })
      .eq('id', sessionId)
      .then(),
  ]

  if (shouldUpdate) {
    updates.push(
      admin
        .from('users')
        .update({ last_seen_at: now })
        .eq('id', userId)
        .then()
    )
  }

  await Promise.all(updates)

  return Response.json({ ok: true, sessionReplaced: false, lastSeenAt: shouldUpdate ? now : (lastSeenHeader ?? null) })
}
