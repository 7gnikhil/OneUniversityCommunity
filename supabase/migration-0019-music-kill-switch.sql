-- Migration 0019 — Music Mitra kill-switch setting.
-- Apply in the Supabase SQL editor (paste → Run). Safe to re-run.
--
-- Seeds the app_settings key the kill-switch reads
-- (lib/server/music-settings.ts). The app FAILS OPEN: if this row or
-- the table read is missing, Music Mitra stays ON — this migration is
-- for discoverability, not a gate. Flip the value from /admin
-- (Music Mitra kill-switch card) or by hand:
--   update public.app_settings set value = 'off'
--   where key = 'music_mitra_enabled';   -- 'on' restores it

insert into public.app_settings (key, value)
values ('music_mitra_enabled', 'on')
on conflict (key) do nothing;
