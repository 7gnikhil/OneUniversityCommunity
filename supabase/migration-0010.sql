-- OneUco migration 0010 — dial wheel skins + the first-login dial tip.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Two per-student columns on public.profiles:
--   1. dial_skin — the student's OWN dial wheel style ('pirate',
--      'munich', 'stuttgart', 'racing', 'vintage'), chosen by HOLDING
--      the dial and cycling wheel styles, or from Profile settings.
--      Null / 'auto' = the wheel wears the applied interface's own
--      skin (lib/themes.ts) — the behaviour before this migration.
--      Independent of theme_id: the interface owns the app, the wheel
--      skin owns only the dial (lib/dial-skins.ts).
--   2. dial_tip_seen — whether the one-time "hold the dial to restyle
--      it" card has been shown on the dial home. False = not yet
--      shown; the card appears ONCE, on the first-ever home landing,
--      and the Got-it tap flips this true forever.
--
-- Both ride the existing profiles RLS (owner-only), exactly like
-- theme_id (migration 0008). The code fails soft while the columns
-- are missing: reads degrade to 'auto' / tip-never-shown (the tip
-- card simply never renders until this migration lands), so this is
-- safe to run before OR after the code deploys.

alter table public.profiles
  add column if not exists dial_skin text;

alter table public.profiles
  add column if not exists dial_tip_seen boolean not null default false;
