-- Enable Supabase Realtime for the tables that need live updates.
-- Run this after 001_initial_schema.sql

-- Add tables to the realtime publication
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_status;
alter publication supabase_realtime add table chat_requests;
alter publication supabase_realtime add table user_sessions;
