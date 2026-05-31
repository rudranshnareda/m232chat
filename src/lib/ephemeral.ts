import { createSupabaseAdminClient } from './supabase/server'
import { deleteChatMediaObjects } from './storage'
import type { DbConversation, DbMessage, DbMessageMedia } from '@/types/database'

const RETENTION_DAYS = 30

/**
 * Cleans up ephemeral messages for the given user across all their conversations.
 * Called on every page refresh from AuthProvider (not the first open of a tab).
 *
 * Two-phase approach:
 *
 * PHASE 1 — hide from UI on refresh (soft-delete, any age):
 *   Any message where the current user's saved flag is false gets soft-deleted
 *   from their view so it disappears after a reload.
 *
 *   sender_saved=F  receiver_saved=F  → soft-delete from this user's view
 *   sender_saved=F  receiver_saved=T  → soft-delete from sender's view only
 *   sender_saved=T  receiver_saved=F  → soft-delete from receiver's view only
 *
 * PHASE 2 — remove from DB after RETENTION_DAYS:
 *   sender_saved=F  receiver_saved=F  → hard-delete row + storage after 30 days
 *
 * This means ephemeral messages stay on the server for up to 30 days even after
 * they've been hidden from the UI, giving a safety buffer for data recovery.
 */
export async function runEphemeralCleanup(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const now   = new Date().toISOString()
  const retentionCutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

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

  // 2. Fetch all non-hard-deleted messages, with their saved flags + timestamps
  const { data: messages } = await admin
    .from('messages')
    .select('id, sender_id, sender_saved, receiver_saved, deleted_for_sender_at, deleted_for_receiver_at, created_at')
    .in('conversation_id', conversationIds)
    .is('deleted_for_both_at', null) as {
      data: Pick<
        DbMessage,
        'id' | 'sender_id' | 'sender_saved' | 'receiver_saved' |
        'deleted_for_sender_at' | 'deleted_for_receiver_at' | 'created_at'
      >[] | null
      error: unknown
    }

  if (!messages?.length) return

  // 3. Bucket messages
  const hardDeleteIds:        string[] = []
  const softDeleteAsSender:   string[] = []
  const softDeleteAsReceiver: string[] = []

  for (const msg of messages) {
    const iAmSender = msg.sender_id === userId
    const isExpired = msg.created_at < retentionCutoff
    const bothEphemeral = msg.sender_saved === false && msg.receiver_saved === false

    if (bothEphemeral) {
      if (isExpired) {
        // Old enough — remove from DB entirely
        hardDeleteIds.push(msg.id)
      } else {
        // Still within retention window — soft-delete from THIS user's view
        // so it disappears on refresh while staying in the DB
        if (iAmSender && msg.deleted_for_sender_at === null) {
          softDeleteAsSender.push(msg.id)
        } else if (!iAmSender && msg.deleted_for_receiver_at === null) {
          softDeleteAsReceiver.push(msg.id)
        }
      }
    } else if (iAmSender && msg.sender_saved === false && msg.deleted_for_sender_at === null) {
      // I sent it, I opted out, they saved — hide from my view only
      softDeleteAsSender.push(msg.id)
    } else if (!iAmSender && msg.receiver_saved === false && msg.deleted_for_receiver_at === null) {
      // They sent it, I opted out, they saved — hide from my view only
      softDeleteAsReceiver.push(msg.id)
    }
  }

  // 4. Hard delete expired messages: storage first, then DB rows
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

  // 5. Soft-delete from sender's view
  if (softDeleteAsSender.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_sender_at: now })
      .in('id', softDeleteAsSender)
  }

  // 6. Soft-delete from receiver's view
  if (softDeleteAsReceiver.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_receiver_at: now })
      .in('id', softDeleteAsReceiver)
  }
}
