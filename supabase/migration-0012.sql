-- ═══════════════════════════════════════════════════════════════════════════
-- OneUco migration 0012 — Fling profiles: a SEPARATE, small public-to-
-- members profile that exists only for the Fling deck (bio, likes,
-- dislikes), distinct from the personal profile in public.profiles.
-- Apply in the Supabase SQL editor (or psql) AFTER 0011. Idempotent:
-- every statement can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Why a separate table: the personal profile (profiles) mixes the
-- deck-visible basics with friends-only detail (gallery, portfolio)
-- that the app gates per relationship. Fling data has ONE audience —
-- signed-in students browsing the deck — and one owner, so it gets its
-- own row, its own editor (Profile & Settings → Fling data) and its
-- own page (the stranger view from a deck card). Nothing here is
-- anon/public: RLS keeps every read inside `authenticated`, and the
-- private self-declared fields (college, branch, grad year) are NOT
-- part of this table — branch stays where it already lives (profiles,
-- already deck-visible); college/year are never copied in.
--
-- The code fails soft while this table is missing (lib/fling.ts):
-- reads return an empty fling profile and the deck/stranger view
-- render their empty states, so this is safe to run before OR after
-- the code deploys.

create table if not exists public.fling_profiles (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  bio        text,   -- the Fling-only one-liner (separate from profiles.bio)
  likes      text,   -- free text, the student's own words
  dislikes   text,   -- free text, the student's own words
  updated_at timestamptz not null default now()
);

-- updated_at maintenance, same helper/triggers as every other table.
drop trigger if exists fling_profiles_set_updated_at on public.fling_profiles;
create trigger fling_profiles_set_updated_at before update on public.fling_profiles
  for each row execute function public.set_updated_at();

alter table public.fling_profiles enable row level security;

-- Reads: any signed-in member may read any row — this data exists to
-- be seen in Fling. Anon gets nothing (no policy for anon at all).
drop policy if exists fling_profiles_select_members on public.fling_profiles;
create policy fling_profiles_select_members on public.fling_profiles for select
  to authenticated using (true);

-- Writes: strictly your own row.
drop policy if exists fling_profiles_insert_own on public.fling_profiles;
create policy fling_profiles_insert_own on public.fling_profiles for insert
  with check (account_id = public.current_account_id());

drop policy if exists fling_profiles_update_own on public.fling_profiles;
create policy fling_profiles_update_own on public.fling_profiles for update
  using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());
