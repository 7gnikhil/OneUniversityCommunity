-- OneUco — storage.objects policies (companion to schema.sql).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- The schema ships the buckets' design in comments; these are the policies.
--
-- Folder convention: every upload path starts with the owner's ACCOUNT id
-- (public.accounts.id), e.g. avatars/<account-id>/dp.jpg,
-- id-cards/<account-id>/front.jpg. Policies scope writes to that folder.
-- public.current_account_id() maps the signed-in auth user to the account.

-- ── Public buckets: avatars, chirp-images, server-images ──────────────────
-- Anyone may read files in public buckets (they are served publicly).

create policy "public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "public read chirp-images"
  on storage.objects for select
  using (bucket_id = 'chirp-images');

create policy "public read server-images"
  on storage.objects for select
  using (bucket_id = 'server-images');

-- Owner-scoped writes (insert/update/delete own folder only).

create policy "owner write avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner update avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner delete avatars"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner write chirp-images"
  on storage.objects for insert
  with check (
    bucket_id = 'chirp-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner update chirp-images"
  on storage.objects for update
  using (
    bucket_id = 'chirp-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  )
  with check (
    bucket_id = 'chirp-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner delete chirp-images"
  on storage.objects for delete
  using (
    bucket_id = 'chirp-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner write server-images"
  on storage.objects for insert
  with check (
    bucket_id = 'server-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner update server-images"
  on storage.objects for update
  using (
    bucket_id = 'server-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  )
  with check (
    bucket_id = 'server-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner delete server-images"
  on storage.objects for delete
  using (
    bucket_id = 'server-images'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

-- ── Private bucket: id-cards ────────────────────────────────────────────────
-- Owner uploads and reads their own folder; admins read everything (review).
-- No public access of any kind.

create policy "owner write id-cards"
  on storage.objects for insert
  with check (
    bucket_id = 'id-cards'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner update id-cards"
  on storage.objects for update
  using (
    bucket_id = 'id-cards'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  )
  with check (
    bucket_id = 'id-cards'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "owner delete id-cards"
  on storage.objects for delete
  using (
    bucket_id = 'id-cards'
    and (storage.foldername(name))[1] = public.current_account_id()::text
  );

create policy "read own or admin id-cards"
  on storage.objects for select
  using (
    bucket_id = 'id-cards'
    and (
      (storage.foldername(name))[1] = public.current_account_id()::text
      or public.is_admin()
    )
  );
