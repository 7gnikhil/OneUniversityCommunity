-- ═══════════════════════════════════════════════════════════════════
-- Migration 0015 — Poll of the day votes (2026-11-11).
--
-- The question itself lives in code (lib/daily-polls.ts), picked
-- deterministically by IST day; only votes are stored, keyed by
-- IST date ('YYYY-MM-DD'). One vote per student per day; voting
-- again changes the vote (upsert on the PK). Own-row RLS like
-- every other table — nobody can read who voted what. Counts for
-- the result bars come from daily_poll_counts(), a security-
-- definer aggregate that exposes ONLY per-option totals.
-- ═══════════════════════════════════════════════════════════════════

create table public.daily_poll_votes (
  poll_date    date not null,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 7),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (poll_date, account_id)
);

create index daily_poll_votes_date_idx
  on public.daily_poll_votes (poll_date);

alter table public.daily_poll_votes enable row level security;

-- Own rows only, same idiom as the rest of the schema: I can see
-- and change my own vote; nobody else's row is visible at all.
create policy daily_poll_votes_select_own on public.daily_poll_votes for select
  to authenticated using (account_id = public.current_account_id());
create policy daily_poll_votes_insert_own on public.daily_poll_votes for insert
  to authenticated with check (account_id = public.current_account_id());
create policy daily_poll_votes_update_own on public.daily_poll_votes for update
  to authenticated using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

create trigger daily_poll_votes_set_updated_at
  before update on public.daily_poll_votes
  for each row execute function public.set_updated_at();

-- Per-option totals for one day's poll — aggregates only, no
-- voter identities. Security definer so it can count across rows
-- the caller may not read.
create or replace function public.daily_poll_counts(p_date date)
returns table (option_index integer, votes bigint)
language sql
security definer
set search_path = public
as $$
  select option_index::integer, count(*)::bigint
  from public.daily_poll_votes
  where poll_date = p_date
  group by option_index
  order by option_index;
$$;

grant execute on function public.daily_poll_counts(date) to authenticated;
