-- OneUco migration 0002 — open college registry + self-declared study details.
--
-- OneUco is open to students of any college or university, and joining no
-- longer involves ID-card checking or document review. Students declare
-- their college / university, branch and graduation year on the private
-- accounts row; completing that declaration activates the account.
--
-- This migration is additive and inserts no registry rows.

-- ── Open college registry ──────────────────────────────────────────────────
-- Existing rows become approved by default. A student-added college starts
-- as pending, records who added it, and may be selected immediately by its
-- adder while it awaits registry review.
alter table public.college_codes
  add column if not exists status text not null default 'approved'
    check (status in ('approved', 'pending')),
  add column if not exists added_by uuid references public.accounts (id)
    on delete set null,
  add column if not exists city text;

create index if not exists college_codes_status_name_idx
  on public.college_codes (status, college_name);

comment on column public.college_codes.status is
  'approved = selectable by everyone; pending = student-added, selectable by its adder while awaiting registry review.';
comment on column public.college_codes.added_by is
  'Account that added this college; null for rows loaded by an administrator.';

-- ── Private self-declared study details ────────────────────────────────────
-- These columns live on accounts (private identity data), not profiles, and
-- are not selected by public_profiles. college_code is set when the student
-- picked a registry entry; college_name always stores the displayed name,
-- including for free-text entries.
alter table public.accounts
  add column if not exists college_name text,
  add column if not exists college_code text
    references public.college_codes (code) on delete set null,
  add column if not exists branch text,
  add column if not exists graduation_year int;

comment on column public.accounts.college_name is
  'Self-declared college / university name. Private; not document-checked.';
comment on column public.accounts.college_code is
  'Self-declared registry college code, when a registry entry was selected. Private.';
comment on column public.accounts.branch is
  'Self-declared branch on the private account row. Private; distinct from any branch the student later chooses to show on a public profile.';
comment on column public.accounts.graduation_year is
  'Self-declared graduation year. Private; not document-checked.';
