# m232chat

A private, mobile-first realtime chat app. People find each other by username, send a chat
request, and once it's accepted they can talk with text, photos, videos, files and voice notes.
Messages are ephemeral by default: each person decides whether to keep a conversation.

**Live:** [m232chat.vercel.app](https://m232chat.vercel.app)

## Features

- **Chat requests.** You can only message someone after they accept your request.
- **Realtime messaging** over Supabase Realtime, with optimistic sending, replies, read
  receipts and message info.
- **Media.** Photos, videos, files and recorded voice notes (with duration), up to 50 MB,
  stored privately in Supabase Storage.
- **Reactions:** 👍 ❤️ 😂 😮 😢 🙏
- **Ephemeral by default.** Unsaved messages disappear after the recipient has read them and
  the app is refreshed. A message is never removed before the other person has seen it. Soft-
  deleted messages are hard-deleted after 30 days.
- **Presence.** Online status and "last seen" in the chat header.
- **One active tab.** A session can only be open in one tab at a time.
- **Mobile polish.** The keyboard stays open after sending on Android and iOS, and the latest
  messages stay visible when it opens.
- Pure-black minimalist theme.

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui (Base UI), lucide, sonner |
| State | TanStack Query, Zustand |
| Backend | Next.js route handlers + Supabase (Postgres, Realtime, Storage) |
| Auth | Custom: bcrypt password hashes + JWT access/refresh tokens in cookies (`jose`) |

## Running locally

1. Create a Supabase project and run the SQL files in
   [`supabase/migrations/`](supabase/migrations) in order, in the SQL Editor.
2. Create two Storage buckets: `profile-photos` (public) and `chat-media` (private; files are
   served through short-lived signed URLs).
3. Add a `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...      # server only, never exposed to the browser
   JWT_SECRET=...                      # any long random string
   JWT_REFRESH_SECRET=...              # a different long random string
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Then open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/(auth)/        login, register
  app/(main)/        chats, requests, search, profile, chat thread, user profile
  app/api/           auth, conversations, messages, uploads, reactions, requests, presence
  components/chat/   message bubble, input, action and info sheets
  hooks/             chat messages, voice recorder, tab enforcement, long press
  lib/               JWT, cookies, Supabase clients, ephemeral cleanup, storage
supabase/migrations/ schema, realtime setup
```

## Author

Built by [Rudransh Nareda](https://github.com/rudranshnareda).
