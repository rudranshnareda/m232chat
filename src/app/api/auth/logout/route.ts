import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { clearAuthCookies } from '@/lib/auth-cookies'

export async function POST(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id')
  const userId    = request.headers.get('x-user-id')

  if (sessionId && userId) {
    const admin = createSupabaseAdminClient()
    await admin
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId)
      .eq('user_id', userId)
  }

  await clearAuthCookies()

  return Response.json({ ok: true })
}
