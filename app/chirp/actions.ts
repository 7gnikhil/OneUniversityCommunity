"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, type AccountRow } from "@/lib/auth/account";
import {
  listChirpComments,
  listChirps,
  type ChirpCommentView,
  type ChirpView,
} from "@/lib/chirp";

// Chirp actions. Posting/deleting/liking/commenting run on the SESSION
// client — RLS covers all of them (own rows only; admins may delete any
// chirp). The denormalised counts on the chirps row are recounted from
// the source tables through the service role, because a liker cannot
// UPDATE someone else's chirp row under RLS.

interface Ctx {
  account: AccountRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

async function requireCtx(): Promise<Ctx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  return { account, supabase };
}

async function recount(
  chirpId: string,
  column: "like_count" | "comment_count",
  table: "chirp_likes" | "chirp_comments",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from(table)
      .select("chirp_id", { count: "exact", head: true })
      .eq("chirp_id", chirpId);
    await admin
      .from("chirps")
      .update({ [column]: count ?? 0 })
      .eq("id", chirpId);
  } catch {
    // Counts are a display nicety; the source rows are already saved.
  }
}

export async function createChirpAction(
  body: string,
  imageUrl: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const text = body.trim().slice(0, 500);
  if (!text && !imageUrl) return { error: "Write something or attach a photo first." };
  const { error } = await ctx.supabase.from("chirps").insert({
    author_id: ctx.account.id,
    body: text || null,
    image_url: imageUrl,
  });
  if (error) return { error: "That chirp didn't post — please try again." };
  return { error: null };
}

export async function deleteChirpAction(
  chirpId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { error } = await ctx.supabase.from("chirps").delete().eq("id", chirpId);
  if (error) return { error: "Couldn't delete that chirp." };
  return { error: null };
}

export async function toggleChirpLikeAction(
  chirpId: string,
): Promise<{ error: string | null; liked: boolean }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", liked: false };
  const { data } = await ctx.supabase
    .from("chirp_likes")
    .select("chirp_id")
    .eq("chirp_id", chirpId)
    .eq("account_id", ctx.account.id)
    .maybeSingle();
  if (data) {
    const { error } = await ctx.supabase
      .from("chirp_likes")
      .delete()
      .eq("chirp_id", chirpId)
      .eq("account_id", ctx.account.id);
    if (error) return { error: "Couldn't unlike — please try again.", liked: true };
    await recount(chirpId, "like_count", "chirp_likes");
    return { error: null, liked: false };
  }
  const { error } = await ctx.supabase.from("chirp_likes").insert({
    chirp_id: chirpId,
    account_id: ctx.account.id,
  });
  if (error) return { error: "Couldn't like — please try again.", liked: false };
  await recount(chirpId, "like_count", "chirp_likes");
  return { error: null, liked: true };
}

export async function addChirpCommentAction(
  chirpId: string,
  body: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const text = body.trim().slice(0, 500);
  if (!text) return { error: "Write a comment first." };
  const { error } = await ctx.supabase.from("chirp_comments").insert({
    chirp_id: chirpId,
    author_id: ctx.account.id,
    body: text,
  });
  if (error) return { error: "That comment didn't post — please try again." };
  await recount(chirpId, "comment_count", "chirp_comments");
  return { error: null };
}

export async function fetchChirpsAction(): Promise<ChirpView[]> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  return listChirps(ctx.supabase, ctx.account.id, 50);
}

export async function fetchChirpCommentsAction(
  chirpId: string,
): Promise<ChirpCommentView[]> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  return listChirpComments(ctx.supabase, chirpId, ctx.account.id);
}
