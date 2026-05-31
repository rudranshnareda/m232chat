import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'
import { setAuthCookies } from '@/lib/auth-cookies'
import { runEphemeralCleanup } from '@/lib/ephemeral'
import { profilePhotoUrl } from '@/lib/storage'
import type { DbUser, DbUserSession } from '@/types/database'

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { username, password } = body

  if (!username?.trim() || !password) {
    return Response.json({ error: 'Username and password are required.' }, { status: 422 })
  }

  const admin = createSupabaseAdminClient()

  // --- Find user (case-insensitive) ---
  const { data: user } = await admin
    .from('users')
    .select('id, username, password_hash, profile_photo, bio')
    .ilike('username', username.trim())
    .maybeSingle() as { data: Pick<DbUser, 'id' | 'username' | 'password_hash' | 'profile_photo' | 'bio'> | null; error: unknown }

  if (!user) {
    return Response.json({ error: 'Invalid username or password.' }, { status: 401 })
  }

  // --- Verify password ---
  const passwordMatch = await bcrypt.compare(password, user.password_hash)
  if (!passwordMatch) {
    return Response.json({ error: 'Invalid username or password.' }, { status: 401 })
  }

  // --- Check for an existing active session (single-tab enforcement) ---
  const { data: existingSession } = await admin
    .from('user_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle() as { data: Pick<DbUserSession, 'id'> | null; error: unknown }

  const sessionConflict = !!existingSession

  // --- Deactivate all existing sessions for this user ---
  await admin
    .from('user_sessions')
    .update({ is_active: false })
    .eq('user_id', user.id)

  // --- Create new session ---
  const { data: session } = await admin
    .from('user_sessions')
    .insert({ user_id: user.id, is_active: true })
    .select('id')
    .single() as { data: Pick<DbUserSession, 'id'> | null; error: unknown }

  if (!session) {
    return Response.json({ error: 'Session creation failed.' }, { status: 500 })
  }

  // --- Ephemeral cleanup ---
  await runEphemeralCleanup(user.id)

  // --- Update last_seen_at ---
  await admin
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  // --- Sign tokens ---
  const accessToken  = await signAccessToken({
    sub:          user.id,
    username:     user.username,
    sessionId:    session.id,
    profilePhoto: profilePhotoUrl(user.profile_photo),
    bio:          user.bio,
  })
  const refreshToken = await signRefreshToken(user.id, session.id)

  await setAuthCookies(accessToken, refreshToken)

  return Response.json({
    user: {
      id:           user.id,
      username:     user.username,
      profilePhoto: profilePhotoUrl(user.profile_photo),
      bio:          user.bio,
      sessionId:    session.id,
    },
    accessToken,
    sessionConflict,
  })
}
