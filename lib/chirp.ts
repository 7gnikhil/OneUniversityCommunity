// Chirp data layer. Identities are NORMAL here (unlike Maya Jwalam):
// authors appear with their public profile (public_profiles projection
// via lib/social.ts) — with ONE exception: the developer's author entry
// is swapped for the masked "OneUCo Developer" projection before it
// leaves the server (developer anonymity rule; see lib/social.ts
// maskDeveloperProfiles). That needs the service-role client to resolve
// the developer's account id from the owner email, so callers pass an
// admin client when they have one; without it the feed renders
// unmasked rather than breaking (fail-soft, same as the profile page).
// Counts on the chirps row (like_count/comment_count/
// view_count) are denormalised; the source tables (chirp_likes,
// chirp_comments) are authoritative and the actions recount into the row.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicProfile } from "@/lib/types";
import { getPublicProfilesByIds, maskDeveloperProfiles } from "@/lib/social";
import { getDeveloperAccountId } from "@/lib/server/owner";

export interface ChirpRow {
  id: string;
  author_id: string;
  body: string | null;
  image_url: string | null;
  repost_of_id: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  repost_count: number;
  created_at: string;
}

export interface ChirpView {
  id: string;
  body: string | null;
  imageUrl: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  author: PublicProfile | null;
  mine: boolean;
  likedByMe: boolean;
}

export interface ChirpCommentView {
  id: string;
  body: string;
  createdAt: string;
  author: PublicProfile | null;
  mine: boolean;
}

const CHIRP_COLUMNS =
  "id, author_id, body, image_url, repost_of_id, view_count, like_count, comment_count, repost_count, created_at";

export async function listChirps(
  supabase: SupabaseClient,
  myAccountId: string,
  limit: number,
  admin?: SupabaseClient | null,
): Promise<ChirpView[]> {
  const { data } = await supabase
    .from("chirps")
    .select(CHIRP_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as ChirpRow[];
  if (rows.length === 0) return [];

  const [rawProfiles, likesResult] = await Promise.all([
    getPublicProfilesByIds(
      supabase,
      rows.map((row) => row.author_id),
    ),
    supabase
      .from("chirp_likes")
      .select("chirp_id")
      .eq("account_id", myAccountId)
      .in(
        "chirp_id",
        rows.map((row) => row.id),
      ),
  ]);
  const liked = new Set(
    ((likesResult.data ?? []) as Array<{ chirp_id: string }>).map((row) => row.chirp_id),
  );
  const profiles = maskDeveloperProfiles(
    rawProfiles,
    admin ? await getDeveloperAccountId(admin) : null,
  );

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    viewCount: row.view_count,
    author: profiles.get(row.author_id) ?? null,
    mine: row.author_id === myAccountId,
    likedByMe: liked.has(row.id),
  }));
}

export async function listChirpComments(
  supabase: SupabaseClient,
  chirpId: string,
  myAccountId: string,
  admin?: SupabaseClient | null,
): Promise<ChirpCommentView[]> {
  const { data } = await supabase
    .from("chirp_comments")
    .select("id, chirp_id, author_id, body, created_at")
    .eq("chirp_id", chirpId)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (data ?? []) as Array<{
    id: string;
    author_id: string;
    body: string;
    created_at: string;
  }>;
  const rawProfiles = await getPublicProfilesByIds(
    supabase,
    rows.map((row) => row.author_id),
  );
  const profiles = maskDeveloperProfiles(
    rawProfiles,
    admin ? await getDeveloperAccountId(admin) : null,
  );
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: profiles.get(row.author_id) ?? null,
    mine: row.author_id === myAccountId,
  }));
}
