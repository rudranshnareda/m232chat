// App-level types — shaped for UI use, not raw DB rows.

export interface AuthUser {
  id: string
  username: string
  profilePhoto: string | null
  bio: string | null
  sessionId: string
}

export interface UserProfile {
  id: string
  username: string
  profilePhoto: string | null
  bio: string | null
  lastSeenAt: string
}

export type ConnectionStatus =
  | 'none'          // no request exists
  | 'request_sent'  // current user sent a pending request
  | 'request_received' // current user received a pending request
  | 'connected'     // accepted

export interface ChatRequest {
  id: string
  senderId: string
  receiverId: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
  respondedAt: string | null
  sender?: UserProfile
  receiver?: UserProfile
}

export interface Conversation {
  id: string
  participantA: string
  participantB: string
  createdAt: string
  otherUser: UserProfile
  saveHistory: boolean
  lastMessage?: Message | null
  unreadCount?: number
}

export type MessageType = 'text' | 'image' | 'video' | 'voice_note' | 'file' | 'link'

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface MessageReaction {
  emoji: string
  count: number
  byMe:  boolean
}

export interface MessageMedia {
  id: string
  storagePath: string
  mimeType: string
  fileSizeBytes: number | null
  durationMs: number | null
  signedUrl?: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string | null
  messageType: MessageType
  replyToMessageId: string | null
  replyTo?: Pick<Message, 'id' | 'content' | 'messageType' | 'senderId'> | null
  senderSaved: boolean
  receiverSaved: boolean
  deletedForSenderAt: string | null
  deletedForReceiverAt: string | null
  deletedForBothAt: string | null
  createdAt: string
  media?: MessageMedia | null
  deliveredAt: string | null
  readAt: string | null
  reactions?: MessageReaction[]
  // client-only
  deliveryStatus?: MessageDeliveryStatus
  isOptimistic?: boolean
}

export interface SessionConflict {
  hasConflict: boolean
  existingSessionId: string | null
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
