-- ═══════════════════════════════════════════════════════════════════
-- Migration 0014 — Scheduled chirps (2026-11-11).
--
-- A student writes a chirp now and picks a date/time; the chirp
-- posts itself when the time comes. Rows wait in scheduled_chirps
-- (own-row RLS, written through the session client like chirps).
-- The posting itself runs INSIDE Postgres: pg_cron fires
-- post_due_scheduled_chirps() every minute, which copies due rows
-- into chirps and marks them posted — no app server, cron service
-- or signed-in user needs to be awake for a chirp to land.
-- ═══════════════════════════════════════════════════════════════════

create table public.scheduled_chirps (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  body            text,
  image_url       text,
  scheduled_for   timestamptz not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'posted', 'cancelled')),
  posted_chirp_id uuid references public.chirps (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index scheduled_chirps_due_idx
  on public.scheduled_chirps (status, scheduled_for);
create index scheduled_chirps_account_idx
  on public.scheduled_chirps (account_id);

alter table public.scheduled_chirps enable row level security;

-- Own rows only, same idiom as chirps: I can see, create and update
-- (cancel) my scheduled chirps; nobody else can see them at all.
create policy scheduled_chirps_select_own on public.scheduled_chirps for select
  to authenticated using (account_id = public.current_account_id());
create policy scheduled_chirps_insert_own on public.scheduled_chirps for insert
  to authenticated with check (account_id = public.current_account_id());
create policy scheduled_chirps_update_own on public.scheduled_chirps for update
  to authenticated using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

create trigger scheduled_chirps_set_updated_at
  before update on public.scheduled_chirps
  for each row execute function public.set_updated_at();

-- Posts every due chirp. Security definer: the cron job runs as the
-- database owner, and the function must write chirps for accounts
-- other than any caller's. Per-row errors are swallowed so one bad
-- row can never block the queue — it simply stays pending and is
-- retried on the next minute's run.
create or replace function public.post_due_scheduled_chirps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
  posted_count int := 0;
begin
  for r in
    select * from public.scheduled_chirps
    where status = 'pending' and scheduled_for <= now()
    order by scheduled_for asc
    limit 100
  loop
    begin
      insert into public.chirps (author_id, body, image_url)
      values (r.account_id, r.body, r.image_url)
      returning id into new_id;
      update public.scheduled_chirps
      set status = 'posted', posted_chirp_id = new_id
      where id = r.id;
      posted_count := posted_count + 1;
    exception when others then
      -- Leave the row pending; the next run retries it.
      null;
    end;
  end loop;
  return posted_count;
end;
$$;

create extension if not exists pg_cron;

select cron.schedule(
  'post-due-scheduled-chirps',
  '* * * * *',
  $$ select public.post_due_scheduled_chirps(); $$
);
