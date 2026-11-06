import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getPublicProfileByUsername } from "@/lib/social";
import { normaliseUsername } from "@/lib/validation";

// Public profile of another student — read-only. Built ONLY from the
// public_profiles view (photo, name, @username, bio, branch) plus their
// gallery photos from profiles (public fields; profiles_select_public).
// Year, college, hall-ticket number and preferences are never read here —
// they are not public and this page must not become a leak path.
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = normaliseUsername(rawUsername);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  // My own public page is just my profile editor.
  if (account && account.username === username) {
    redirect("/profile");
  }

  const profile = await getPublicProfileByUsername(supabase, username);
  if (!profile) notFound();
  const publicProfile = profile;

  // Gallery photos (public field, not a view column — see lib/social.ts).
  const { data: galleryData } = await supabase
    .from("profiles")
    .select("photo_urls")
    .eq("account_id", publicProfile.accountId)
    .maybeSingle();
  const galleryRow = (galleryData ?? null) as { photo_urls: string[] } | null;
  const gallery: string[] = (galleryRow?.photo_urls ?? []).filter(
    (url) => url && url !== publicProfile.photoUrl,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Profile
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        {publicProfile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicProfile.photoUrl}
            alt={publicProfile.name}
            className="h-28 w-28 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-800 text-4xl font-semibold text-neutral-400">
            {publicProfile.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold">{publicProfile.name}</h1>
          <p className="text-sm text-neutral-500">@{publicProfile.username}</p>
        </div>
        {publicProfile.branch ? (
          <span className="rounded-full border border-neutral-700 px-3 py-0.5 text-xs text-neutral-300">
            {publicProfile.branch}
          </span>
        ) : null}
        {publicProfile.bio ? (
          <p className="max-w-sm text-sm leading-relaxed text-neutral-300">
            {publicProfile.bio}
          </p>
        ) : null}
      </div>

      {gallery.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={`${publicProfile.name}'s photo`}
              className="aspect-square w-full rounded-2xl object-cover"
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}
