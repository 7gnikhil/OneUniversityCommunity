import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getPublicProfileByUsername } from "@/lib/social";
import { listFollowers, listFollowing } from "@/lib/follows";
import { isOwnerEmail } from "@/lib/server/owner";
import Avatar from "@/components/Avatar";
import type { PublicProfile } from "@/lib/types";

// Followers / Following list (2026-11-17, Instagram-style profile):
// the accepted follow graph for one student, newest first. Shared
// by the two routes under /profile/[username]/. The developer's
// lists are never shown (developer anonymity — the masked profile
// carries no graph), and the developer renders masked inside other
// people's lists like everywhere else.
export default async function FollowList({
  username,
  side,
}: {
  username: string;
  side: "followers" | "following";
}) {
  const supabase = await createClient();
  const profile = await getPublicProfileByUsername(supabase, username);
  if (!profile) notFound();

  let people: PublicProfile[] = [];
  let isDeveloperProfile = false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("email")
      .eq("id", profile.accountId)
      .maybeSingle();
    const email = ((data ?? null) as { email: string } | null)?.email ?? null;
    isDeveloperProfile = isOwnerEmail(email);
    if (!isDeveloperProfile) {
      people =
        side === "followers"
          ? await listFollowers(admin, profile.accountId)
          : await listFollowing(admin, profile.accountId);
    }
  } catch {
    people = [];
  }

  const title = side === "followers" ? "Followers" : "Following";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/profile/${username}`}
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← @{username}
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {title}
        </p>
      </div>

      {isDeveloperProfile ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          🔒 The OneUCo Developer&apos;s profile stays private — including
          who follows them.
        </p>
      ) : people.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          {side === "followers"
            ? `@${username} has no followers yet — accepted follows will appear here.`
            : `@${username} isn't following anyone yet — accepted follows will appear here.`}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-900 rounded-3xl border border-neutral-800 bg-neutral-950 px-4">
          {people.map((person) => {
            const name = person.name.trim()
              ? person.name
              : `@${person.username}`;
            const row = (
              <>
                <Avatar
                  name={name}
                  photoUrl={person.photoUrl}
                  developer={person.developer}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {person.developer ? "OneUCo Developer" : name}
                  </span>
                  <span className="truncate text-xs text-neutral-500">
                    {person.developer
                      ? "The developer stays anonymous"
                      : `@${person.username}${person.branch ? ` · ${person.branch}` : ""}`}
                  </span>
                </span>
              </>
            );
            return (
              <li key={person.accountId}>
                {person.developer ? (
                  <div className="flex items-center gap-3 py-3">{row}</div>
                ) : (
                  <Link
                    href={`/profile/${person.username}`}
                    className="flex items-center gap-3 py-3 transition hover:opacity-80"
                  >
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
