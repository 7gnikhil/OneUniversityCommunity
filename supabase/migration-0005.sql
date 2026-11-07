-- OneUco migration 0005 — admin login throttling (security hardening).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- public.admin_login_attempts records FAILED admin sign-in attempts so
-- the /admin/login server action can throttle brute force per
-- (email, ip): 8 failures inside 15 minutes locks that pair out. The
-- action answers a throttled attempt with the same generic error as a
-- wrong password, so throttling never reveals itself — nor whether the
-- email belongs to an admin at all.
--
-- Service-role access only: RLS is enabled with NO policies, so the
-- anon and authenticated roles can neither read nor write the table;
-- only server code holding the service-role key touches it.

create table if not exists public.admin_login_attempts (
  id           bigint generated always as identity primary key,
  email        text not null,
  ip           text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_email_ip_time_idx
  on public.admin_login_attempts (email, ip, attempted_at desc);

alter table public.admin_login_attempts enable row level security;
