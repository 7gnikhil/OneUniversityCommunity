import type { SupabaseClient } from "@supabase/supabase-js";

// Profile covers (2026-11-14, Music Mitra merge): a student's own
// vocal/karaoke recordings, showcased on their profile for anyone
// to play and like. Rows live in profile_covers (migration 0017);
// audio files in the public `covers` storage bucket. Every read
// here is fail-soft — before the migration is applied the query
// errors and callers get null, so profiles render exactly as
// before (owner sees a "nearly ready" note instead).

export interface CoverView {
  id: string;
  title: string;
  songTitle: string | null;
  songArtist: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  /** Music Mitra song id for karaoke covers (migration 0020) — the
   * profile player re-fetches the Demucs instrumental for this song
   * and plays it in sync under the voice. Null = voice-only cover. */
  karaokeSongId: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
}

interface CoverRow {
  id: string;
  title: string;
  song_title: string | null;
  song_artist: string | null;
  audio_url: string;
  duration_seconds: number | null;
  karaoke_song_id?: string | null;
  created_at: string;
}

const COVER_COLUMNS =
  "id, title, song_title, song_artist, audio_url, duration_seconds, created_at";
const COVER_COLUMNS_WITH_KARAOKE = `${COVER_COLUMNS}, karaoke_song_id`;

export async function listCoversForProfile(
  client: SupabaseClient,
  profileAccountId: string,
  viewerAccountId: string,
): Promise<CoverView[] | null> {
  try {
    // Prefer the karaoke-aware column set; if migration 0020 has not
    // been applied yet the select errors — retry without the column
    // (covers predate it anyway) instead of hiding every cover.
    const first = await client
      .from("profile_covers")
      .select(COVER_COLUMNS_WITH_KARAOKE)
      .eq("account_id", profileAccountId)
      .order("created_at", { ascending: false })
      .limit(30);
    let data: unknown = first.data;
    let error: unknown = first.error;
    if (first.error) {
      const second = await client
        .from("profile_covers")
        .select(COVER_COLUMNS)
        .eq("account_id", profileAccountId)
        .order("created_at", { ascending: false })
        .limit(30);
      data = second.data;
      error = second.error;
    }
    if (error) return null;
    const rows = (data ?? []) as CoverRow[];
    if (rows.length === 0) return [];

    const { data: likeRows } = await client
      .from("cover_likes")
      .select("cover_id, account_id")
      .in(
        "cover_id",
        rows.map((row) => row.id),
      );
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const like of (likeRows ?? []) as Array<{
      cover_id: string;
      account_id: string;
    }>) {
      counts.set(like.cover_id, (counts.get(like.cover_id) ?? 0) + 1);
      if (like.account_id === viewerAccountId) mine.add(like.cover_id);
    }

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      songTitle: row.song_title,
      songArtist: row.song_artist,
      audioUrl: row.audio_url,
      durationSeconds: row.duration_seconds,
      karaokeSongId: row.karaoke_song_id ?? null,
      createdAt: row.created_at,
      likeCount: counts.get(row.id) ?? 0,
      likedByMe: mine.has(row.id),
      mine: profileAccountId === viewerAccountId,
    }));
  } catch {
    return null;
  }
}
