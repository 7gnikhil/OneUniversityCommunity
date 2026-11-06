-- OneUco migration 0004 — Slice 4 (servers, Maya Jwalam, Chirp, Inbox, admin).
--
-- Almost everything Slice 4 needs already exists in schema.sql:
-- servers / channels / server_members / flairs / server_messages /
-- server_message_views (per-user view tracking) / group_invites /
-- chirps + chirp_comments + chirp_likes / inbox_items / reveal_requests /
-- blocks / reports / developer_requests. This migration is additive and
-- idempotent and adds only what is missing:
--   1. server_members.last_read_at — per-server read marker that drives
--      the Servers unread badge (messages newer than this count as unread).
--   2. The built-in global "ReqToAdmin" flair (schema.sql documents it as
--      a post-owner seed; this makes it real, exactly once).
--   3. The Maya Jwalam main server row (servers.is_main_channel), its
--      default channel and the owner's membership — only when an owner
--      account already exists (servers.created_by is NOT NULL, so the
--      seed cannot run before the owner signs in; the app also self-heals
--      this from /servers via lib/servers.ts ensureMainServer()).

-- ── 1. Per-server read marker ─────────────────────────────────────────────
alter table public.server_members
  add column if not exists last_read_at timestamptz;

comment on column public.server_members.last_read_at is
  'Last time this member opened the server. Server messages after this (and not authored by the member) count as unread for badges.';

-- Reveal daily-cap lookups (requester + recency).
create index if not exists reveal_requests_requester_created_idx
  on public.reveal_requests (requester_id, created_at desc);

-- Direct invites land in the invitee's Inbox.
create index if not exists group_invites_invitee_idx
  on public.group_invites (invitee_account_id, created_at desc);

-- ── 2. Built-in ReqToAdmin flair (global, server_id null) ─────────────────
-- flairs has unique (server_id, name), but Postgres treats NULL server_id
-- rows as distinct, so the NOT EXISTS guard is what makes this one row.
insert into public.flairs (server_id, name, color, created_by)
select null, 'ReqToAdmin', '#e11d48', owner.id
from (
  select id from public.accounts
  where role = 'owner'
  order by created_at asc
  limit 1
) as owner
where not exists (
  select 1 from public.flairs
  where server_id is null and name = 'ReqToAdmin'
);

-- ── 3. Maya Jwalam main server seed ───────────────────────────────────────
-- servers_single_main_channel (unique partial index) already guarantees
-- at most one main server; the NOT EXISTS guard keeps this a no-op on
-- re-runs and on databases where the app created it first.
insert into public.servers (name, type, is_main_channel, description, created_by)
select
  'Maya Jwalam',
  'public',
  true,
  'The main OneUco channel. Everyone posts anonymously here — names and profiles stay hidden unless a poster accepts a reveal request.',
  owner.id
from (
  select id from public.accounts
  where role = 'owner'
  order by created_at asc
  limit 1
) as owner
where not exists (
  select 1 from public.servers where is_main_channel
);

-- Default channel for the main server (the Telegram-style UI reads the
-- first channel; additional channels are ignored by that view).
insert into public.channels (server_id, name, topic, position)
select s.id, 'general', 'The main channel', 0
from public.servers s
where s.is_main_channel
  and not exists (
    select 1 from public.channels c where c.server_id = s.id
  );

-- The owner is a member (owner role) of the main server.
insert into public.server_members (server_id, account_id, role)
select s.id, s.created_by, 'owner'
from public.servers s
where s.is_main_channel
on conflict (server_id, account_id) do nothing;
