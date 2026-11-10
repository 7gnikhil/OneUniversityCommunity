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

// ── Developer anonymity (owner's rule, 2026-11-07) ────────────────────────
// The OneUCo Developer is NEVER linkable to a personal identity on a
// public surface: the same rule the profile page implements (masked
// "OneUCo Developer", generic avatar, no follow/details — see
// app/profile/[username]/page.tsx). Public author-attribution surfaces
// (Chirp posts + comments, normal-server messages + member lists,
// server typing names) resolve the developer's account id server-side
// via lib/server/owner.ts getDeveloperAccountId (keyed on the owner
// email, which never leaves the server) and swap the real public
// profile for this projection BEFORE anything is serialised to the
// client — so the name, @handle and photo never ship at all.
// Relationship surfaces (DMs, friends, own views) deliberately do NOT
// use this: people there already know him.
export const DEVELOPER_DISPLAY_NAME = "OneUCo Developer";

export function developerPublicProfile(accountId: string): PublicProfile {
  return {
    accountId,
    username: "",
    name: DEVELOPER_DISPLAY_NAME,
    bio: null,
    branch: null,
    photoUrl: null,
    developer: true,
  };
}

// Swap the developer's entry in a profiles map for the masked
// projection. No-op when the id is unknown (fail-soft resolution) or
// the developer isn't among the authors.
export function maskDeveloperProfiles(
  profiles: Map<string, PublicProfile>,
  developerAccountId: string | null,
): Map<string, PublicProfile> {
  if (!developerAccountId || !profiles.has(developerAccountId)) {
    return profiles;
  }
  const masked = new Map(profiles);
  masked.set(developerAccountId, developerPublicProfile(developerAccountId));
  return masked;
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
// verified accounts), minus people I already swiped, anyone I am
// already MATCHED with, and anyone in a block relation with me (either
// direction — blocks must hide both ways).
//
// MATCH EXCLUSION (owner's rule, 2026-11-10 — "don't duplicate again
// the persona already matched"): a swipe-match always leaves my swipe
// row behind, so the swipes filter used to cover matched pairs too —
// but an ACCEPTED FOLLOW creates the matches row with NO swipe row
// (see lib/follows.ts), so a followed-and-accepted friend could be
// re-dealt here as a fresh stranger card. The matches table (plus any
// accepted follow row, for data-drift safety) is now excluded
// explicitly, in both directions by construction (the pair row names
// both parties).
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
  // Extra accounts never to deal (the caller passes the developer's id:
  // his card would expose the identity + gallery his masked profile
  // page never unlocks — developer anonymity rule, see above).
  excludeAccountIds?: ReadonlyArray<string>,
): Promise<DeckCandidate[]> {
  const excluded = new Set(excludeAccountIds ?? []);
  const { data: viewData } = await session
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS);
  const viewRows = ((viewData ?? []) as PublicProfileRow[]).filter(
    (row) => row.account_id !== myAccountId && !excluded.has(row.account_id),
  );
  if (viewRows.length === 0) return [];

  const candidateIds = viewRows.map((row) => row.account_id);

  const [metaResult, swipesResult, blocksResult, matchesResult, acceptedFollowsResult] =
    await Promise.all([
      session
        .from("profiles")
        .select("account_id, photo_urls, intention, updated_at")
        .in("account_id", candidateIds),
      session.from("swipes").select("swipee_id").eq("swiper_id", myAccountId),
      admin
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${myAccountId},blocked_id.eq.${myAccountId}`),
      // Everyone I already have a matches row with (mutual swipe OR
      // accepted follow) — never dealt again (see header note).
      session
        .from("matches")
        .select("account_a, account_b")
        .or(`account_a.eq.${myAccountId},account_b.eq.${myAccountId}`),
      // Accepted follow rows in either direction whose match row is
      // missing (shouldn't happen — accept creates the match — but an
      // accepted pair must never be re-dealt even if data drifts).
      // follow_requests has no client policies, hence the admin client.
      admin
        .from("follow_requests")
        .select("requester_id, target_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${myAccountId},target_id.eq.${myAccountId}`),
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

  const matchedIds = new Set<string>();
  ((matchesResult.data ?? []) as Array<{ account_a: string; account_b: string }>).forEach(
    (row) => {
      matchedIds.add(row.account_a === myAccountId ? row.account_b : row.account_a);
    },
  );
  (
    (acceptedFollowsResult.data ?? []) as Array<{
      requester_id: string;
      target_id: string;
    }>
  ).forEach((row) => {
    matchedIds.add(
      row.requester_id === myAccountId ? row.target_id : row.requester_id,
    );
  });

  const candidates: Array<{ candidate: DeckCandidate; updatedAt: string }> = [];
  viewRows.forEach((row) => {
    if (
      swipedIds.has(row.account_id) ||
      blockedIds.has(row.account_id) ||
      matchedIds.has(row.account_id)
    )
      return;
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
  // Tick states (migration 0007): created_at alone = sent;
  // delivered_at set = delivered to the other side's client;
  // read_at set = viewed. See app/friends/actions.ts for how the
  // recipient's read-receipts privacy switch shapes what a sender sees.
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

const MESSAGE_COLUMNS =
  "id, match_id, sender_id, body, image_url, delivered_at, read_at, created_at";

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

// Incremental poll fetch: only messages at/after the newest timestamp
// the client already has (the boundary row comes back too — the client
// merges by id, so the overlap is harmless and a same-millisecond pair
// can never slip through a strict > gap).
export async function listMessagesSince(
  supabase: SupabaseClient,
  matchId: string,
  sinceIso: string,
  limit: number,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("match_id", matchId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as MessageRow[];
}

// Delivery marking (service role — messages has no client UPDATE path
// for delivered_at): every incoming message of mine that a client has
// now SEEN (chat poll or Friends-list load) becomes "delivered". One
// batched update across all my matches; only undelivered rows match the
// filter, so repeat calls are cheap no-ops.
export async function markIncomingDelivered(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<void> {
  const matches = await getMyMatches(admin, myAccountId);
  if (matches.length === 0) return;
  await admin
    .from("messages")
    .update({ delivered_at: new Date().toISOString() })
    .in(
      "match_id",
      matches.map((match) => match.id),
    )
    .neq("sender_id", myAccountId)
    .is("delivered_at", null);
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
  return getDmUnreadCountsForMatches(supabase, myAccountId, matches);
}

// The same counts for a caller that already holds the match list —
// listDmEntries used to pay for getMyMatches twice per Friends render
// (once directly, once inside getDmUnreadCounts). Speed batch,
// 2026-11-10.
async function getDmUnreadCountsForMatches(
  supabase: SupabaseClient,
  myAccountId: string,
  matches: MatchRow[],
): Promise<Record<string, number>> {
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
  const matchIds = matches.map((match) => match.id);
  // Profiles, unread counts and recent messages all depend only on the
  // match list — run them in one parallel round instead of three
  // serial waits (speed batch, 2026-11-10).
  const [profilesById, unread, recentResult] = await Promise.all([
    getPublicProfilesByIds(supabase, otherIds),
    getDmUnreadCountsForMatches(supabase, myAccountId, matches),
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .in("match_id", matchIds)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const recentData = recentResult.data;
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
