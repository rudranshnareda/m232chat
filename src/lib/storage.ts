import { createSupabaseAdminClient } from './supabase/server'

export const BUCKETS = {
  profilePhotos: 'profile-photos',
  chatMedia: 'chat-media',
} as const

// Builds the Storage path for a profile photo.
export function profilePhotoPath(userId: string, filename: string): string {
  return `${userId}/${filename}`
}

// Builds the Storage path for a chat media file.
// Structure: {conversationId}/{messageId}/{filename}
export function chatMediaPath(conversationId: string, messageId: string, filename: string): string {
  return `${conversationId}/${messageId}/${filename}`
}

// Returns the public URL for a profile photo (profile-photos bucket is public).
// Accepts null (no photo) and already-resolved full URLs transparently.
export function profilePhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null
  if (storagePath.startsWith('http')) return storagePath  // already a full URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${supabaseUrl}/storage/v1/object/public/profile-photos/${storagePath}`
}

// Returns a signed URL for a chat media file (chat-media bucket is private).
// TTL defaults to 1 hour for ephemeral, or 7 days for persisted messages.
export async function signedChatMediaUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.storage
    .from(BUCKETS.chatMedia)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data) return null
  return data.signedUrl
}

// Deletes a list of Storage objects from the chat-media bucket.
// Used by ephemeral cleanup. Idempotent — deleting a missing object is fine.
export async function deleteChatMediaObjects(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return
  const admin = createSupabaseAdminClient()
  await admin.storage.from(BUCKETS.chatMedia).remove(storagePaths)
}
