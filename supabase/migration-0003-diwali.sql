-- OneUco migration 0003 — app settings (first use: Diwali theme mode).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Service-role access only (no public policies); the app reads/writes this
-- table exclusively through server code with the service-role key.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('diwali_mode', 'auto')
on conflict (key) do nothing;
