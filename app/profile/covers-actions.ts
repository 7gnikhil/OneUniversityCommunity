"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";

// Profile covers — write side (2026-11-14, Music Mitra merge).
// The audio file itself is uploaded by the browser straight to
// the `covers` storage bucket (owner-folder policy, migration
// 0017); these actions own the ROWS: creating a cover (only for
// audio URLs inside the caller's own bucket folder), liking /
// unliking, and deleting. All row writes go through the SESSION
// client so the RLS policies are the enforcement, not just code.

async function requireAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  return { supabase, account };
}

export async function createCoverAction(input: {
  title: string;
  songTitle: string | null;
  songArtist: string | null;
  audioUrl: string;
  durationSeconds: number | null;
}): Promise<{ error: string | null }> {
  const ctx = await requireAccount();
  if (!ctx) return { error: "Please sign in again." };

  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give your cover a title first." };

  // The audio must live in the caller's own covers folder —
  // anything else isn't theirs to publish.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ownPrefix = `${supabaseUrl}/storage/v1/object/public/covers/${ctx.account.id}/`;
  if (!input.audioUrl.startsWith(ownPrefix)) {
    return { error: "That audio isn't in your uploads — try again." };
  }

  const { error } = await ctx.supabase.from("profile_covers").insert({
    account_id: ctx.account.id,
    title,
    song_title: input.songTitle?.trim().slice(0, 160) || null,
    song_artist: input.songArtist?.trim().slice(0, 160) || null,
    audio_url: input.audioUrl,
    duration_seconds:
      typeof input.durationSeconds === "number" && input.durationSeconds > 0
        ? Math.round(input.durationSeconds)
        : null,
  });
  if (error) {
    return {
      error:
        "Couldn't save the cover — if this keeps happening, the covers setup may still be finishing.",
    };
  }
  return { error: null };
}

export async function toggleCoverLikeAction(
  coverId: string,
): Promise<{ liked: boolean; count: number; error: string | null }> {
  const ctx = await requireAccount();
  if (!ctx) return { liked: false, count: 0, error: "Please sign in again." };

  const { data: existing } = await ctx.supabase
    .from("cover_likes")
    .select("cover_id")
    .eq("cover_id", coverId)
    .eq("account_id", ctx.account.id)
    .maybeSingle();

  if (existing) {
    await ctx.supabase
      .from("cover_likes")
      .delete()
      .eq("cover_id", coverId)
      .eq("account_id", ctx.account.id);
  } else {
    await ctx.supabase
      .from("cover_likes")
      .insert({ cover_id: coverId, account_id: ctx.account.id });
  }

  const { count } = await ctx.supabase
    .from("cover_likes")
    .select("cover_id", { count: "exact", head: true })
    .eq("cover_id", coverId);

  return { liked: !existing, count: count ?? 0, error: null };
}

export async function deleteCoverAction(
  coverId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireAccount();
  if (!ctx) return { error: "Please sign in again." };

  const { data: cover } = await ctx.supabase
    .from("profile_covers")
    .select("audio_url")
    .eq("id", coverId)
    .eq("account_id", ctx.account.id)
    .maybeSingle();
  if (!cover) return { error: "That cover isn't yours to delete." };

  const { error } = await ctx.supabase
    .from("profile_covers")
    .delete()
    .eq("id", coverId)
    .eq("account_id", ctx.account.id);
  if (error) return { error: "Couldn't delete that cover." };

  // Best-effort file cleanup — a leftover file costs storage, a
  // failed row delete costs trust; the row is already gone.
  const marker = "/storage/v1/object/public/covers/";
  const idx = (cover.audio_url as string).indexOf(marker);
  if (idx >= 0) {
    const path = decodeURIComponent(
      (cover.audio_url as string).slice(idx + marker.length),
    );
    await ctx.supabase.storage.from("covers").remove([path]);
  }
  return { error: null };
}
