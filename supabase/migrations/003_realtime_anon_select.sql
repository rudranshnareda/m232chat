-- Allow Supabase Realtime postgres_changes subscriptions to deliver events
-- to the browser client.
--
-- Background: this app uses custom JWT auth, NOT Supabase Auth.
-- The browser-side Supabase client only has the anon key — auth.uid() is
-- always null, so all existing RLS policies (which check auth.uid()) block
-- realtime events from being delivered.
--
-- All writes are protected at the API layer (service role key + custom JWT
-- middleware), so granting anon SELECT here does not open any write surface.

create policy "anon can select messages for realtime"
  on messages for select
  to anon
  using (true);

create policy "anon can select message_status for realtime"
  on message_status for select
  to anon
  using (true);

create policy "anon can select chat_requests for realtime"
  on chat_requests for select
  to anon
  using (true);
