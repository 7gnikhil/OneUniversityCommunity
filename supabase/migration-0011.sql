-- ═══════════════════════════════════════════════════════════════════════════
-- OneUco migration 0011 — admin speed pass: the indexes the ADMIN queue
-- filters/orderings actually use (audited against schema.sql + migrations
-- 0002–0010 and the admin query code, 2026-11-10).
-- Apply in the Supabase SQL editor (or psql) AFTER 0010. Idempotent:
-- every statement can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Each entry names the query it serves. Admin tables are small today, so
-- these are cheap insurance: they keep the queues' filter+sort plans off
-- sequential scans as reports/requests accumulate. Indexes that already
-- exist (verifications by status, college_codes by status+name, presence
-- by last_seen, inbox by recipient+read+created) are NOT repeated.

-- Reports queue (app/admin/reports/page.tsx): reports filtered by
-- status = 'open', ordered created_at desc, limit 100 — and the admin
-- home open-reports count (app/admin/page.tsx countRows status='open').
-- The reports table had NO index at all.
create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

-- Pending reveal overview (app/admin/requests/page.tsx): reveal_requests
-- filtered by status = 'pending', ordered created_at desc, limit 50.
-- The existing indexes lead with requester_id / poster_id and cannot
-- serve a status-only filter with that ordering.
create index if not exists reveal_requests_status_created_idx
  on public.reveal_requests (status, created_at desc);

-- Developer requests (app/admin/developer-requests/page.tsx list ordered
-- created_at desc limit 100; admin home count of status = 'received').
-- No index existed on developer_requests.
create index if not exists developer_requests_status_created_idx
  on public.developer_requests (status, created_at desc);

-- ReqToAdmin queue (app/admin/requests/page.tsx): server_messages
-- filtered by flair_id = the ReqToAdmin flair, ordered created_at desc,
-- limit 100. Existing server_messages indexes lead with server_id /
-- channel_id and cannot serve a flair-only filter.
create index if not exists server_messages_flair_created_idx
  on public.server_messages (flair_id, created_at desc);

-- College registry review (app/admin/colleges/page.tsx): college_codes
-- filtered by status = 'pending', ordered created_at ASC, limit 100.
-- The existing (status, college_name) index serves the filter but not
-- the sign-up ordering.
create index if not exists college_codes_status_created_idx
  on public.college_codes (status, created_at);

-- Admin home pending-verification count (app/admin/page.tsx countRows
-- accounts by status = 'pending_verification'): accounts had no status
-- index, so the count seq-scans the whole identity table.
create index if not exists accounts_status_idx
  on public.accounts (status);
