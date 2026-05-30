import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { DbConversation, DbMessage } from '@/types/database'

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

function getMimeCategory(mimeType: string): 'image' | 'video' | 'voice_note' | 'file' {
  if (mimeType.startsWith('image/'))  return 'image'
  if (mimeType.startsWith('video/'))  return 'video'
  if (mimeType.startsWith('audio/'))  return 'voice_note'
  return 'file'
}

// ── POST /api/conversations/[conversationId]/messages/upload ───────────────
// Upload a media file and create a message.
// Body: FormData with 'file' and optional 'replyToMessageId'.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  const { conversationId } = await params
  const admin = createSupabaseAdminClient()

  // Verify participant
  const { data: conv } = (await admin
    .from('conversations')
    .select('participant_a, participant_b, created_at')
    .eq('id', conversationId)
    .maybeSingle()) as { data: DbConversation | null; error: unknown }

  if (!conv) return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  const isMember =
    conv.participant_a === meId || conv.participant_b === meId
  if (!isMember) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  // Parse FormData
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const replyToMessageId = (formData.get('replyToMessageId') as string | null) ?? null

  if (!file) return Response.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File too large (max 50 MB).' }, { status: 400 })
  }

  // Validate reply-to if provided
  if (replyToMessageId) {
    const { data: replyMsg } = (await admin
      .from('messages')
      .select('id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle()) as { data: { id: string } | null; error: unknown }

    if (!replyMsg) {
      return Response.json(
        { error: 'Reply-to message not found.' },
        { status: 404 }
      )
    }
  }

  // Upload to Supabase Storage
  const mimeCategory = getMimeCategory(file.type)
  const fileExt = file.name.split('.').pop() || 'bin'
  const timestamp = Date.now()
  const filename = `${conversationId}/${meId}/${timestamp}_${Math.random().toString(36).slice(2)}.${fileExt}`
  const bucketName = 'messages-media'

  const buffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(bucketName)
    .upload(filename, buffer, { contentType: file.type })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return Response.json(
      { error: 'Upload failed.' },
      { status: 500 }
    )
  }

  // Get public URL
  const { data: publicData } = admin.storage
    .from(bucketName)
    .getPublicUrl(filename)

  const contentUrl = publicData.publicUrl

  // Get conversation settings for both users
  const { data: settings } = (await admin
    .from('conversation_settings')
    .select('user_id, save_history')
    .eq('conversation_id', conversationId)) as {
    data: Array<{ user_id: string; save_history: boolean }> | null
    error: unknown
  }

  const settingsMap = new Map(settings?.map(s => [s.user_id, s.save_history]) ?? [])
  const senderSaved = settingsMap.get(meId) ?? true
  const receiverId = conv.participant_a === meId ? conv.participant_b : conv.participant_a
  const receiverSaved = settingsMap.get(receiverId) ?? true

  // Insert message
  const now = new Date().toISOString()
  const { data: msgData, error: msgError } = (await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: meId,
      content: contentUrl,
      message_type: mimeCategory,
      reply_to_message_id: replyToMessageId,
      sender_saved: senderSaved,
      receiver_saved: receiverSaved,
      created_at: now,
    })
    .select()) as { data: DbMessage[]; error: unknown }

  if (msgError || !msgData?.[0]) {
    return Response.json({ error: 'Failed to create message.' }, { status: 500 })
  }

  const msg = msgData[0]

  // Insert delivery status
  await admin.from('message_status').insert({
    message_id: msg.id,
    sent_at: now,
    delivered_at: null,
    read_at: null,
  })

  return Response.json({
    message: {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      content: msg.content,
      messageType: msg.message_type,
      replyToMessageId: msg.reply_to_message_id,
      senderSaved: msg.sender_saved,
      receiverSaved: msg.receiver_saved,
      deletedForSenderAt: msg.deleted_for_sender_at,
      deletedForReceiverAt: msg.deleted_for_receiver_at,
      deletedForBothAt: msg.deleted_for_both_at,
      createdAt: msg.created_at,
      deliveredAt: null,
      readAt: null,
    },
  })
}
