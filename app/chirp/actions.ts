"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, type AccountRow } from "@/lib/auth/account";
import {
  listChirpComments,
  listChirps,
  type ChirpCommentView,
  type ChirpView,
} from "@/lib/chirp";
import {
  getNewsCached,
  getWeatherCached,
  NEWS_CATEGORIES,
  resolveRegionForAccount,
  type NewsCategory,
  type NewsItem,
  type WeatherView,
} from "@/lib/news";

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

// The service-role client the feed's developer masking resolves
// through (see lib/chirp.ts). Fail-soft: null leaves the feed unmasked
// rather than breaking it.
function tryAdmin(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export async function fetchChirpsAction(): Promise<ChirpView[]> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  return listChirps(ctx.supabase, ctx.account.id, 50, tryAdmin());
}

export async function fetchChirpCommentsAction(
  chirpId: string,
): Promise<ChirpCommentView[]> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  return listChirpComments(ctx.supabase, chirpId, ctx.account.id, tryAdmin());
}

// ── Live news + weather (the "Live" block above the feed) ───────────
// The region is always resolved server-side from the signed-in
// account's college — the client only names a category, never a place.

export async function getNewsAction(category: string): Promise<NewsItem[]> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  const cat: NewsCategory = (NEWS_CATEGORIES as string[]).includes(category)
    ? (category as NewsCategory)
    : "top";
  const region = await resolveRegionForAccount(ctx.supabase, ctx.account);
  return getNewsCached(cat, region);
}

export async function getWeatherAction(): Promise<WeatherView | null> {
  const ctx = await requireCtx();
  if (!ctx) return null;
  const region = await resolveRegionForAccount(ctx.supabase, ctx.account);
  return getWeatherCached(region);
}

// ── Scheduled chirps (migration 0014) ───────────────────────────────
// Write a chirp now, post it later: the row waits in scheduled_chirps
// and the database's own pg_cron job copies it into chirps when the
// time comes (post_due_scheduled_chirps). All three actions run on
// the SESSION client — RLS confines every row to its author.

export interface ScheduledChirpView {
  id: string;
  body: string | null;
  imageUrl: string | null;
  scheduledFor: string;
}

export async function scheduleChirpAction(
  body: string,
  imageUrl: string | null,
  scheduledForIso: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const text = body.trim().slice(0, 500);
  if (!text && !imageUrl) {
    return { error: "Write something or attach a photo first." };
  }
  const when = new Date(scheduledForIso);
  if (Number.isNaN(when.getTime())) {
    return { error: "Pick a valid date and time." };
  }
  if (when.getTime() < Date.now() + 60_000) {
    return { error: "Pick a time at least a minute from now." };
  }
  if (when.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return { error: "That's too far ahead — schedule within a year." };
  }
  const { error } = await ctx.supabase.from("scheduled_chirps").insert({
    account_id: ctx.account.id,
    body: text || null,
    image_url: imageUrl,
    scheduled_for: when.toISOString(),
  });
  if (error) {
    return { error: "That chirp didn't schedule — please try again." };
  }
  return { error: null };
}

export async function listMyScheduledChirpsAction(): Promise<
  ScheduledChirpView[]
> {
  const ctx = await requireCtx();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("scheduled_chirps")
    .select("id, body, image_url, scheduled_for")
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true });
  return (
    (data ?? []) as {
      id: string;
      body: string | null;
      image_url: string | null;
      scheduled_for: string;
    }[]
  ).map((row) => ({
    id: row.id,
    body: row.body,
    imageUrl: row.image_url,
    scheduledFor: row.scheduled_for,
  }));
}

export async function cancelScheduledChirpAction(
  scheduledId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { error } = await ctx.supabase
    .from("scheduled_chirps")
    .update({ status: "cancelled" })
    .eq("id", scheduledId)
    .eq("status", "pending");
  if (error) return { error: "Couldn't cancel that one — please try again." };
  return { error: null };
}
