// Presence data layer: heartbeats, online state, typing targets and the
// two WhatsApp-style chat privacy switches (migration 0007).
//
// ALL reads/writes here run on the SERVICE-ROLE client: public.presence
// has RLS enabled with no policies, exactly like follow_requests —
// presence is a server-action concern, never a client query. The privacy
// switches live on public.profiles (show_online / read_receipts) and are
// read through the same admin client so a single helper serves the poll
// actions, the Friends list and the admin pages.
//
// FAIL-SOFT BY DESIGN: if the presence table or the profiles columns are
// missing (e.g. migration 0007 not applied yet) or a query errors, every
// helper degrades to "offline / settings at their defaults" instead of
// throwing — presence is decoration on top of chat, never a reason for
// a page or poll to break.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus } from "@/lib/types";

// "Online" = a heartbeat landed inside this window. Clients heartbeat
// every 30s while signed in, so 3 minutes tolerates a few missed beats
// (background tab throttling) without showing ghosts for long.
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export interface PresenceRow {
  account_id: string;
  last_seen_at: string;
  typing_kind: "dm" | "server" | null;
  typing_ref: string | null;
  typing_until: string | null;
}

const PRESENCE_COLUMNS =
  "account_id, last_seen_at, typing_kind, typing_ref, typing_until";

export function isOnline(row: PresenceRow | null | undefined): boolean {
  if (!row) return false;
  const seen = new Date(row.last_seen_at).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < ONLINE_WINDOW_MS;
}

// Is this presence row actively typing at the given target right now?
export function isTypingAt(
  row: PresenceRow | null | undefined,
  kind: "dm" | "server",
  ref: string,
): boolean {
  if (!row) return false;
  if (row.typing_kind !== kind || row.typing_ref !== ref) return false;
  if (!row.typing_until) return false;
  return new Date(row.typing_until).getTime() > Date.now();
}

// One heartbeat: last_seen_at = now. An upsert keyed on the primary key,
// touching ONLY last_seen_at on conflict so a live typing state is never
// clobbered by a heartbeat landing mid-type.
export async function heartbeat(
  admin: SupabaseClient,
  accountId: string,
): Promise<void> {
  try {
    await admin.from("presence").upsert(
      { account_id: accountId, last_seen_at: new Date().toISOString() },
      { onConflict: "account_id" },
    );
  } catch {
    // Presence is best-effort — never surface a heartbeat failure.
  }
}

// Set (or clear) the caller's typing target. Typing expires on its own
// via typing_until, so a client that dies mid-sentence never leaves a
// permanent "typing…" behind.
export async function setTyping(
  admin: SupabaseClient,
  accountId: string,
  kind: "dm" | "server" | null,
  ref: string | null,
): Promise<void> {
  try {
    if (kind === null || ref === null) {
      await admin
        .from("presence")
        .update({ typing_kind: null, typing_ref: null, typing_until: null })
        .eq("account_id", accountId);
      return;
    }
    await admin.from("presence").upsert(
      {
        account_id: accountId,
        last_seen_at: new Date().toISOString(),
        typing_kind: kind,
        typing_ref: ref,
        typing_until: new Date(Date.now() + 4_000).toISOString(),
      },
      { onConflict: "account_id" },
    );
  } catch {
    // Best-effort, like the heartbeat.
  }
}

// Presence rows for a set of accounts, keyed by account_id. Missing ids
// (never heartbeated) are simply absent from the map.
export async function getPresenceMap(
  admin: SupabaseClient,
  accountIds: ReadonlyArray<string>,
): Promise<Map<string, PresenceRow>> {
  const result = new Map<string, PresenceRow>();
  if (accountIds.length === 0) return result;
  try {
    const { data, error } = await admin
      .from("presence")
      .select(PRESENCE_COLUMNS)
      .in("account_id", [...accountIds]);
    if (error) return result;
    ((data ?? []) as PresenceRow[]).forEach((row) => {
      result.set(row.account_id, row);
    });
  } catch {
    // Fail soft — everyone reads as offline.
  }
  return result;
}

export interface OnlineCounts {
  total: number | null;
  online: number | null;
}

// Admin stat cards: every account ever created + how many are online
// right now. Nulls on error so the page renders a dash, not a wrong 0.
export async function getOnlineCounts(
  admin: SupabaseClient,
): Promise<OnlineCounts> {
  try {
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const [totalResult, onlineResult] = await Promise.all([
      admin.from("accounts").select("id", { count: "exact", head: true }),
      admin
        .from("presence")
        .select("account_id", { count: "exact", head: true })
        .gte("last_seen_at", cutoff),
    ]);
    return {
      total: totalResult.error ? null : (totalResult.count ?? null),
      online: onlineResult.error ? null : (onlineResult.count ?? null),
    };
  } catch {
    return { total: null, online: null };
  }
}

