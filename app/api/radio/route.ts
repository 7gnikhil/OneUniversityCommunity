import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RadioTrack } from "@/components/RadioPlayer";

// Music Mitra data proxy (2026-11-14 — the Radio feature merged
// with the owner's MusicMitra and upgraded). One route, five
// modes via ?type=:
//   songs (default)  JioSaavn song search, paged. Results are
//                    RE-RANKED by play count before returning:
//                    the upstream order buries originals under
//                    remixes/covers (verified live: "Perfect Ed
//                    Sheeran" topped by a techno remix), and the
//                    most-played version is the one people mean.
//   albums/playlists JioSaavn collection search.
//   albumSongs /     a collection's tracks, playable.
//   playlistSongs
//   lyrics           LRCLIB (free, no key) SYNCED lyrics for
//                    karaoke — /api/get first, /api/search as
//                    fallback; plain lyrics when no sync exists.
//   audius           Audius (free, no key) full-length streams
//                    from independent artists — the second shelf
//                    the client shows when JioSaavn runs thin.
// Signed-in students only; everything normalised server-side.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAAVN = "https://saavn.sumit.co/api";
const LRCLIB = "https://lrclib.net/api";
const AUDIUS = "https://discoveryprovider.audius.co/v1";

interface RawImage {
  quality: string;
  url: string;
}
interface RawSong {
  id: string;
  name: string;
  duration: number | string | null;
  playCount?: number | string | null;
  url?: string;
  image?: RawImage[];
  downloadUrl?: RawImage[];
  artists?: { primary?: Array<{ name: string }> };
}
interface RawCollection {
  id: string;
  name: string;
  year?: number | string | null;
  songCount?: number | null;
  language?: string | null;
  image?: RawImage[];
  artists?: { primary?: Array<{ name: string }> };
}

