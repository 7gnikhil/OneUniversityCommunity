// Social graph lookups: swipe deck source data, matches, DM messages,
// unread counts. Follows the lib/profile.ts pattern — the caller passes a
// Supabase client (session client where RLS suffices, service-role where a
// policy deliberately has no client path).
//
// PRIVACY: other students are ONLY ever read through the public_profiles
// view (account_id, username, name, bio, branch, photo_url) — the columns
// the schema guarantees are public. The view deliberately has no gallery
// (photo_urls) or intention column, so those two PUBLIC fields are read
// from public.profiles instead: profiles carries no private data at all
// (private data lives in verifications/accounts, which are never touched
// here) and its RLS policy (profiles_select_public) expressly allows any
// signed-in student to read profile rows. When the view gains gallery /
// intention columns, this file is the one place to switch over.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Intention, PublicProfile } from "@/lib/types";

// ── public_profiles view ───────────────────────────────────────────────────
export interface PublicProfileRow {
  account_id: string;
  username: string;
  name: string;
  bio: string | null;
  branch: string | null;
  photo_url: string | null;
}

const PUBLIC_PROFILE_COLUMNS = "account_id, username, name, bio, branch, photo_url";

export function toPublicProfile(row: PublicProfileRow): PublicProfile {
  return {
    accountId: row.account_id,
    username: row.username,
    name: row.name,
    bio: row.bio,
    branch: row.branch,
    photoUrl: row.photo_url,
  };
}

// Public rows for a set of accounts, keyed by account_id. Missing ids are
// simply absent from the map (e.g. an account that lost `verified` status
// drops out of the view and therefore out of every social surface).
export async function getPublicProfilesByIds(
  supabase: SupabaseClient,
  accountIds: ReadonlyArray<string>,
): Promise<Map<string, PublicProfile>> {
  const result = new Map<string, PublicProfile>();
  if (accountIds.length === 0) return result;
  const { data } = await supabase
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .in("account_id", [...accountIds]);
  const rows = (data ?? []) as PublicProfileRow[];
  rows.forEach((row) => {
    result.set(row.account_id, toPublicProfile(row));
  });
  return result;
}

export async function getPublicProfileByUsername(
  supabase: SupabaseClient,
  username: string,
): Promise<PublicProfile | null> {
  const { data } = await supabase
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("username", username)
    .maybeSingle();
  const row = (data ?? null) as PublicProfileRow | null;
  return row ? toPublicProfile(row) : null;
}

// ── Deck candidates ────────────────────────────────────────────────────────
// A deck card: the public profile plus the student's gallery photos and
// stated intention. photo_urls + intention are NOT columns of the
// public_profiles view (see header note) — they are read from profiles,
// whose rows contain public fields only.
export interface DeckCandidate {
  profile: PublicProfile;
  photos: string[];
  intention: Intention | null;
}

interface ProfileDeckMetaRow {
  account_id: string;
  photo_urls: string[];
  intention: Intention | null;
  updated_at: string;
}

