-- OneUco migration 0008 — app interfaces (full-app themes).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Two pieces:
--   1. public.app_settings gains the 'theme' key — the admin's app-wide
--      DEFAULT interface, stored as JSON text: {"mode":"auto"} or
--      {"mode":"manual","id":"ocean"}.
--   2. public.profiles gains theme_id — a student's OWN interface pick,
--      chosen by long-pressing the dial (or from Profile settings).
--      Null = follow the app default. Resolution: user pick > admin
--      default > seasonal auto.
--
-- NOTE on app_settings: the table already exists on the live database
-- (migration 0003, value TEXT — the Diwali mode lives there). The
-- create below is therefore a no-op in production and only shapes a
-- FRESH database (value jsonb there). The app treats the value as JSON
-- either way: it writes JSON.stringify(...) and parses string-or-object
-- on read (lib/themes.ts parseThemeSetting), so both column types work
-- and this migration is safe to run before OR after the code deploys —
-- the code fails soft to the seasonal look while the key/column are
-- missing.
--
-- Service-role access only (no public policies); the admin default is
-- read/written exclusively through server code with the service-role
-- key, and theme_id rides the existing profiles RLS (owner-only).

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('theme', '{"mode":"auto"}')
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists theme_id text;