export interface RadioCollection {
  id: string;
  name: string;
  image: string | null;
  subtitle: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function pickLargest(images: RawImage[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  return images[images.length - 1]?.url ?? null;
}

function artistNames(song: RawSong): string {
  const names = (song.artists?.primary ?? [])
    .map((artist) => decodeEntities(artist.name))
    .filter(Boolean)
    .join(", ");
  return names || "Unknown artist";
}

function normalizeSong(song: RawSong): RadioTrack | null {
  const streamUrl = pickLargest(song.downloadUrl);
  if (!streamUrl) return null;
  return {
    id: `js:${song.id}`,
    title: decodeEntities(song.name ?? "Untitled"),
    artists: artistNames(song),
    image: pickLargest(song.image),
    duration:
      typeof song.duration === "number"
        ? song.duration
        : Number(song.duration ?? 0) || 0,
    streamUrl,
    plays: Number(song.playCount ?? 0) || 0,
    songUrl: song.url ?? null,
    source: "jiosaavn",
  };
}

function normalizeCollection(raw: RawCollection): RadioCollection {
  const bits: string[] = [];
  if (raw.year) bits.push(String(raw.year));
  if (typeof raw.songCount === "number") bits.push(`${raw.songCount} songs`);
  const lead = raw.artists?.primary?.[0]?.name;
  if (lead) bits.push(decodeEntities(lead));
  if (raw.language) bits.push(raw.language);
  return {
    id: raw.id,
    name: decodeEntities(raw.name ?? "Untitled"),
    image: pickLargest(raw.image),
    subtitle: bits.join(" · ") || "Collection",
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "OneUco-MusicMitra/1.0" },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as T;
}

interface LrcLine {
  t: number;
  text: string;
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (!match) continue;
    const t = Number(match[1]) * 60 + Number(match[2]);
    lines.push({ t, text: match[3].trim() });
  }
  return lines.sort((a, b) => a.t - b.t);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const params = new URL(req.url).searchParams;
  const type = params.get("type") ?? "songs";
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const search = query.length > 0 ? query : "trending hits";
  const pageRaw = Number(params.get("page") ?? "1");
  const page = Number.isFinite(pageRaw)
    ? Math.min(Math.max(Math.floor(pageRaw), 1), 100)
    : 1;

  try {
    if (type === "songs") {
      const json = await fetchJson<{
        data?: { results?: RawSong[]; total?: number };
      }>(
        `${SAAVN}/search/songs?query=${encodeURIComponent(search)}&limit=24&page=${page}`,
      );
      const tracks = (json.data?.results ?? [])
        .map(normalizeSong)
        .filter((track): track is RadioTrack => track !== null)
        .sort((a, b) => b.plays - a.plays);
      return NextResponse.json({ tracks, total: json.data?.total ?? 0 });
    }

    if (type === "albums" || type === "playlists") {
      const json = await fetchJson<{
        data?: { results?: RawCollection[]; total?: number };
      }>(
        `${SAAVN}/search/${type}?query=${encodeURIComponent(search)}&limit=24&page=${page}`,
      );
      return NextResponse.json({
        collections: (json.data?.results ?? []).map(normalizeCollection),
        total: json.data?.total ?? 0,
      });
    }

    if (type === "albumSongs" || type === "playlistSongs") {
      const id = (params.get("id") ?? "").trim();
      if (!id) return NextResponse.json({ tracks: [], collection: null });
      const endpoint = type === "albumSongs" ? "albums" : "playlists";
      const json = await fetchJson<{
        data?: RawCollection & { songs?: RawSong[] };
      }>(`${SAAVN}/${endpoint}?id=${encodeURIComponent(id)}&limit=100`);
      const data = json.data;
      const tracks = (data?.songs ?? [])
        .map(normalizeSong)
        .filter((track): track is RadioTrack => track !== null);
      return NextResponse.json({
        tracks,
        collection: data ? normalizeCollection(data) : null,
      });
    }

    if (type === "lyrics") {
      const track = (params.get("track") ?? "").trim().slice(0, 120);
      const artist = (params.get("artist") ?? "").trim().slice(0, 120);
      if (!track) return NextResponse.json({ lines: [], synced: false });
      interface LrcResult {
        syncedLyrics?: string | null;
        plainLyrics?: string | null;
      }
      let result: LrcResult | null = null;
      try {
        result = await fetchJson<LrcResult>(
          `${LRCLIB}/get?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`,
        );
      } catch {
        result = null;
      }
      if (!result?.syncedLyrics && !result?.plainLyrics) {
        const found = await fetchJson<LrcResult[]>(
          `${LRCLIB}/search?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`,
        ).catch(() => [] as LrcResult[]);
        result =
          found.find((item) => item.syncedLyrics) ?? found[0] ?? null;
      }
      if (result?.syncedLyrics) {
        return NextResponse.json({
          lines: parseLrc(result.syncedLyrics),
          synced: true,
        });
      }
      if (result?.plainLyrics) {
        const lines = result.plainLyrics
          .split("\n")
          .map((text) => ({ t: -1, text: text.trim() }));
        return NextResponse.json({ lines, synced: false });
      }
      return NextResponse.json({ lines: [], synced: false });
    }

    if (type === "audius") {
      interface AudiusTrack {
        id: string;
        title: string;
        duration: number;
        permalink: string;
        artwork?: { "480x480"?: string };
        user?: { name: string };
      }
      const json = await fetchJson<{ data?: AudiusTrack[] }>(
        `${AUDIUS}/tracks/search?query=${encodeURIComponent(search)}&app_name=OneUco&limit=12`,
      );
      const tracks: RadioTrack[] = (json.data ?? []).map((track) => ({
        id: `au:${track.id}`,
        title: track.title,
        artists: track.user?.name ?? "Independent artist",
        image: track.artwork?.["480x480"] ?? null,
        duration: track.duration ?? 0,
        streamUrl: `${AUDIUS}/tracks/${track.id}/stream?app_name=OneUco`,
        plays: 0,
        songUrl: `https://audius.co${track.permalink}`,
        source: "audius" as const,
      }));
      return NextResponse.json({ tracks, total: tracks.length });
    }

    return NextResponse.json({ error: "Unknown type." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Music Mitra is having a moment — try again." },
      { status: 502 },
    );
  }
}
