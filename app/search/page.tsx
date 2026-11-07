import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import {
  getPublicProfilesByIds,
  toPublicProfile,
  type PublicProfileRow,
} from "@/lib/social";
import { getProfileByAccountId } from "@/lib/profile";
import type { FollowUiState } from "@/app/follow/actions";
import FollowButton from "@/components/FollowButton";
import { accentHex } from "@/lib/validation";
import type { PublicProfile } from "@/lib/types";

// Student search: OneUco ID is an EXACT lookup; @username is a partial
// (substring) match. Results come only from the public_profiles
// projection — the OneUco-ID step resolves an account id through the
// service role and then reads the SAME public projection, so a search can
// never surface private fields. Students in a block relation with me
// (either direction) are invisible, exactly as in the deck.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  let results: PublicProfile[] = [];
  let followStates = new Map<string, FollowUiState>();
  let viewerAccent = accentHex(null);
  let searched = false;
  if (account && query) {
    searched = true;
    try {
      const admin = createAdminClient();
      const found = new Map<string, PublicProfile>();

      // Blocked-in-either-direction set (admin read: the other party's
      // block of me is invisible to my session client by design).
      const { data: blockData } = await admin
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${account.id},blocked_id.eq.${account.id}`);
      const hidden = new Set<string>();
      ((blockData ?? []) as Array<{ blocker_id: string; blocked_id: string }>).forEach(
        (row) => {
          hidden.add(row.blocker_id === account.id ? row.blocked_id : row.blocker_id);
        },
      );

      const cleaned = query.replace(/^@+/, "");
      const looksLikeOneucoId = /^uc[a-z0-9]{6}$/i.test(cleaned);
      if (looksLikeOneucoId) {
        // Exact OneUco ID.
        const { data } = await admin
          .from("accounts")
          .select("id")
          .eq("oneuco_id", cleaned.toUpperCase())
          .maybeSingle();
        const hit = (data ?? null) as { id: string } | null;
        if (hit && hit.id !== account.id && !hidden.has(hit.id)) {
          const profiles = await getPublicProfilesByIds(admin, [hit.id]);
          const profile = profiles.get(hit.id);
          if (profile) found.set(profile.accountId, profile);
        }
      } else if (cleaned.length >= 2) {
        // Partial username match on the public projection.
        const { data } = await supabase
          .from("public_profiles")
          .select("account_id, username, name, bio, branch, photo_url")
          .ilike("username", `%${cleaned.toLowerCase()}%`)
          .limit(20);
        ((data ?? []) as PublicProfileRow[]).forEach((row) => {
          if (row.account_id === account.id || hidden.has(row.account_id)) return;
          found.set(row.account_id, toPublicProfile(row));
        });
      }
      results = [...found.values()];

      // Follow state per result (batched; follow_requests is
      // service-role only). friends = matched or an accepted follow;
      // requested = my pending ask; anything else = follow.
      if (results.length > 0) {
        const me = account;
        const myProfile = await getProfileByAccountId(supabase, me.id);
        viewerAccent = accentHex(myProfile?.accent_color);
        const ids = results.map((profile) => profile.accountId);
        const [matchData, outData, inData] = await Promise.all([
          admin
            .from("matches")
            .select("account_a, account_b")
            .or(
              `and(account_a.eq.${me.id},account_b.in.(${ids.join(",")})),and(account_b.eq.${me.id},account_a.in.(${ids.join(",")}))`,
            ),
          admin
            .from("follow_requests")
            .select("target_id, status")
            .eq("requester_id", me.id)
            .in("target_id", ids),
          admin
            .from("follow_requests")
            .select("requester_id, status")
            .eq("target_id", me.id)
            .in("requester_id", ids),
        ]);
        const friendIds = new Set<string>();
        ((matchData.data ?? []) as Array<{ account_a: string; account_b: string }>).forEach(
          (row) => friendIds.add(row.account_a === me.id ? row.account_b : row.account_a),
        );
        const requestedIds = new Set<string>();
        ((outData.data ?? []) as Array<{ target_id: string; status: string }>).forEach(
          (row) => {
            if (row.status === "accepted") friendIds.add(row.target_id);
            if (row.status === "pending") requestedIds.add(row.target_id);
          },
        );
        ((inData.data ?? []) as Array<{ requester_id: string; status: string }>).forEach(
          (row) => {
            if (row.status === "accepted") friendIds.add(row.requester_id);
          },
        );
        const resolved = new Map<string, FollowUiState>();
        ids.forEach((id) => {
          resolved.set(
            id,
            friendIds.has(id) ? "friends" : requestedIds.has(id) ? "requested" : "follow",
          );
        });
        followStates = resolved;
      }
    } catch {
      results = [];
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Search
        </p>
      </div>

      <form action="/search" method="get" className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search @username or OneUco ID"
          maxLength={40}
          className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Search
        </button>
      </form>

      {searched && results.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Nobody matched that — try a @username, or the exact OneUco ID
          (like UCXXXXXX).
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-neutral-900">
        {results.map((profile) => (
          <li key={profile.accountId} className="flex items-center gap-2">
            <Link
              href={`/profile/${profile.username}`}
              className="flex min-w-0 flex-1 items-center gap-3 py-3 transition hover:bg-neutral-950"
            >
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-base font-semibold text-neutral-400">
                  {profile.name.charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{profile.name}</span>
                <span className="block truncate text-xs text-neutral-500">
                  @{profile.username}
                  {profile.branch ? ` · ${profile.branch}` : ""}
                </span>
              </span>
            </Link>
            {followStates.has(profile.accountId) ? (
              <span className="shrink-0">
                <FollowButton
                  targetAccountId={profile.accountId}
                  initialState={followStates.get(profile.accountId) as FollowUiState}
                  accentHex={viewerAccent}
                  small
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
