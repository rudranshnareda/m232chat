import { createSupabaseAdminClient } from './supabase/server'
import { deleteChatMediaObjects } from './storage'
import type { DbConversation, DbMessage, DbMessageMedia, DbMessageStatus } from '@/types/database'

const RETENTION_DAYS = 30

/**
 * Ephemeral cleanup — called on every page refresh (not first open of a tab).
 *
 * Core rule:
 *   • Sender's copy   → eligible for cleanup immediately (they composed it = already seen)
 *   • Receiver's copy → eligible ONLY after read_at is set (they opened the chat and saw it)
 *
 * This prevents messages from vanishing before the recipient has had a
 * chance to read them, even if they refresh the app.
 *
 * Visibility matrix after cleanup on refresh:
 *
 *   sender_saved  receiver_saved  seen by receiver?  → action
 *   ──────────────────────────────────────────────────────────
 *   false         false           no   → soft-delete sender copy only; receiver copy kept
 *   false         false           yes  → soft-delete both copies (hard-delete after 30 days)
 *   false         true            -    → soft-delete sender copy only
 *   true          false           no   → nothing (receiver hasn't seen it yet)
 *   true          false           yes  → soft-delete receiver copy only
 *   true          true            -    → nothing (both saving)
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

  // 2. Fetch all non-hard-deleted messages
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

  const messageIds = messages.map((m) => m.id)

  // 3. Fetch read_at for each message so we know which ones the recipient has seen
  const { data: statusRows } = await admin
    .from('message_status')
    .select('message_id, read_at')
    .in('message_id', messageIds) as {
      data: Pick<DbMessageStatus, 'message_id' | 'read_at'>[] | null
      error: unknown
    }

  const readAtMap = new Map(
    (statusRows ?? []).map((s) => [s.message_id, s.read_at])
  )

  // 4. Bucket messages
  const hardDeleteIds:        string[] = []
  const softDeleteAsSender:   string[] = []
  const softDeleteAsReceiver: string[] = []

  for (const msg of messages) {
    const iAmSender    = msg.sender_id === userId
    const isExpired    = msg.created_at < retentionCutoff
    const bothEphemeral = msg.sender_saved === false && msg.receiver_saved === false
    // A message is "seen by receiver" when message_status.read_at is set.
    // Senders always count as having seen their own message (they typed it).
    const seenByReceiver = !!readAtMap.get(msg.id)

    if (bothEphemeral) {
      if (isExpired) {
        // Old enough — remove from DB entirely (hard delete)
        hardDeleteIds.push(msg.id)
        continue
      }
      // Sender copy: always eligible (sender saw it when they sent it)
      if (iAmSender && msg.deleted_for_sender_at === null) {
        softDeleteAsSender.push(msg.id)
      }
      // Receiver copy: only if they've actually read it
      if (!iAmSender && seenByReceiver && msg.deleted_for_receiver_at === null) {
        softDeleteAsReceiver.push(msg.id)
      }
    } else if (iAmSender && msg.sender_saved === false && msg.deleted_for_sender_at === null) {
      // I sent it with history off — hide my copy (I saw it when I sent it)
      softDeleteAsSender.push(msg.id)
    } else if (!iAmSender && msg.receiver_saved === false && seenByReceiver && msg.deleted_for_receiver_at === null) {
      // They sent it, I have history off, and I've read it — hide from my view
      softDeleteAsReceiver.push(msg.id)
    }
  }

  // 5. Hard delete expired messages: storage first, then DB rows
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

    await admin.from('messages').delete().in('id', hardDeleteIds)
  }

  // 6. Soft-delete from sender's view
  if (softDeleteAsSender.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_sender_at: now })
      .in('id', softDeleteAsSender)
  }

  // 7. Soft-delete from receiver's view
  if (softDeleteAsReceiver.length > 0) {
    await admin
      .from('messages')
      .update({ deleted_for_receiver_at: now })
      .in('id', softDeleteAsReceiver)
  }
}
