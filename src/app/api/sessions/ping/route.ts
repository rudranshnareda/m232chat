import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbUserSession } from '@/types/database'

export async function PATCH(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id')
  const userId    = request.headers.get('x-user-id')

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

  await admin
    .from('user_sessions')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', sessionId)

  return Response.json({ ok: true, sessionReplaced: false })
}
