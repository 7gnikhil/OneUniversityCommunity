-- ═══════════════════════════════════════════════════════════════════════════
-- OneUco migration 0009 — speed batch: batched chirp view counts + the
-- indexes the hot query paths actually filter/order by (audited against
-- schema.sql + migrations 0002–0008 and the query code, 2026-11-10).
-- Apply in the Supabase SQL editor (or psql) AFTER 0008. Idempotent:
-- every statement can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Batched chirp view counting ────────────────────────────────────────────
-- app/chirp/page.tsx used to issue one UPDATE per rendered chirp (up to
-- 50 per feed load). increment_chirp_views replaces that with a single
-- call. SECURITY DEFINER so it works under the service-role client the
-- page already uses; EXECUTE is revoked from the public/anon/
-- authenticated roles so signed-in clients cannot inflate counts by
-- calling the RPC directly — only service_role may run it.
create or replace function public.increment_chirp_views(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.chirps
     set view_count = view_count + 1
   where id = any(ids);
$$;

revoke execute on function public.increment_chirp_views(uuid[])
  from public, anon, authenticated;
grant execute on function public.increment_chirp_views(uuid[])
  to service_role;

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Each entry names the query it serves. Indexes that already existed
-- (messages by match+created, inbox by recipient+read+created, presence
-- by last_seen, follow pairs both directions, chirps by created/author)
-- are NOT repeated.

-- getMyMatches (lib/social.ts): `account_a = me OR account_b = me`
-- ordered by updated_at desc. The unique (account_a, account_b) index
-- serves only the A side; the B side had no leading index.
create index if not exists matches_account_b_idx
  on public.matches (account_b, updated_at desc);

-- DM tick-state poll (app/friends/actions.ts getMessageTickStates):
-- messages by match_id + sender_id, newest first, limit 50 — runs on
-- every poll of an open chat. The existing (match_id, created_at desc)
-- index forces a sender-filter scan over the match's newest rows.
create index if not exists messages_match_sender_created_idx
  on public.messages (match_id, sender_id, created_at desc);

-- "My memberships" lookups (lib/servers.ts listServersForMe and
-- getServerUnreadCounts, lib/inbox.ts invite context): server_members
-- filtered by account_id alone; the PK (server_id, account_id) leads
-- with server_id and cannot serve it.
create index if not exists server_members_account_idx
  on public.server_members (account_id);

-- Server-wide message lists (lib/servers.ts listServerMessages,
-- listJwalamMessages, listServerMessagesForAdmin): filtered by
-- server_id, ordered created_at desc, WITHOUT a channel equality (the
-- channel filter, when present, is applied on top). The existing
-- (server_id, channel_id, created_at desc) index cannot provide that
-- ordering across channels.
create index if not exists server_messages_server_created_idx
  on public.server_messages (server_id, created_at desc);

-- Channel lists (lib/servers.ts listChannels): channels filtered by
-- server_id, ordered by position. The FK column had no index at all.
create index if not exists channels_server_position_idx
  on public.channels (server_id, position);

-- "Liked by me" set on every chirp feed load (lib/chirp.ts
-- listChirps): chirp_likes filtered by account_id with chirp_id IN
-- (page ids). The PK (chirp_id, account_id) leads with chirp_id.
create index if not exists chirp_likes_account_idx
  on public.chirp_likes (account_id, chirp_id);

-- Reveal lists + unread count for the poster (lib/inbox.ts
-- listPendingRevealsForPoster, listGrantedReveals,
-- countUnreadRevealOutcomes): reveal_requests filtered by poster_id +
-- status, newest first. The existing indexes lead with requester_id.
create index if not exists reveal_requests_poster_status_idx
  on public.reveal_requests (poster_id, status, created_at desc);
