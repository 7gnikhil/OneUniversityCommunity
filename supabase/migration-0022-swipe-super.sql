-- Migration 0022 — Fling Super Likes (Tinder pattern, 2026-11-17).
-- Apply in the Supabase SQL editor.
--
-- One boolean on the swipe row. The app fails soft without it:
-- the Super Like button answers "still being set up", the daily
-- limit and the "Super liked you" deck badge simply stay off.

alter table public.swipes
  add column if not exists is_super boolean not null default false;

create index if not exists swipes_super_liked_me_idx
  on public.swipes (swipee_id, swiper_id)
  where is_super = true;
