-- ═══════════════════════════════════════════════════════════════════
-- Migration 0016 — Fling profile ratings, 1–10 (2026-11-11).
--
-- While viewing a profile in Fling (the deck card or the Fling
-- profile page) a student can rate it 1–10. One rating per
-- (rater, rated) pair; rating again changes it. Ratings are
-- INDEPENDENT of swipes — rating someone neither likes nor passes
-- them, and never creates a match.
--
-- Privacy: own-row RLS on the GIVEN side — I can read and change
-- the ratings I gave; nobody can read individual ratings they
-- received or anyone else's. The only received-side surface is
-- my_received_rating(): a security-definer aggregate returning
-- MY OWN average + count, shown to me on my Profile page.
-- Ratings are never displayed publicly in this version.
-- ═══════════════════════════════════════════════════════════════════

create table public.profile_ratings (
  rater_account_id uuid not null references public.accounts (id) on delete cascade,
  rated_account_id uuid not null references public.accounts (id) on delete cascade,
  rating           smallint not null check (rating between 1 and 10),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (rater_account_id, rated_account_id),
  check (rater_account_id <> rated_account_id)
);

create index profile_ratings_rated_idx
  on public.profile_ratings (rated_account_id);

alter table public.profile_ratings enable row level security;

-- Own GIVEN rows only, same idiom as the rest of the schema.
create policy profile_ratings_select_own on public.profile_ratings for select
  to authenticated using (rater_account_id = public.current_account_id());
create policy profile_ratings_insert_own on public.profile_ratings for insert
  to authenticated with check (rater_account_id = public.current_account_id());
create policy profile_ratings_update_own on public.profile_ratings for update
  to authenticated using (rater_account_id = public.current_account_id())
  with check (rater_account_id = public.current_account_id());

create trigger profile_ratings_set_updated_at
  before update on public.profile_ratings
  for each row execute function public.set_updated_at();

-- My own received aggregate: average (1 decimal place comes from
-- the caller's formatting) and how many ratings produced it.
-- Security definer so it can aggregate rows the caller may not
-- read individually; it only ever answers for the caller.
create or replace function public.my_received_rating()
returns table (average numeric, ratings_count bigint)
language sql
security definer
set search_path = public
as $$
  select round(avg(rating)::numeric, 1), count(*)
  from public.profile_ratings
  where rated_account_id = public.current_account_id();
$$;

grant execute on function public.my_received_rating() to authenticated;
