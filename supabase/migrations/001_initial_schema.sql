-- ============================================================
-- m232chat initial schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

create type request_status as enum ('pending', 'accepted', 'declined');
create type message_type as enum ('text', 'image', 'video', 'file', 'voice_note', 'link');

-- ============================================================
-- TABLES
-- ============================================================

-- Users
-- No Supabase Auth. Passwords stored as bcrypt hashes.
create table users (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  password_hash   text not null,
  profile_photo   text,           -- Supabase Storage path (not full URL)
  bio             text,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index users_username_idx on users (lower(username));
create index users_last_seen_idx on users (last_seen_at desc);

-- User sessions
-- One active session per user at a time (single-tab enforcement).
create table user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  is_active     boolean not null default true,
  last_ping_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index user_sessions_user_active_idx on user_sessions (user_id, is_active);

-- Chat requests
-- Unique constraint prevents duplicate pending requests.
-- Declined requests stay in the table; a new request creates a new row.
create table chat_requests (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references users (id) on delete cascade,
  receiver_id   uuid not null references users (id) on delete cascade,
  status        request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint no_self_request check (sender_id <> receiver_id)
);

-- Prevents multiple pending requests between the same pair
create unique index chat_requests_pending_unique_idx
  on chat_requests (sender_id, receiver_id)
  where status = 'pending';

create index chat_requests_receiver_idx on chat_requests (receiver_id, status);
create index chat_requests_sender_idx on chat_requests (sender_id);

-- Conversations
-- Created when a request is accepted. Permanent.
-- participant_a is always the lesser UUID to enforce uniqueness regardless of who initiates.
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  participant_a uuid not null references users (id) on delete cascade,
  participant_b uuid not null references users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint no_self_conversation check (participant_a <> participant_b),
  constraint ordered_participants check (participant_a < participant_b),
  constraint unique_conversation unique (participant_a, participant_b)
);

create index conversations_participant_a_idx on conversations (participant_a);
create index conversations_participant_b_idx on conversations (participant_b);

