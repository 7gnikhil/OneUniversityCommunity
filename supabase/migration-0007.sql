-- OneUco migration 0007 — presence, typing, message delivery ticks and
-- chat privacy settings.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- What this adds:
--   1. messages.delivered_at — the middle WhatsApp-style tick state for
--      DMs: sent (created_at only) -> delivered (delivered_at set when
--      the recipient's client next polls / loads the Friends list) ->
--      viewed (read_at, which already exists). Marking runs server-side
--      in the DM poll / friends-list code (service role).
--   2. public.presence — one row per account: the last heartbeat time
--      plus the CURRENT typing target (a DM match or a server channel)
--      with an expiry. Clients heartbeat every 30s while signed in;
--      "online" = last_seen_at within 3 minutes. Typing rows are
--      written by server actions only, after membership checks.
--   3. profiles.show_online / profiles.read_receipts — WhatsApp-style
--      privacy switches (both default ON): hide my online + typing
--      state, and hide my read ticks from senders.
--
-- Service-role access only for presence: RLS is enabled with NO
-- policies, so the anon and authenticated roles can neither read nor
-- write it; only server code holding the service-role key touches it
-- (same pattern as follow_requests in migration 0006). profiles keeps
-- its existing policies — the two new columns ride along.

alter table public.messages
  add column if not exists delivered_at timestamptz;

create table if not exists public.presence (
  account_id    uuid primary key references public.accounts (id) on delete cascade,
  last_seen_at  timestamptz not null default now(),
  typing_kind   text check (typing_kind in ('dm', 'server')),
  typing_ref    uuid,
  typing_until  timestamptz
);

create index if not exists presence_last_seen_idx
  on public.presence (last_seen_at desc);

alter table public.presence enable row level security;

alter table public.profiles
  add column if not exists show_online boolean not null default true;

alter table public.profiles
  add column if not exists read_receipts boolean not null default true;
