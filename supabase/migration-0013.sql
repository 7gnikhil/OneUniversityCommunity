-- ═══════════════════════════════════════════════════════════════════
-- Migration 0013 — Web Push subscriptions (re-engagement batch,
-- 2026-11-11).
--
-- One row per browser/device subscription a student has granted.
-- Written and read ONLY through server actions with the service-role
-- client (subscribe/unsubscribe in app/push/actions.ts, sends in
-- lib/push.ts) — RLS is enabled with NO client policies, the same
-- pattern as follow_requests, so subscription endpoints (which are
-- capability URLs for reaching a student's device) never leak to
-- other clients.
-- ═══════════════════════════════════════════════════════════════════

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_account_id_idx
  on public.push_subscriptions (account_id);

alter table public.push_subscriptions enable row level security;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
