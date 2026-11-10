-- ═══════════════════════════════════════════════════════════════════════════
-- OneUco — production database schema (Postgres / Supabase)
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Region note: create the project in Mumbai (ap-south-1) for Indian users.
--
-- Design rules baked into this schema:
--   * Public profile data (profiles) is physically SEPARATE from private
--     verification data (verifications) so public queries can never leak
--     year / college / hall-ticket / phone.
--   * One account per roll number: hall_ticket is UNIQUE among verified
--     verification rows (partial unique index, below).
--   * Maya Jwalam anonymity: server_messages ALWAYS stores author_id, but
--     member-facing queries for the main channel must strip it server-side;
--     author_id exists for owner/admin moderation only.
--   * Passwords: if Supabase Auth manages credentials (recommended), leave
--     accounts.password_hash NULL and rely on auth.users. The column exists
--     for the app-level password flow; NEVER store a plaintext password.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACCOUNTS — one row per person. Identity + login, no profile content.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  -- Link to Supabase Auth (auth.users). Nullable for rows created by
  -- server-side sign-up before the auth user is attached.
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  oneuco_id     text not null unique,            -- short human ID, e.g. UC + 6 chars
  username      text not null unique,            -- the @handle, claimed at sign-up
  email         text not null unique,
  phone         text,
  password_hash text,                            -- salted hash only; see header note
  role          text not null default 'student'
                  check (role in ('student', 'admin', 'owner')),
  -- pending_verification = account exists but has NO full access yet;
  -- a failed auto-check lands here / stays here — never a ban or deletion.
  status        text not null default 'pending_verification'
                  check (status in ('pending_verification', 'verified', 'rejected', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Resolves the app account for the currently signed-in auth user.
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.accounts where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accounts
    where id = public.current_account_id()
      and role in ('admin', 'owner')
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROFILES — PUBLIC fields only. Anything in this table may be shown to
-- other students (name, bio, branch, photo). Private data lives elsewhere.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.profiles (
  account_id   uuid primary key references public.accounts (id) on delete cascade,
  name         text not null,
  bio          text,
  branch       text,
  photo_url    text,                             -- `avatars` bucket
  photo_urls   text[] not null default '{}',     -- additional gallery photos
  interests    text[] not null default '{}',
  -- Portfolio links live here (added post-sign-up, Settings -> Portfolio).
  portfolio    jsonb not null default '{}'::jsonb,
  -- Intention + per-intention preference filters (all optional, Any default).
  intention    text check (intention in ('dating', 'friendship', 'study_partner', 'networking')),
  preferences  jsonb not null default '{}'::jsonb,
  accent_color text not null default 'black',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COLLEGE CODES — the OFFICIAL JNTUH college-code list (2-char codes),
-- used to validate the college code embedded in hall-ticket numbers.
-- Populate from JNTUH's published list; owner-extensible for new colleges.
-- (No seed rows are shipped: load the real published list, don't invent it.)
-- ═══════════════════════════════════════════════════════════════════════════

create table public.college_codes (
  code         text primary key,                 -- 2-char code, e.g. 'XY'
  college_name text not null,
  created_at   timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATIONS — PRIVATE. One row per verification attempt/record.
-- Parsed ID-card fields, per-layer results, review state. Admin eyes only
-- (plus the owning student reading their own status).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.verifications (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  hall_ticket       text,                        -- 10-char hall ticket / admission no.
  id_card_front_url text,                        -- PRIVATE `id-cards` bucket
  id_card_back_url  text,                        -- PRIVATE `id-cards` bucket
  -- Full field-based OCR parse (no fixed template — every college's card
  -- differs): name, hall ticket, course, branch, dob, blood group,
  -- guardian name, address, phone, email, college name, validity year,
  -- photo present, principal seal present, ...
  parsed_fields     jsonb not null default '{}'::jsonb,
  college_code      text references public.college_codes (code),
  claimed_grad_year int,
  -- Per-layer outcomes: 'pass' | 'fail' | 'not_provided' | 'skipped'
  layer_ocr         text not null default 'not_provided',
  layer_structure   text not null default 'not_provided',
  layer_email_otp   text not null default 'not_provided',
  -- Alternative proofs for students whose card won't parse.
  alt_proofs        jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'verified', 'rejected')),
  reviewer_id       uuid references public.accounts (id),
  review_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One account per roll number, enforced at the database level.
create unique index verifications_one_account_per_roll
  on public.verifications (hall_ticket)
  where status = 'verified' and hall_ticket is not null;

create index verifications_account_idx on public.verifications (account_id);
create index verifications_status_idx  on public.verifications (status);

-- ═══════════════════════════════════════════════════════════════════════════
-- SERVERS / CHANNELS / MEMBERS / MESSAGES / FLAIRS / INVITES
-- ═══════════════════════════════════════════════════════════════════════════

create table public.servers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null default 'public'
                    check (type in ('public', 'friends_private', 'strangers_private')),
  -- Maya Jwalam (the main channel) is flagged in DATA, not by name string,
  -- so its Telegram-style anonymous UI survives renames/reseeds.
  is_main_channel boolean not null default false,
  icon_url        text,                          -- `server-images` bucket
  description     text,
  created_by      uuid not null references public.accounts (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Exactly one main channel.
create unique index servers_single_main_channel
  on public.servers (is_main_channel) where is_main_channel;

create table public.channels (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers (id) on delete cascade,
  name       text not null,
  topic      text,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table public.server_members (
  server_id  uuid not null references public.servers (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  role       text not null default 'member'
               check (role in ('owner', 'admin', 'mod', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (server_id, account_id)
);

create table public.flairs (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid references public.servers (id) on delete cascade, -- null = global
  name       text not null,
  color      text not null default '#888888',
  created_by uuid references public.accounts (id),
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

-- Seed note: the only built-in flair is the global "ReqToAdmin"
-- (server_id null). Insert it after the owner account exists:
--   insert into public.flairs (server_id, name, color, created_by)
--   values (null, 'ReqToAdmin', '#e11d48', '<owner-account-id>');

create table public.server_messages (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete cascade,
  -- ALWAYS the real author. For the anonymous main channel this column is
  -- moderation-only data: member-facing APIs must never return it.
  author_id  uuid not null references public.accounts (id),
  body       text,
  image_url  text,                               -- `server-images` bucket
  flair_id   uuid references public.flairs (id),
  is_pinned  boolean not null default false,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

create index server_messages_channel_idx
  on public.server_messages (server_id, channel_id, created_at desc);

-- Per-user view tracking (drives real view counts; one row per viewer).
create table public.server_message_views (
  message_id uuid not null references public.server_messages (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (message_id, account_id)
);

create table public.group_invites (
  id                  uuid primary key default gen_random_uuid(),
  server_id           uuid not null references public.servers (id) on delete cascade,
  invite_code         text not null unique,      -- join-by-code + share link token
  created_by          uuid not null references public.accounts (id),
  invitee_account_id  uuid references public.accounts (id), -- set for direct adds
  expires_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- Server visibility helpers (used by many policies below).
create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id and account_id = public.current_account_id()
  )
$$;

create or replace function public.is_server_owner(p_server_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id
      and account_id = public.current_account_id()
      and role = 'owner'
  ) or exists (
    select 1 from public.servers
    where id = p_server_id and created_by = public.current_account_id()
  )
$$;

create or replace function public.can_view_server(p_server_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.servers s
    where s.id = p_server_id
      and (s.type = 'public'
           or s.created_by = public.current_account_id()
           or public.is_server_member(p_server_id))
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SWIPES / MATCHES / DM MESSAGES
-- ═══════════════════════════════════════════════════════════════════════════

create table public.swipes (
  id         uuid primary key default gen_random_uuid(),
  swiper_id  uuid not null references public.accounts (id) on delete cascade,
  swipee_id  uuid not null references public.accounts (id) on delete cascade,
  direction  text not null check (direction in ('like', 'pass')),
  created_at timestamptz not null default now(),
  unique (swiper_id, swipee_id),
  check (swiper_id <> swipee_id)
);

create index swipes_swipee_idx on public.swipes (swipee_id);

create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  account_a  uuid not null references public.accounts (id) on delete cascade,
  account_b  uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- bump on new DM (list ordering)
  unique (account_a, account_b),
  check (account_a <> account_b)
);
-- Note: a match row is created by a server-side function when a like is
-- reciprocated (see RLS: clients have no INSERT policy on matches).

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references public.accounts (id),
  body       text,
  image_url  text,                               -- `server-images` or `chirp-images` bucket
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index messages_match_idx on public.messages (match_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- CHIRPS (X-style feed; identities are normal here)
-- ═══════════════════════════════════════════════════════════════════════════

create table public.chirps (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.accounts (id) on delete cascade,
  body          text,
  image_url     text,                            -- `chirp-images` bucket
  repost_of_id  uuid references public.chirps (id) on delete set null,
  view_count    int not null default 0,          -- real counts, server-incremented
  like_count    int not null default 0,
  comment_count int not null default 0,
  repost_count  int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index chirps_created_idx on public.chirps (created_at desc);
create index chirps_author_idx  on public.chirps (author_id);

create table public.chirp_comments (
  id         uuid primary key default gen_random_uuid(),
  chirp_id   uuid not null references public.chirps (id) on delete cascade,
  author_id  uuid not null references public.accounts (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index chirp_comments_chirp_idx on public.chirp_comments (chirp_id, created_at);

create table public.chirp_likes (
  chirp_id   uuid not null references public.chirps (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chirp_id, account_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INBOX / PROFILE-REVEAL REQUESTS / BLOCKS / REPORTS / DEVELOPER REQUESTS
-- ═══════════════════════════════════════════════════════════════════════════

create table public.inbox_items (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.accounts (id) on delete cascade,
  -- reveal_request | reveal_outcome | group_invite | verification_outcome
  -- | developer_update | admin_notice
  kind         text not null,
  title        text not null,
  body         text,
  ref_id       uuid,                             -- id in the owning table (polymorphic)
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index inbox_recipient_idx on public.inbox_items (recipient_id, is_read, created_at desc);

create table public.reveal_requests (
  id             uuid primary key default gen_random_uuid(),
  -- A Maya Jwalam member asks an anonymous poster "Show me your profile".
  server_id      uuid not null references public.servers (id) on delete cascade,
  message_id     uuid references public.server_messages (id) on delete set null,
  requester_id   uuid not null references public.accounts (id) on delete cascade,
  poster_id      uuid not null references public.accounts (id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (requester_id, poster_id, message_id)
);
-- Accepted = poster identity revealed to that requester ONLY (per-pair).
-- Rejected = requester is told it was declined; poster stays anonymous.
-- Anti-abuse (daily caps, no re-asking after rejection) is enforced in the
-- server action; blocks also block reveal requests (checked server-side).

create table public.blocks (
  blocker_id uuid not null references public.accounts (id) on delete cascade,
  blocked_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid not null references public.accounts (id),
  reported_account_id uuid references public.accounts (id),
  server_message_id  uuid references public.server_messages (id) on delete set null,
  chirp_id           uuid references public.chirps (id) on delete set null,
  reason             text not null,
  status             text not null default 'open'
                       check (status in ('open', 'actioned', 'dismissed')),
  created_at         timestamptz not null default now()
);

create table public.developer_requests (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  category   text not null
               check (category in ('change', 'addon', 'bug', 'other')),
  title      text not null,
  body       text not null,
  status     text not null default 'received'
               check (status in ('received', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- "Req to Developer": the request form IS the developer contact method.
-- No email address is displayed anywhere in the app UI.

-- ═══════════════════════════════════════════════════════════════════════════
-- FLING PROFILES — the deck-only profile (migration 0012). SEPARATE from
-- the personal profile above: a bio/likes/dislikes card that exists to
-- be seen by signed-in students in Fling (opened from a deck card). It
-- holds NO private data — college/grad year are never copied here.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.fling_profiles (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  bio        text,   -- the Fling-only one-liner (separate from profiles.bio)
  likes      text,   -- free text, the student's own words
  dislikes   text,   -- free text, the student's own words
  updated_at timestamptz not null default now()
);

-- ── updated_at triggers ────────────────────────────────────────────────────

create trigger accounts_set_updated_at      before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at      before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger verifications_set_updated_at before update on public.verifications
  for each row execute function public.set_updated_at();
create trigger servers_set_updated_at       before update on public.servers
  for each row execute function public.set_updated_at();
create trigger matches_set_updated_at       before update on public.matches
  for each row execute function public.set_updated_at();
create trigger chirps_set_updated_at        before update on public.chirps
  for each row execute function public.set_updated_at();
create trigger inbox_set_updated_at         before update on public.inbox_items
  for each row execute function public.set_updated_at();
create trigger reveal_set_updated_at        before update on public.reveal_requests
  for each row execute function public.set_updated_at();
create trigger devreq_set_updated_at        before update on public.developer_requests
  for each row execute function public.set_updated_at();
create trigger fling_profiles_set_updated_at before update on public.fling_profiles
  for each row execute function public.set_updated_at();

-- ── Public profile view ────────────────────────────────────────────────────
-- The deck, student search and public profile pages should read THIS view
-- (or the equivalent server-side projection). It physically cannot return
-- year, college, hall ticket or phone — those columns are not in it.

create or replace view public.public_profiles as
select
  a.id        as account_id,
  a.username,
  p.name,
  p.bio,
  p.branch,
  p.photo_url
from public.profiles p
join public.accounts a on a.id = p.account_id
where a.status = 'verified';

comment on view public.public_profiles is
  'Public-safe projection: name, bio, branch, photo, username only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — starter policies.
-- Philosophy: users read/write their OWN rows; membership gates server data;
-- anything cross-user (match creation, inbox delivery, review decisions,
-- count increments) goes through server actions using the service-role key,
-- which bypasses RLS. Tighten before public launch (see README).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.accounts          enable row level security;
alter table public.profiles          enable row level security;
alter table public.college_codes     enable row level security;
alter table public.verifications     enable row level security;
alter table public.servers           enable row level security;
alter table public.channels          enable row level security;
alter table public.server_members    enable row level security;
alter table public.flairs            enable row level security;
alter table public.server_messages   enable row level security;
alter table public.server_message_views enable row level security;
alter table public.group_invites     enable row level security;
alter table public.swipes            enable row level security;
alter table public.matches           enable row level security;
alter table public.messages          enable row level security;
alter table public.chirps            enable row level security;
alter table public.chirp_comments    enable row level security;
alter table public.chirp_likes       enable row level security;
alter table public.inbox_items       enable row level security;
alter table public.reveal_requests   enable row level security;
alter table public.blocks            enable row level security;
alter table public.reports           enable row level security;
alter table public.developer_requests enable row level security;
alter table public.fling_profiles    enable row level security;

-- accounts: read/update self; admins read all. INSERT happens via the
-- sign-up server action (service role) so uniqueness + verification
-- state are created atomically.
create policy accounts_select_self  on public.accounts for select
  using (auth_user_id = auth.uid() or public.is_admin());
create policy accounts_update_self  on public.accounts for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- profiles: PUBLIC fields only, so any signed-in student may read them;
-- writes are owner-only.
create policy profiles_select_public on public.profiles for select
  to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert
  with check (account_id = public.current_account_id());
create policy profiles_update_own on public.profiles for update
  using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());
create policy profiles_delete_own on public.profiles for delete
  using (account_id = public.current_account_id());

-- college_codes: readable by students (used in sign-up guidance); writes
-- are admin/service-role only.
create policy college_codes_select on public.college_codes for select
  to authenticated using (true);
create policy college_codes_admin_write on public.college_codes for all
  using (public.is_admin()) with check (public.is_admin());

-- verifications: the student sees their own record/status; admins see the
-- review queue. Students may submit (insert) and re-submit while pending;
-- approve/reject is an admin-only update.
create policy verifications_select_own on public.verifications for select
  using (account_id = public.current_account_id() or public.is_admin());
create policy verifications_insert_own on public.verifications for insert
  with check (account_id = public.current_account_id() and status = 'pending');
create policy verifications_update_own_pending on public.verifications for update
  using (account_id = public.current_account_id() and status = 'pending')
  with check (account_id = public.current_account_id());
create policy verifications_admin_review on public.verifications for update
  using (public.is_admin()) with check (public.is_admin());

-- servers / channels / members
create policy servers_select on public.servers for select
  using (public.can_view_server(id));
create policy servers_insert on public.servers for insert
  with check (created_by = public.current_account_id());
create policy servers_update_owner on public.servers for update
  using (created_by = public.current_account_id() or public.is_admin())
  with check (created_by = public.current_account_id() or public.is_admin());
create policy servers_delete_owner on public.servers for delete
  using (created_by = public.current_account_id() or public.is_admin());

create policy channels_select on public.channels for select
  using (public.can_view_server(server_id));
create policy channels_write_owner on public.channels for all
  using (public.is_server_owner(server_id) or public.is_admin())
  with check (public.is_server_owner(server_id) or public.is_admin());

create policy server_members_select on public.server_members for select
  using (account_id = public.current_account_id()
         or public.can_view_server(server_id));
create policy server_members_join_public on public.server_members for insert
  with check (
    (account_id = public.current_account_id()
     and exists (select 1 from public.servers s
                 where s.id = server_id and s.type = 'public'))
    or public.is_server_owner(server_id)
    or public.is_admin()
  );
  -- Private-group joins by invite code/link/direct add run through a
  -- server action (service role) that validates group_invites first.
create policy server_members_leave on public.server_members for delete
  using (account_id = public.current_account_id()
         or public.is_server_owner(server_id) or public.is_admin());
create policy server_members_role_owner on public.server_members for update
  using (public.is_server_owner(server_id) or public.is_admin())
  with check (public.is_server_owner(server_id) or public.is_admin());

-- flairs: readable wherever the server is visible (global flairs too);
-- created/edited by server owners and app admins only.
create policy flairs_select on public.flairs for select
  using (server_id is null or public.can_view_server(server_id));
create policy flairs_write on public.flairs for all
  using ((server_id is not null and public.is_server_owner(server_id))
         or public.is_admin())
  with check ((server_id is not null and public.is_server_owner(server_id))
         or public.is_admin());

-- server messages: members/viewers read; members post as themselves.
-- ANONYMITY NOTE: RLS cannot strip columns — for the main (anonymous)
-- channel the API/server component must project author fields out for
-- member viewers. author_id is returned only to admin/mod code paths.
create policy server_messages_select on public.server_messages for select
  using (public.can_view_server(server_id));
create policy server_messages_insert on public.server_messages for insert
  with check (author_id = public.current_account_id()
              and public.is_server_member(server_id));
create policy server_messages_delete on public.server_messages for delete
  using (author_id = public.current_account_id()
         or public.is_server_owner(server_id) or public.is_admin());

create policy server_message_views_select on public.server_message_views for select
  using (account_id = public.current_account_id());
create policy server_message_views_insert on public.server_message_views for insert
  with check (account_id = public.current_account_id()
              and exists (select 1 from public.server_messages m
                          where m.id = message_id
                            and public.can_view_server(m.server_id)));

-- group invites: visible to server members and to a direct invitee;
-- created by the server owner/admin (direct adds + code/link generation).
create policy group_invites_select on public.group_invites for select
  using (public.is_server_member(server_id)
         or invitee_account_id = public.current_account_id()
         or public.is_admin());
create policy group_invites_write on public.group_invites for all
  using (public.is_server_owner(server_id) or public.is_admin())
  with check (public.is_server_owner(server_id) or public.is_admin());

-- swipes: strictly your own.
create policy swipes_select_own on public.swipes for select
  using (swiper_id = public.current_account_id());
create policy swipes_insert_own on public.swipes for insert
  with check (swiper_id = public.current_account_id());

-- matches: participants only. No client INSERT — a server function creates
-- the row when a like is reciprocated.
create policy matches_select_participants on public.matches for select
  using (account_a = public.current_account_id()
         or account_b = public.current_account_id());

-- DM messages: participants of the match only; send as yourself; the other
-- participant may mark messages read.
create policy messages_select_participants on public.messages for select
  using (exists (select 1 from public.matches m
                 where m.id = match_id
                   and (m.account_a = public.current_account_id()
                        or m.account_b = public.current_account_id())));
create policy messages_insert_participant on public.messages for insert
  with check (sender_id = public.current_account_id()
              and exists (select 1 from public.matches m
                          where m.id = match_id
                            and (m.account_a = public.current_account_id()
                                 or m.account_b = public.current_account_id())));
create policy messages_mark_read on public.messages for update
  using (sender_id <> public.current_account_id()
         and exists (select 1 from public.matches m
                     where m.id = match_id
                       and (m.account_a = public.current_account_id()
                            or m.account_b = public.current_account_id())))
  with check (sender_id <> public.current_account_id());

-- chirps: readable by all signed-in students; author-owned writes.
create policy chirps_select on public.chirps for select
  to authenticated using (true);
create policy chirps_insert_own on public.chirps for insert
  with check (author_id = public.current_account_id());
create policy chirps_update_own on public.chirps for update
  using (author_id = public.current_account_id())
  with check (author_id = public.current_account_id());
create policy chirps_delete_own on public.chirps for delete
  using (author_id = public.current_account_id() or public.is_admin());

create policy chirp_comments_select on public.chirp_comments for select
  to authenticated using (true);
create policy chirp_comments_insert_own on public.chirp_comments for insert
  with check (author_id = public.current_account_id());
create policy chirp_comments_delete_own on public.chirp_comments for delete
  using (author_id = public.current_account_id() or public.is_admin());

create policy chirp_likes_select_own on public.chirp_likes for select
  using (account_id = public.current_account_id());
create policy chirp_likes_insert_own on public.chirp_likes for insert
  with check (account_id = public.current_account_id());
create policy chirp_likes_delete_own on public.chirp_likes for delete
  using (account_id = public.current_account_id());

-- inbox: strictly the recipient's. Rows are DELIVERED by server actions
-- (service role) — reveal outcomes, invite notices, verification results.
create policy inbox_select_own on public.inbox_items for select
  using (recipient_id = public.current_account_id());
create policy inbox_update_own on public.inbox_items for update
  using (recipient_id = public.current_account_id())
  with check (recipient_id = public.current_account_id());

-- reveal requests: visible to the two parties; the requester creates, the
-- poster responds (accept/reject) and may later revoke an accepted reveal.
create policy reveal_select_parties on public.reveal_requests for select
  using (requester_id = public.current_account_id()
         or poster_id = public.current_account_id()
         or public.is_admin());
create policy reveal_insert_requester on public.reveal_requests for insert
  with check (requester_id = public.current_account_id() and status = 'pending');
create policy reveal_update_parties on public.reveal_requests for update
  using (poster_id = public.current_account_id()
         or requester_id = public.current_account_id())
  with check (poster_id = public.current_account_id()
         or requester_id = public.current_account_id());

-- blocks: your own list only. Server code also consults blocks to hide
-- users from each other in deck/search and to stop reveal requests.
create policy blocks_select_own on public.blocks for select
  using (blocker_id = public.current_account_id());
create policy blocks_insert_own on public.blocks for insert
  with check (blocker_id = public.current_account_id());
create policy blocks_delete_own on public.blocks for delete
  using (blocker_id = public.current_account_id());

-- reports: you file and see your own; admins work the queue.
create policy reports_insert_own on public.reports for insert
  with check (reporter_id = public.current_account_id());
create policy reports_select_own_or_admin on public.reports for select
  using (reporter_id = public.current_account_id() or public.is_admin());
create policy reports_admin_update on public.reports for update
  using (public.is_admin()) with check (public.is_admin());

-- developer requests ("Req to Developer"): you file and track your own;
-- admins read all and update statuses.
create policy devreq_insert_own on public.developer_requests for insert
  with check (account_id = public.current_account_id());
create policy devreq_select_own_or_admin on public.developer_requests for select
  using (account_id = public.current_account_id() or public.is_admin());
create policy devreq_admin_update on public.developer_requests for update
  using (public.is_admin()) with check (public.is_admin());

-- fling_profiles: members read any row (the data exists to be seen in
-- Fling); writes are strictly your own row. No anon access at all.
create policy fling_profiles_select_members on public.fling_profiles for select
  to authenticated using (true);
create policy fling_profiles_insert_own on public.fling_profiles for insert
  with check (account_id = public.current_account_id());
create policy fling_profiles_update_own on public.fling_profiles for update
  using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS — create in Dashboard -> Storage (or uncomment):
--   avatars       (public)  profile photos
--   chirp-images  (public)  chirp + DM images
--   server-images (public)  server icons + message images
--   id-cards      (PRIVATE) ID card photos for verification review only
--
-- insert into storage.buckets (id, name, public) values
--   ('avatars', 'avatars', true),
--   ('chirp-images', 'chirp-images', true),
--   ('server-images', 'server-images', true),
--   ('id-cards', 'id-cards', false)
-- on conflict (id) do nothing;
-- Then add storage.objects policies: public buckets = public read +
-- owner-scoped write (folder = account id); id-cards = owner upload +
-- admin read only. See README.md.
-- ═══════════════════════════════════════════════════════════════════════════