// Deck assembly: every verified other student (the view only contains
// verified accounts), minus people I already swiped and anyone in a block
// relation with me (either direction — blocks must hide both ways).
//
// PREFERENCE FILTERING — honest scope note: my dating/friendship/study/
// networking preferences mostly reference fields the public view
// deliberately does NOT expose (their year, college, languages) or that
// don't exist as public data at all (age — no DOB is public). Filtering on
// those server-side would require reading private verification data into
// the deck path, which the schema forbids. So the ONLY preference-style
// narrowing applied here is intention compatibility, which is public:
// when I have set an intention, candidates who stated a DIFFERENT
// intention are excluded; candidates with no stated intention stay
// (intention is optional everywhere in OneUco). All other preferences stay
// "Any" in effect until the view gains safe public fields to filter on.
//
// `admin` is required because blocks are only RLS-visible to the blocker;
// the other party's block of me is invisible to my session client, and a
// one-sided hide would leak the block through deck behaviour anyway.
export async function listDeckCandidates(
  admin: SupabaseClient,
  session: SupabaseClient,
  myAccountId: string,
  myIntention: Intention | null,
  limit: number,
): Promise<DeckCandidate[]> {
  const { data: viewData } = await session
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS);
  const viewRows = ((viewData ?? []) as PublicProfileRow[]).filter(
    (row) => row.account_id !== myAccountId,
  );
  if (viewRows.length === 0) return [];

  const candidateIds = viewRows.map((row) => row.account_id);

  const [metaResult, swipesResult, blocksResult] = await Promise.all([
    session
      .from("profiles")
      .select("account_id, photo_urls, intention, updated_at")
      .in("account_id", candidateIds),
    session.from("swipes").select("swipee_id").eq("swiper_id", myAccountId),
    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${myAccountId},blocked_id.eq.${myAccountId}`),
  ]);

  const metaById = new Map<string, ProfileDeckMetaRow>();
  ((metaResult.data ?? []) as ProfileDeckMetaRow[]).forEach((row) => {
    metaById.set(row.account_id, row);
  });

  const swipedIds = new Set<string>(
    ((swipesResult.data ?? []) as Array<{ swipee_id: string }>).map(
      (row) => row.swipee_id,
    ),
  );

  const blockedIds = new Set<string>();
  ((blocksResult.data ?? []) as Array<{ blocker_id: string; blocked_id: string }>).forEach(
    (row) => {
      blockedIds.add(row.blocker_id === myAccountId ? row.blocked_id : row.blocker_id);
    },
  );

  const candidates: Array<{ candidate: DeckCandidate; updatedAt: string }> = [];
  viewRows.forEach((row) => {
    if (swipedIds.has(row.account_id) || blockedIds.has(row.account_id)) return;
    const meta = metaById.get(row.account_id);
    const theirIntention: Intention | null = meta?.intention ?? null;
    // Intention compatibility (the one public narrowing — see header note).
    if (myIntention && theirIntention && theirIntention !== myIntention) return;
    const gallery = meta?.photo_urls ?? [];
    // Card photo order per spec: gallery first photo, else the DP.
    const photos: string[] = [];
    gallery.forEach((url) => {
      if (url && !photos.includes(url)) photos.push(url);
    });
    if (row.photo_url && !photos.includes(row.photo_url)) {
      photos.push(row.photo_url);
    }
    candidates.push({
      candidate: { profile: toPublicProfile(row), photos, intention: theirIntention },
      updatedAt: meta?.updated_at ?? "",
    });
  });

  // Most recently updated profiles first.
  candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return candidates.slice(0, limit).map((entry) => entry.candidate);
}

// ── matches ────────────────────────────────────────────────────────────────
export interface MatchRow {
  id: string;
  account_a: string;
  account_b: string;
  created_at: string;
  updated_at: string;
}

const MATCH_COLUMNS = "id, account_a, account_b, created_at, updated_at";

// The schema's pair columns are account_a / account_b with a UNIQUE
// constraint on the pair. To keep exactly one canonical row per pair
// regardless of who liked second, the pair is always stored ordered:
// account_a is the lexicographically smaller account id.
export function orderedPair(
  first: string,
  second: string,
): { account_a: string; account_b: string } {
  return first < second
    ? { account_a: first, account_b: second }
    : { account_a: second, account_b: first };
}

export function otherPartyId(match: MatchRow, myAccountId: string): string {
  return match.account_a === myAccountId ? match.account_b : match.account_a;
}

export async function getMyMatches(
  supabase: SupabaseClient,
  myAccountId: string,
): Promise<MatchRow[]> {
  const { data } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .or(`account_a.eq.${myAccountId},account_b.eq.${myAccountId}`)
    .order("updated_at", { ascending: false });
  return (data ?? []) as MatchRow[];
}

export async function getMatchById(
  supabase: SupabaseClient,
  matchId: string,
): Promise<MatchRow | null> {
  const { data } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("id", matchId)
    .maybeSingle();
  return (data ?? null) as MatchRow | null;
}

// ── DM messages + unread ───────────────────────────────────────────────────
export interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  read_at: string | null;
  created_at: string;
}

const MESSAGE_COLUMNS = "id, match_id, sender_id, body, image_url, read_at, created_at";

export async function listMessages(
  supabase: SupabaseClient,
  matchId: string,
  limit: number,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as MessageRow[];
}

// UNREAD MECHANISM: messages.read_at exists in the schema (null = unread)
// and the messages_mark_read RLS policy lets the non-sender participant
// set it — so unread is exact per message, not approximated from
// timestamps: a message counts as unread iff it was sent by the OTHER
// party and its read_at is still null. Viewing the chat sets read_at on
// those rows (app/friends/actions.ts markMatchReadAction), which clears
// the count here and on the dial badge (Slice 4 wires the same helper).
export async function getDmUnreadCounts(
  supabase: SupabaseClient,
  myAccountId: string,
): Promise<Record<string, number>> {
  const matches = await getMyMatches(supabase, myAccountId);
  const counts: Record<string, number> = {};
  if (matches.length === 0) return counts;
  const matchIds = matches.map((match) => match.id);
  const { data } = await supabase
    .from("messages")
    .select("match_id")
    .in("match_id", matchIds)
    .neq("sender_id", myAccountId)
    .is("read_at", null);
  ((data ?? []) as Array<{ match_id: string }>).forEach((row) => {
    counts[row.match_id] = (counts[row.match_id] ?? 0) + 1;
  });
  return counts;
}

export async function getTotalDmUnread(
  supabase: SupabaseClient,
  myAccountId: string,
): Promise<number> {
  const counts = await getDmUnreadCounts(supabase, myAccountId);
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

// ── DM list entries (Friends page) ─────────────────────────────────────────
export interface DmListEntry {
  matchId: string;
  other: PublicProfile;
  lastMessage: {
    body: string | null;
    imageUrl: string | null;
    createdAt: string;
    fromMe: boolean;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

// One entry per match, newest activity first (matches.updated_at is
// bumped server-side on every DM send). Matches whose other party dropped
// out of the public view (e.g. suspended) are skipped — there is no
// public identity left to display for them.
export async function listDmEntries(
  supabase: SupabaseClient,
  myAccountId: string,
): Promise<DmListEntry[]> {
  const matches = await getMyMatches(supabase, myAccountId);
  if (matches.length === 0) return [];

  const otherIds = matches.map((match) => otherPartyId(match, myAccountId));
  const profilesById = await getPublicProfilesByIds(supabase, otherIds);
  const unread = await getDmUnreadCounts(supabase, myAccountId);

  const matchIds = matches.map((match) => match.id);
  const { data: recentData } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("match_id", matchIds)
    .order("created_at", { ascending: false })
    .limit(300);
  const lastByMatch = new Map<string, MessageRow>();
  ((recentData ?? []) as MessageRow[]).forEach((row) => {
    if (!lastByMatch.has(row.match_id)) lastByMatch.set(row.match_id, row);
  });

  const entries: DmListEntry[] = [];
  matches.forEach((match) => {
    const other = profilesById.get(otherPartyId(match, myAccountId));
    if (!other) return;
    const last = lastByMatch.get(match.id) ?? null;
    entries.push({
      matchId: match.id,
      other,
      lastMessage: last
        ? {
            body: last.body,
            imageUrl: last.image_url,
            createdAt: last.created_at,
            fromMe: last.sender_id === myAccountId,
          }
        : null,
      unreadCount: unread[match.id] ?? 0,
      updatedAt: match.updated_at,
    });
  });
  return entries;
}
