import { createSupabaseAdminClient } from './supabase/server'
import { deleteChatMediaObjects } from './storage'
import type { DbConversation, DbMessage, DbMessageMedia } from '@/types/database'

/**
 * Deletes all ephemeral messages (sender_saved=false AND receiver_saved=false)
 * for every conversation the given user participates in.
 *
 * Called on every login. Idempotent — safe to call multiple times.
 * Deletes Storage objects before DB rows to avoid orphaned files.
 */
export async function runEphemeralCleanup(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient()

  // 1. Find all conversation IDs for this user
  const { data: convRows } = await admin
    .from('conversations')
    .select('id')
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`) as { data: Pick<DbConversation, 'id'>[] | null; error: unknown }

  if (!convRows?.length) return

  const conversationIds = convRows.map((c) => c.id)

  // 2. Find all ephemeral message IDs in those conversations
  const { data: messages } = await admin
    .from('messages')
    .select('id')
    .in('conversation_id', conversationIds)
    .eq('sender_saved', false)
    .eq('receiver_saved', false)
    .is('deleted_for_both_at', null) as { data: Pick<DbMessage, 'id'>[] | null; error: unknown }

  if (!messages?.length) return

  const messageIds = messages.map((m) => m.id)

  // 3. Find Storage paths for any media attached to those messages
  const { data: mediaRows } = await admin
    .from('message_media')
    .select('storage_path')
    .in('message_id', messageIds) as { data: Pick<DbMessageMedia, 'storage_path'>[] | null; error: unknown }

  // 4. Delete Storage objects first (idempotent — missing objects are fine)
  if (mediaRows?.length) {
    await deleteChatMediaObjects(mediaRows.map((m) => m.storage_path))
  }

  // 5. Delete message rows — cascades to message_media and message_status
  await admin
    .from('messages')
    .delete()
    .in('id', messageIds)
}