// ── Admin accounts list ────────────────────────────────────────────────────
export interface AccountPresenceEntry {
  id: string;
  username: string;
  oneucoId: string;
  email: string;
  status: AccountStatus;
  collegeName: string | null;
  createdAt: string;
  name: string;
  photoUrl: string | null;
  presence: PresenceRow | null;
  online: boolean;
}

interface AccountListRow {
  id: string;
  username: string;
  oneuco_id: string;
  email: string;
  status: AccountStatus;
  college_name: string | null;
  created_at: string;
}

// Every account (any status), joined with its public profile fields and
// its presence row, most-recently-seen first (accounts that have never
// heartbeated sort last, in sign-up order among themselves).
export async function listAccountsWithPresence(
  admin: SupabaseClient,
): Promise<AccountPresenceEntry[]> {
  const { data } = await admin
    .from("accounts")
    .select("id, username, oneuco_id, email, status, college_name, created_at")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as AccountListRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [profilesResult, presenceById] = await Promise.all([
    admin
      .from("profiles")
      .select("account_id, name, photo_url")
      .in("account_id", ids),
    getPresenceMap(admin, ids),
  ]);
  const profileById = new Map<
    string,
    { name: string; photo_url: string | null }
  >();
  (
    (profilesResult.data ?? []) as Array<{
      account_id: string;
      name: string;
      photo_url: string | null;
    }>
  ).forEach((row) => {
    profileById.set(row.account_id, { name: row.name, photo_url: row.photo_url });
  });

  const entries: AccountPresenceEntry[] = rows.map((row) => {
    const presence = presenceById.get(row.id) ?? null;
    const profile = profileById.get(row.id);
    return {
      id: row.id,
      username: row.username,
      oneucoId: row.oneuco_id,
      email: row.email,
      status: row.status,
      collegeName: row.college_name,
      createdAt: row.created_at,
      name: profile?.name ?? "",
      photoUrl: profile?.photo_url ?? null,
      presence,
      online: isOnline(presence),
    };
  });

  entries.sort((a, b) => {
    const aSeen = a.presence?.last_seen_at ?? "";
    const bSeen = b.presence?.last_seen_at ?? "";
    if (aSeen !== bSeen) return bSeen.localeCompare(aSeen);
    return a.createdAt.localeCompare(b.createdAt);
  });
  return entries;
}

// ── Chat privacy switches (profiles.show_online / read_receipts) ──────────
export interface PrivacySettings {
  showOnline: boolean;
  readReceipts: boolean;
}

// WhatsApp defaults: both ON until a student turns them off.
export const DEFAULT_PRIVACY: PrivacySettings = {
  showOnline: true,
  readReceipts: true,
};

interface PrivacyRow {
  account_id: string;
  show_online: boolean | null;
  read_receipts: boolean | null;
}

function toPrivacy(row: PrivacyRow | undefined): PrivacySettings {
  if (!row) return DEFAULT_PRIVACY;
  return {
    showOnline: row.show_online !== false,
    readReceipts: row.read_receipts !== false,
  };
}

export async function getPrivacySettings(
  admin: SupabaseClient,
  accountId: string,
): Promise<PrivacySettings> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("account_id, show_online, read_receipts")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) return DEFAULT_PRIVACY;
    return toPrivacy((data ?? undefined) as PrivacyRow | undefined);
  } catch {
    return DEFAULT_PRIVACY;
  }
}

// Privacy switches for a set of accounts; ids with no readable row get
// the defaults (visible), matching WhatsApp's out-of-box behaviour.
export async function getPrivacyMap(
  admin: SupabaseClient,
  accountIds: ReadonlyArray<string>,
): Promise<Map<string, PrivacySettings>> {
  const result = new Map<string, PrivacySettings>();
  accountIds.forEach((id) => result.set(id, DEFAULT_PRIVACY));
  if (accountIds.length === 0) return result;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("account_id, show_online, read_receipts")
      .in("account_id", [...accountIds]);
    if (error) return result;
    ((data ?? []) as PrivacyRow[]).forEach((row) => {
      result.set(row.account_id, toPrivacy(row));
    });
  } catch {
    // Fail soft — defaults already in place.
  }
  return result;
}
