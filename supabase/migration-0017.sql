-- ═══════════════════════════════════════════════════════════════════
-- Migration 0017 — Profile covers: students upload/record their
-- own vocal karaoke performances onto their profile; anyone who
-- visits the profile can listen and like them (owner's ask,
-- 2026-11-14, part of the Music Mitra merge).
--
-- Apply in the Supabase SQL editor AFTER 0015 (0016 was withdrawn
-- before application). Idempotent: safe to re-run.
--
-- Audio lives in a NEW public storage bucket `covers`, uploaded
-- by the browser client into the owner's account-id folder
-- (same shape as chirp-images). Rows are public-read for signed-in
-- students; writes are owner-only, in the usual idiom
-- (account_id = public.current_account_id()).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.profile_covers (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  title            text not null,
  song_title       text,
  song_artist      text,
  audio_url        text not null,
  duration_seconds integer,
  created_at       timestamptz not null default now()
);

create index if not exists profile_covers_account_idx
  on public.profile_covers (account_id, created_at desc);

create table if not exists public.cover_likes (
  cover_id   uuid not null references public.profile_covers (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cover_id, account_id)
);

alter table public.profile_covers enable row level security;
alter table public.cover_likes enable row level security;

drop policy if exists covers_select_public on public.profile_covers;
create policy covers_select_public on public.profile_covers for select
  to authenticated using (true);

drop policy if exists covers_insert_own on public.profile_covers;
create policy covers_insert_own on public.profile_covers for insert
  with check (account_id = public.current_account_id());

drop policy if exists covers_update_own on public.profile_covers;
create policy covers_update_own on public.profile_covers for update
  using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

drop policy if exists covers_delete_own on public.profile_covers;
create policy covers_delete_own on public.profile_covers for delete
  using (account_id = public.current_account_id());

drop policy if exists cover_likes_select_public on public.cover_likes;
create policy cover_likes_select_public on public.cover_likes for select
  to authenticated using (true);

drop policy if exists cover_likes_insert_own on public.cover_likes;
create policy cover_likes_insert_own on public.cover_likes for insert
  with check (account_id = public.current_account_id());

drop policy if exists cover_likes_delete_own on public.cover_likes;
create policy cover_likes_delete_own on public.cover_likes for delete
  using (account_id = public.current_account_id());

-- The bucket itself (public read, like chirp-images).
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

drop policy if exists "public read covers" on storage.objects;
create policy "public read covers"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "owner write covers" on storage.objects;
create policy "owner write covers"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

drop policy if exists "owner update covers" on storage.objects;
create policy "owner update covers"
  on storage.objects for update
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  )
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

drop policy if exists "owner delete covers" on storage.objects;
create policy "owner delete covers"
  on storage.objects for delete
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );
