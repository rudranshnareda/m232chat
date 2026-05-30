import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'
import { setAuthCookies } from '@/lib/auth-cookies'
import { runEphemeralCleanup } from '@/lib/ephemeral'
import { BUCKETS, profilePhotoPath } from '@/lib/storage'
import {
  validateUsername,
  validatePassword,
  validateBio,
  validateProfilePhoto,
} from '@/lib/validations'
import type { DbUserSession } from '@/types/database'

export async function POST(request: NextRequest) {
  const formData = await request.formData()

  const username     = formData.get('username') as string | null
  const password     = formData.get('password') as string | null
  const bio          = formData.get('bio')
  const profilePhoto = formData.get('profilePhoto')

  // --- Validate ---
  const errors = [
    validateUsername(username),
    validatePassword(password),
    validateBio(bio),
    validateProfilePhoto(profilePhoto),
  ].filter(Boolean)

  if (errors.length) {
    return Response.json({ error: errors[0]!.message, field: errors[0]!.field }, { status: 422 })
  }

  const admin = createSupabaseAdminClient()

  // --- Username uniqueness (case-insensitive) ---
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .ilike('username', username!.trim())
    .maybeSingle()

  if (existing) {
    return Response.json({ error: 'Username is already taken.', field: 'username' }, { status: 409 })
  }

  // --- Hash password ---
  const passwordHash = await bcrypt.hash(password!, 12)

  // --- Generate user ID ahead of time (needed for storage path) ---
  const userId = crypto.randomUUID()

  // --- Upload profile photo ---
  const file = profilePhoto as File
  const ext  = file.type.split('/')[1] ?? 'jpg'
  const path = profilePhotoPath(userId, `${Date.now()}.${ext}`)

  const photoBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from(BUCKETS.profilePhotos)
    .upload(path, photoBuffer, { contentType: file.type })

  if (uploadErr) {
    return Response.json({ error: 'Failed to upload profile photo. Please try again.' }, { status: 500 })
  }

  const bioValue = bio ? (bio as string).trim() || null : null

  // --- Insert user row ---
  const { error: insertErr } = await admin.from('users').insert({
    id:            userId,
    username:      username!.trim(),
    password_hash: passwordHash,
    profile_photo: path,
    bio:           bioValue,
  })

  if (insertErr) {
    await admin.storage.from(BUCKETS.profilePhotos).remove([path])
    return Response.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }

  // --- Create session ---
  const { data: session } = await admin
    .from('user_sessions')
    .insert({ user_id: userId, is_active: true })
    .select('id')
    .single() as { data: Pick<DbUserSession, 'id'> | null; error: unknown }

  if (!session) {
    return Response.json({ error: 'Session creation failed.' }, { status: 500 })
  }

  // Ephemeral cleanup is a no-op on first login but safe to call
  await runEphemeralCleanup(userId)

  // --- Sign tokens ---
  const accessToken  = await signAccessToken({
    sub:          userId,
    username:     username!.trim(),
    sessionId:    session.id,
    profilePhoto: path,
    bio:          bioValue,
  })
  const refreshToken = await signRefreshToken(userId, session.id)

  await setAuthCookies(accessToken, refreshToken)

  return Response.json({
    user: {
      id:           userId,
      username:     username!.trim(),
      profilePhoto: path,
      bio:          bioValue,
      sessionId:    session.id,
    },
    accessToken,
  })
}
