import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/jwt'
import { setAuthCookies, getRefreshToken } from '@/lib/auth-cookies'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbUser, DbUserSession } from '@/types/database'

export async function POST() {
  const refreshToken = await getRefreshToken()

  if (!refreshToken) {
    return Response.json({ error: 'No refresh token.' }, { status: 401 })
  }

  const payload = await verifyRefreshToken(refreshToken)
  if (!payload) {
    return Response.json({ error: 'Invalid or expired refresh token.' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()

  // --- Verify session is still active ---
  const { data: session } = await admin
    .from('user_sessions')
    .select('id, user_id, is_active')
    .eq('id', payload.sessionId)
    .eq('user_id', payload.sub)
    .maybeSingle() as { data: Pick<DbUserSession, 'id' | 'user_id' | 'is_active'> | null; error: unknown }

  if (!session?.is_active) {
    return Response.json({ error: 'Session is no longer active.' }, { status: 401 })
  }

  // --- Fetch fresh user data ---
  const { data: user } = await admin
    .from('users')
    .select('id, username, profile_photo, bio')
    .eq('id', payload.sub)
    .single() as { data: Pick<DbUser, 'id' | 'username' | 'profile_photo' | 'bio'> | null; error: unknown }

  if (!user) {
    return Response.json({ error: 'User not found.' }, { status: 401 })
  }

  // --- Rotate tokens ---
  const newAccessToken  = await signAccessToken({
    sub:          user.id,
    username:     user.username,
    sessionId:    session.id,
    profilePhoto: user.profile_photo,
    bio:          user.bio,
  })
  const newRefreshToken = await signRefreshToken(user.id, session.id)

  await admin
    .from('user_sessions')
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', session.id)

  await setAuthCookies(newAccessToken, newRefreshToken)

  return Response.json({
    accessToken: newAccessToken,
    user: {
      id:           user.id,
      username:     user.username,
      profilePhoto: user.profile_photo,
      bio:          user.bio,
      sessionId:    session.id,
    },
  })
}
