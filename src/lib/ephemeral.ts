import { createSupabaseAdminClient } from './supabase/server'
import { deleteChatMediaObjects } from './storage'
import type { DbConversation, DbMessage, DbMessageMedia } from '@/types/database'

/**
 * Cleans up ephemeral messages for the given user across all their conversations.
 * Called on every page load/refresh from AuthProvider.
 *
 * Three cases handled per message:
 *
 *   sender_saved=F  receiver_saved=F  → hard delete (both users opted out)
 *   sender_saved=F  receiver_saved=T  → soft-delete from sender's view only
 *   sender_saved=T  receiver_saved=F  → soft-delete from receiver's view only
 *
 * Soft-deletes use deleted_for_sender_at / deleted_for_receiver_at so the
 * other user's view is unaffected. The messages query already filters on
 * these columns, so soft-deleted rows disappear for the right user on reload.
 */
export async function runEphemeralCleanup(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const now   = new Date().toISOString()

  // 1. Find all conversation IDs for this user
  const { data: convRows } = await admin
    .from('conversations')
    .select('id')
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`) as {
      data: Pick<DbConversation, 'id'>[] | null
      error: unknown
    }

  if (!convRows?.length) return

  const conversationIds = convRows.map((c) => c.id)

  // 2. Fetch all non-deleted messages in those conversations, with their saved flags
  const { data: messages } = await admin
    .from('messages')
    .select('id, sender_id, sender_saved, receiver_saved, deleted_for_sender_at, deleted_for_receiver_at')
    .in('conversation_id', conversationIds)
    .is('deleted_for_both_at', null) as {
      data: Pick<
        DbMessage,
        'id' | 'sender_id' | 'sender_saved' | 'receiver_saved' |
        'deleted_for_sender_at' | 'deleted_for_receiver_at'
      >[] | null
      error: unknown
    }

  if (!messages?.length) return

  // 3. Bucket messages into what needs to happen
  const hardDeleteIds:        string[] = []  // both opted out → wipe row entirely
  const softDeleteAsSender:   string[] = []  // I sent it, I opted out, they saved → hide from my view
  const softDeleteAsReceiver: string[] = []  // they sent it, I opted out, they saved → hide from my view

  for (const msg of messages) {
    const iAmSender = msg.sender_id === userId

    if (msg.sender_saved === false && msg.receiver_saved === false) {
      hardDeleteIds.push(msg.id)
    } else if (iAmSender && msg.sender_saved === false && msg.deleted_for_sender_at === null) {
      softDeleteAsSender.push(msg.id)
    } else if (!iAmSender && msg.receiver_saved === false && msg.deleted_for_receiver_at === null) {
      softDeleteAsReceiver.push(msg.id)
    }
  }

  // 4. Hard delete: storage first, then DB rows
  if (hardDeleteIds.length > 0) {
    const { data: mediaRows } = await admin
      .from('message_media')
      .select('storage_path')
      .in('message_id', hardDeleteIds) as {
        data: Pick<DbMessageMedia, 'storage_path'>[] | null
        error: unknown
      }

    if (mediaRows?.length) {
      await deleteChatMediaObjects(mediaRows.map((m) => m.storage_path))
    }

    await admin
      .from('messages')
      .delete()
      .in('id', hardDeleteIds)
  }

  // 5. Soft-delete from sender's view (only messages not already soft-deleted)
  if (softDeleteAsSender.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_sender_at: now })
      .in('id', softDeleteAsSender)
  }

  // 6. Soft-delete from receiver's view (only messages not already soft-deleted)
  if (softDeleteAsReceiver.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_receiver_at: now })
      .in('id', softDeleteAsReceiver)
  }
}