-- Conversation settings (per-user, per-conversation)
-- Controls ephemeral behaviour. Default: save_history = false.
create table conversation_settings (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  save_history    boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Messages
-- sender_saved / receiver_saved are snapshots of both users'
-- save_history settings at the moment the message was sent.
-- These never change after insert.
create table messages (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references conversations (id) on delete cascade,
  sender_id             uuid not null references users (id) on delete cascade,
  content               text,
  message_type          message_type not null default 'text',
  reply_to_message_id   uuid references messages (id) on delete set null,
  sender_saved          boolean not null default false,
  receiver_saved        boolean not null default false,
  deleted_for_sender_at   timestamptz,
  deleted_for_receiver_at timestamptz,
  deleted_for_both_at     timestamptz,
  created_at            timestamptz not null default now()
);

create index messages_conversation_created_idx on messages (conversation_id, created_at desc);
-- Partial index for ephemeral cleanup queries
create index messages_ephemeral_idx on messages (conversation_id, created_at)
  where sender_saved = false and receiver_saved = false;
create index messages_reply_idx on messages (reply_to_message_id)
  where reply_to_message_id is not null;

-- Message media
-- Separate table so cleanup can find Storage paths by message_id reliably.
create table message_media (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages (id) on delete cascade,
  storage_path    text not null,  -- Supabase Storage path
  mime_type       text not null,
  file_size_bytes integer,
  duration_ms     integer,        -- for voice notes and video
  created_at      timestamptz not null default now()
);

create index message_media_message_idx on message_media (message_id);

-- Message status (read receipts)
-- One row per message. Deleted when the message is deleted.
create table message_status (
  message_id    uuid primary key references messages (id) on delete cascade,
  delivered_at  timestamptz,
  read_at       timestamptz
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns true if the calling user is a participant in the given conversation.
-- Used by RLS policies. security definer so it can read conversations table.
create or replace function is_conversation_participant(conv_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from conversations
    where id = conv_id
      and (participant_a = auth.uid() or participant_b = auth.uid())
  );
$$;

-- Returns the other participant in a conversation.
create or replace function other_participant(conv_id uuid, me uuid)
returns uuid
language sql
security definer
stable
as $$
  select case
    when participant_a = me then participant_b
    else participant_a
  end
  from conversations
  where id = conv_id;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table users enable row level security;
alter table user_sessions enable row level security;
alter table chat_requests enable row level security;
alter table conversations enable row level security;
alter table conversation_settings enable row level security;
alter table messages enable row level security;
alter table message_media enable row level security;
alter table message_status enable row level security;

-- users
-- Public directory: anyone authenticated can read all profiles.
create policy "authenticated users can read all profiles"
  on users for select
  using (auth.uid() is not null);

create policy "users can update own profile"
  on users for update
  using (auth.uid() = id);

-- user_sessions
create policy "users can read own sessions"
  on user_sessions for select
  using (auth.uid() = user_id);

create policy "users can update own sessions"
  on user_sessions for update
  using (auth.uid() = user_id);

-- chat_requests
create policy "users can read requests they sent or received"
  on chat_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "users can send requests"
  on chat_requests for insert
  with check (auth.uid() = sender_id);

create policy "receivers can respond to requests"
  on chat_requests for update
  using (auth.uid() = receiver_id);

-- conversations
create policy "participants can read their conversations"
  on conversations for select
  using (auth.uid() = participant_a or auth.uid() = participant_b);

-- conversation_settings
create policy "users can read own conversation settings"
  on conversation_settings for select
  using (auth.uid() = user_id);

create policy "users can upsert own conversation settings"
  on conversation_settings for insert
  with check (auth.uid() = user_id);

create policy "users can update own conversation settings"
  on conversation_settings for update
  using (auth.uid() = user_id);

-- messages
create policy "participants can read visible messages"
  on messages for select
  using (
    is_conversation_participant(conversation_id)
    and deleted_for_both_at is null
    and (
      case
        when sender_id = auth.uid() then deleted_for_sender_at is null
        else deleted_for_receiver_at is null
      end
    )
  );

create policy "participants can insert messages"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and is_conversation_participant(conversation_id)
  );

create policy "participants can update messages"
  on messages for update
  using (is_conversation_participant(conversation_id));

-- message_media
create policy "participants can read message media"
  on message_media for select
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and is_conversation_participant(m.conversation_id)
    )
  );

create policy "participants can insert message media"
  on message_media for insert
  with check (
    exists (
      select 1 from messages m
      where m.id = message_id
        and auth.uid() = m.sender_id
    )
  );

-- message_status
create policy "participants can read message status"
  on message_status for select
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and is_conversation_participant(m.conversation_id)
    )
  );

create policy "participants can upsert message status"
  on message_status for insert
  with check (
    exists (
      select 1 from messages m
      where m.id = message_id
        and is_conversation_participant(m.conversation_id)
    )
  );

create policy "participants can update message status"
  on message_status for update
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and is_conversation_participant(m.conversation_id)
    )
  );

-- ============================================================
-- STORAGE BUCKETS
-- (Run these in SQL Editor OR create via Supabase Dashboard > Storage)
-- ============================================================

-- Profile photos: public read, authenticated write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Chat media: private, RLS-controlled via signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  104857600,  -- 100MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
    'application/pdf',
    'application/zip',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- Storage RLS for profile-photos
create policy "anyone can read profile photos"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "authenticated users can upload profile photos"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can update own profile photo"
  on storage.objects for update
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete own profile photo"
  on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS for chat-media
-- Path structure: chat-media/{conversation_id}/{message_id}/{filename}
create policy "participants can read chat media"
  on storage.objects for select
  using (
    bucket_id = 'chat-media'
    and auth.uid() is not null
    and is_conversation_participant((storage.foldername(name))[1]::uuid)
  );

create policy "participants can upload chat media"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and auth.uid() is not null
    and is_conversation_participant((storage.foldername(name))[1]::uuid)
  );

create policy "participants can delete chat media"
  on storage.objects for delete
  using (
    bucket_id = 'chat-media'
    and auth.uid() is not null
    and is_conversation_participant((storage.foldername(name))[1]::uuid)
  );
