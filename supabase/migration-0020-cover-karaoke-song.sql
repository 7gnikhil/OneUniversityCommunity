-- Migration 0020 — Karaoke covers remember their song.
-- Apply in the Supabase SQL editor AFTER 0017 (paste → Run).
-- Safe to re-run.
--
-- A cover recorded in Music Mitra's karaoke (voice over a Demucs
-- instrumental) stores the song's id, so the profile player can
-- fetch the same instrumental from the karaoke service and play
-- voice + music together, in sync — instead of the voice alone.
-- The app is fail-soft without this column: covers still save and
-- play voice-only (the code retries without the column on error).

alter table public.profile_covers
  add column if not exists karaoke_song_id text;
