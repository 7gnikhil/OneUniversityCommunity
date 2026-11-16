-- Migration 0021 — Saved chirps (Instagram-style bookmarks,
-- 2026-11-17). Apply in the Supabase SQL editor.
--
-- A private per-student bookmark list: chirp_saves mirrors
-- chirp_likes' shape and own-only RLS exactly. The app fails soft
-- without this migration (bookmark buttons report that saving is
-- still being set up; the Saved tab reads empty).

create table if not exists public.chirp_saves (
  chirp_id   uuid not null references public.chirps (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chirp_id, account_id)
);

create index if not exists chirp_saves_account_idx
  on public.chirp_saves (account_id, created_at desc);

alter table public.chirp_saves enable row level security;

drop policy if exists chirp_saves_select_own on public.chirp_saves;
create policy chirp_saves_select_own on public.chirp_saves for select
  using (account_id = public.current_account_id());

drop policy if exists chirp_saves_insert_own on public.chirp_saves;
create policy chirp_saves_insert_own on public.chirp_saves for insert
  with check (account_id = public.current_account_id());

drop policy if exists chirp_saves_delete_own on public.chirp_saves;
create policy chirp_saves_delete_own on public.chirp_saves for delete
  using (account_id = public.current_account_id());
