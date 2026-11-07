-- OneUco migration 0006 — follow requests (follow system).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- public.follow_requests records one follow ask per (requester, target)
-- pair. A right-swipe stays a silent mutual-like match; a FOLLOW is an
-- explicit ask: it lands in the target's Inbox ('follow_request' notice),
-- and only an ACCEPT turns the pair into friends — accepting inserts the
-- canonical ordered-pair row into public.matches, so the Friends list,
-- DM gating and deck exclusions (all matches-driven) work unchanged.
-- A decline starts a 7-day re-ask cooldown (enforced in
-- app/follow/actions.ts, mirroring reveal requests).
--
-- Service-role access only: RLS is enabled with NO policies, so the
-- anon and authenticated roles can neither read nor write the table;
-- only server code holding the service-role key touches it.

create table if not exists public.follow_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.accounts (id) on delete cascade,
  target_id    uuid not null references public.accounts (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, target_id)
);

create index if not exists follow_requests_target_status_idx
  on public.follow_requests (target_id, status);

create index if not exists follow_requests_requester_status_idx
  on public.follow_requests (requester_id, status);

alter table public.follow_requests enable row level security;
