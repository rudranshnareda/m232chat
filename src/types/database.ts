// Database row types — mirror of the SQL schema exactly.

export type RequestStatus = 'pending' | 'accepted' | 'declined'
export type MessageType   = 'text' | 'image' | 'video' | 'audio' | 'file' | 'link'

export interface DbUser {
  id:             string
  username:       string
  password_hash:  string
  profile_photo:  string | null
  bio:            string | null
  last_seen_at:   string
  created_at:     string
}

export interface DbUserSession {
  id:           string
  user_id:      string
  is_active:    boolean
  last_ping_at: string
  created_at:   string
}

export interface DbChatRequest {
  id:           string
  sender_id:    string
  receiver_id:  string
  status:       RequestStatus
  created_at:   string
  responded_at: string | null
}

export interface DbConversation {
  id:            string
  participant_a: string
  participant_b: string
  created_at:    string
}

export interface DbConversationSetting {
  conversation_id: string
  user_id:         string
  save_history:    boolean
  updated_at:      string
}

export interface DbMessage {
  id:                      string
  conversation_id:         string
  sender_id:               string
  content:                 string | null
  message_type:            MessageType
  reply_to_message_id:     string | null
  sender_saved:            boolean
  receiver_saved:          boolean
  deleted_for_sender_at:   string | null
  deleted_for_receiver_at: string | null
  deleted_for_both_at:     string | null
  created_at:              string
}

export interface DbMessageMedia {
  id:              string
  message_id:      string
  storage_path:    string
  mime_type:       string
  file_size_bytes: number | null
  duration_ms:     number | null
  created_at:      string
}

export interface DbMessageStatus {
  message_id:   string
  delivered_at: string | null
  read_at:      string | null
}

export interface DbMessageReaction {
  id:              string
  message_id:      string
  conversation_id: string
  user_id:         string
  emoji:           string
  created_at:      string
}

// ---------------------------------------------------------------
// Supabase Database generic — must match GenericSchema shape from
// @supabase/supabase-js (each table needs Row/Insert/Update/Relationships).
// ---------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      users: {
        Row:           DbUser
        Insert:        Omit<DbUser, 'last_seen_at' | 'created_at'> & { id?: string }
        Update:        Partial<Omit<DbUser, 'id' | 'created_at'>>
        Relationships: []
      }
      user_sessions: {
        Row:           DbUserSession
        Insert:        Omit<DbUserSession, 'id' | 'last_ping_at' | 'created_at'>
        Update:        Partial<Pick<DbUserSession, 'is_active' | 'last_ping_at'>>
        Relationships: []
      }
      chat_requests: {
        Row:           DbChatRequest
        Insert:        Pick<DbChatRequest, 'sender_id' | 'receiver_id'>
        Update:        Partial<Pick<DbChatRequest, 'status' | 'responded_at'>>
        Relationships: []
      }
      conversations: {
        Row:           DbConversation
        Insert:        Pick<DbConversation, 'participant_a' | 'participant_b'>
        Update:        Partial<Pick<DbConversation, 'participant_a'>>
        Relationships: []
      }
      conversation_settings: {
        Row:           DbConversationSetting
        Insert:        Omit<DbConversationSetting, 'updated_at'>
        Update:        Partial<Pick<DbConversationSetting, 'save_history' | 'updated_at'>>
        Relationships: []
      }
      messages: {
        Row:           DbMessage
        Insert:        Omit<DbMessage, 'deleted_for_sender_at' | 'deleted_for_receiver_at' | 'deleted_for_both_at' | 'created_at'>
        Update:        Partial<Pick<DbMessage, 'deleted_for_sender_at' | 'deleted_for_receiver_at' | 'deleted_for_both_at'>>
        Relationships: []
      }
      message_media: {
        Row:           DbMessageMedia
        Insert:        Omit<DbMessageMedia, 'id' | 'created_at'>
        Update:        { [_ in never]: never }
        Relationships: []
      }
      message_status: {
        Row:           DbMessageStatus
        Insert:        Pick<DbMessageStatus, 'message_id'>
        Update:        Partial<Pick<DbMessageStatus, 'delivered_at' | 'read_at'>>
        Relationships: []
      }
      message_reactions: {
        Row:           DbMessageReaction
        Insert:        Pick<DbMessageReaction, 'message_id' | 'conversation_id' | 'user_id' | 'emoji'>
        Update:        never
        Relationships: []
      }
    }
    Views:     { [_ in never]: never }
    Functions: {
      is_conversation_participant: {
        Args:    { conv_id: string }
        Returns: boolean
      }
      other_participant: {
        Args:    { conv_id: string; me: string }
        Returns: string
      }
    }
    Enums: {
      request_status: RequestStatus
      message_type:   MessageType
    }
    CompositeTypes: { [_ in never]: never }
  }
}
