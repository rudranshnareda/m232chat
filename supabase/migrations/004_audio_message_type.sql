-- Add 'audio' value to message_type enum (replaces voice_note going forward)
alter type message_type add value if not exists 'audio';

-- Migrate existing voice_note messages to audio
update messages set message_type = 'audio' where message_type = 'voice_note';
