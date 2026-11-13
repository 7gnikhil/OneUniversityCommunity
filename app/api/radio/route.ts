import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RadioTrack } from "@/components/RadioPlayer";

// Music Mitra data proxy (2026-11-14 — the Radio feature merged
// with the owner's MusicMitra and upgraded). One route, modes via
// ?type=:
//   songs (default)  song search, paged, RE-RANKED by play count
//                    (the upstream order buries originals under
//                    remixes/covers; the most-played version is
//                    the one people mean).
//   albums/playlists collection search.
//   albumSongs /     a collection's tracks, playable.
//   playlistSongs
//   lyrics           LRCLIB (free, no key) SYNCED lyrics for
//                    karaoke — /api/get first, /api/search as
//                    fallback; plain lyrics when no sync exists.
//   audius           Audius (free, no key) full-length streams
//                    from independent artists.
//   karaoke          start/status passthrough to the self-hosted
//                    karaoke service (KARAOKE_SERVICE_URL).
//
// SOURCES, in order (2026-11-14 night): the songs/albums modes
// call JioSaavn's api.php DIRECTLY — including the DES decryption
// of the stream URLs, done in pure JS because Node's OpenSSL 3
// refuses des-ecb. The public wrapper instance (saavn.sumit.co)
// is only the fallback: it hit Cloudflare's 1027 rate limit that
// night and the whole section went dark, which is exactly the
// shared-instance risk of building on someone else's deployment.
// If both Saavn routes fail, songs fall back to Audius so the
// section never sits empty. Signed-in students only; everything
// normalised server-side.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAAVN = "https://saavn.sumit.co/api";
const SAAVN_DIRECT = "https://www.jiosaavn.com/api.php";
const LRCLIB = "https://lrclib.net/api";
const AUDIUS = "https://discoveryprovider.audius.co/v1";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Pure-JS single-DES (ECB) decryption ─────────────────────────
// FIPS 46-3 tables; verified against real JioSaavn payloads.
// Node's crypto can't do DES under OpenSSL 3, hence this port.
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const DES_SBOX: number[][] = [
[14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
[15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
[10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
[7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
[2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
[12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
[4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
[13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

function desPermute(bits: number[], table: number[]): number[] {
  return table.map((pos) => bits[pos - 1]);
}
function desBytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}
function desBitsToBytes(bits: number[]): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    bytes.push(v);
  }
  return Buffer.from(bytes);
}
function desRoundKeys(keyBytes: Buffer): number[][] {
  const keyBits = desPermute(desBytesToBits(keyBytes), DES_PC1);
  let c = keyBits.slice(0, 28);
  let d = keyBits.slice(28, 56);
  const keys: number[][] = [];
  for (let round = 0; round < 16; round++) {
    const shift = DES_SHIFTS[round];
    c = c.slice(shift).concat(c.slice(0, shift));
    d = d.slice(shift).concat(d.slice(0, shift));
    keys.push(desPermute(c.concat(d), DES_PC2));
  }
  return keys;
}
function desFeistel(right: number[], roundKey: number[]): number[] {
  const expanded = desPermute(right, DES_E);
  const mixed = expanded.map((bit, i) => bit ^ roundKey[i]);
  const substituted: number[] = [];
  for (let box = 0; box < 8; box++) {
    const chunk = mixed.slice(box * 6, box * 6 + 6);
    const row = (chunk[0] << 1) | chunk[5];
    const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
    const value = DES_SBOX[box][row * 16 + col];
    for (let i = 3; i >= 0; i--) substituted.push((value >> i) & 1);
  }
  return desPermute(substituted, DES_P);
}
function desDecryptBlock(block: Uint8Array, keys: number[][]): Buffer {
  const bits = desPermute(desBytesToBits(block), DES_IP);
  let left = bits.slice(0, 32);
  let right = bits.slice(32, 64);
  for (let round = 15; round >= 0; round--) {
    const f = desFeistel(right, keys[round]);
    const next = left.map((bit, i) => bit ^ f[i]);
    left = right;
    right = next;
  }
  return desBitsToBytes(desPermute(right.concat(left), DES_FP));
}
function desDecryptEcb(cipher: Buffer, keyString: string): string {
  const keys = desRoundKeys(Buffer.from(keyString, "utf8"));
  const parts: Buffer[] = [];
  for (let offset = 0; offset < cipher.length; offset += 8) {
    parts.push(desDecryptBlock(cipher.subarray(offset, offset + 8), keys));
  }
  const joined = Buffer.concat(parts);
  const pad = joined[joined.length - 1];
  return joined.subarray(0, joined.length - pad).toString("utf8");
}

// ── Shared helpers ──────────────────────────────────────────────

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

function normalizeSong(song: RawSong): RadioTrack | null {
  const streamUrl = pickLargest(song.downloadUrl);
  if (!streamUrl) return null;
  const names = (song.artists?.primary ?? [])
    .map((artist) => decodeEntities(artist.name))
    .filter(Boolean)
    .join(", ");
  return {
    id: `js:${song.id}`,
    title: decodeEntities(song.name ?? "Untitled"),
    artists: names || "Unknown artist",
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

// ── Direct JioSaavn (api.php) ───────────────────────────────────

interface DirectSong {
  id: string;
  title?: string;
  image?: string;
  perma_url?: string;
  play_count?: number | string;
  more_info?: {
    duration?: number | string;
    encrypted_media_url?: string;
    "320kbps"?: boolean | string;
    artistMap?: { primary_artists?: Array<{ name: string }> };
  };
}
interface DirectCollection {
  id: string;
  title?: string;
  image?: string;
  subtitle?: string;
  numsongs?: number | string;
  list_count?: number | string;
  more_info?: {
    music?: string;
    year?: number | string;
    language?: string;
    firstname?: string;
    song_count?: number | string;
  };
}

async function saavnDirect<T>(
  call: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(SAAVN_DIRECT);
  url.searchParams.set("__call", call);
  url.searchParams.set("_format", "json");
  url.searchParams.set("_marker", "0");
  url.searchParams.set("api_version", "4");
  url.searchParams.set("ctx", "web6dot0");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`jiosaavn ${res.status}`);
  return (await res.json()) as T;
}

function bigImage(image: string | undefined): string | null {
  if (!image) return null;
  return image.replace(/150x150|50x50/, "500x500");
}

function normalizeDirectSong(raw: DirectSong): RadioTrack | null {
  const enc = raw.more_info?.encrypted_media_url;
  if (!enc) return null;
  let base: string;
  try {
    base = desDecryptEcb(Buffer.from(enc, "base64"), "38346591");
  } catch {
    return null;
  }
  const high =
    raw.more_info?.["320kbps"] === true ||
    raw.more_info?.["320kbps"] === "true";
  const streamUrl = base.replace("_96", high ? "_320" : "_160");
  const names = (raw.more_info?.artistMap?.primary_artists ?? [])
    .map((artist) => decodeEntities(artist.name))
    .filter(Boolean)
    .join(", ");
  return {
    id: `js:${raw.id}`,
    title: decodeEntities(raw.title ?? "Untitled"),
    artists: names || "Unknown artist",
    image: bigImage(raw.image),
    duration: Number(raw.more_info?.duration ?? 0) || 0,
    streamUrl,
    plays: Number(raw.play_count ?? 0) || 0,
    songUrl: raw.perma_url ?? null,
    source: "jiosaavn",
  };
}

function normalizeDirectCollection(
  raw: DirectCollection,
): RadioCollection {
  const bits: string[] = [];
  const info = raw.more_info ?? {};
  if (info.year) bits.push(String(info.year));
  const count = raw.numsongs ?? raw.list_count ?? info.song_count;
  if (count) bits.push(`${count} songs`);
  if (info.music) bits.push(decodeEntities(info.music));
  if (info.firstname) bits.push(decodeEntities(info.firstname));
  if (info.language) bits.push(info.language);
  return {
    id: raw.id,
    name: decodeEntities(raw.title ?? "Untitled"),
    image: bigImage(raw.image),
    subtitle: bits.join(" · ") || raw.subtitle || "Collection",
  };
}

async function directSongs(
  search: string,
  page: number,
): Promise<{ tracks: RadioTrack[]; total: number }> {
  const json = await saavnDirect<{ results?: DirectSong[]; total?: number }>(
    "search.getResults",
    { q: search, n: "24", p: String(page) },
  );
  const tracks = (json.results ?? [])
    .map(normalizeDirectSong)
    .filter((track): track is RadioTrack => track !== null)
    .sort((a, b) => b.plays - a.plays);
  return { tracks, total: json.total ?? 0 };
}

async function wrapperSongs(
  search: string,
  page: number,
): Promise<{ tracks: RadioTrack[]; total: number }> {
  const json = await fetchJson<{
    data?: { results?: RawSong[]; total?: number };
  }>(
    `${SAAVN}/search/songs?query=${encodeURIComponent(search)}&limit=24&page=${page}`,
  );
  const tracks = (json.data?.results ?? [])
    .map(normalizeSong)
    .filter((track): track is RadioTrack => track !== null)
    .sort((a, b) => b.plays - a.plays);
  return { tracks, total: json.data?.total ?? 0 };
}

async function audiusTracks(search: string): Promise<RadioTrack[]> {
  interface AudiusTrack {
    id: string;
    title: string;
    duration: number;
    permalink: string;
    artwork?: { "480x480"?: string };
    user?: { name: string };
  }
  const json = await fetchJson<{ data?: AudiusTrack[] }>(
    `${AUDIUS}/tracks/search?query=${encodeURIComponent(search)}&app_name=OneUco&limit=16`,
  );
  return (json.data ?? []).map((track) => ({
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
      try {
        return NextResponse.json(await directSongs(search, page));
      } catch {
        try {
          return NextResponse.json(await wrapperSongs(search, page));
        } catch {
          const tracks = await audiusTracks(search);
          return NextResponse.json({
            tracks,
            total: tracks.length,
            fallback: "audius",
          });
        }
      }
    }

    if (type === "albums" || type === "playlists") {
      const call =
        type === "albums"
          ? "search.getAlbumResults"
          : "search.getPlaylistResults";
      try {
        const json = await saavnDirect<{
          results?: DirectCollection[];
          total?: number;
        }>(call, { q: search, n: "24", p: String(page) });
        return NextResponse.json({
          collections: (json.results ?? []).map(normalizeDirectCollection),
          total: json.total ?? 0,
        });
      } catch {
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
    }

    if (type === "albumSongs" || type === "playlistSongs") {
      const id = (params.get("id") ?? "").trim();
      if (!id) return NextResponse.json({ tracks: [], collection: null });
      try {
        const json = await saavnDirect<
          DirectCollection & { list?: DirectSong[] }
        >(
          type === "albumSongs" ? "content.getAlbumDetails" : "playlist.getDetails",
          type === "albumSongs" ? { albumid: id } : { listid: id },
        );
        const tracks = (json.list ?? [])
          .map(normalizeDirectSong)
          .filter((track): track is RadioTrack => track !== null);
        return NextResponse.json({
          tracks,
          collection: normalizeDirectCollection(json),
        });
      } catch {
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
      const tracks = await audiusTracks(search);
      return NextResponse.json({ tracks, total: tracks.length });
    }

    if (type === "karaoke") {
      // The Music Mitra karaoke service (karaoke-service/ in this
      // repo — Demucs instrumental + Whisper lyrics, cached per
      // song). Unconfigured until KARAOKE_SERVICE_URL is set in
      // Vercel; the client then keeps the LRCLIB-only karaoke.
      const service = (process.env.KARAOKE_SERVICE_URL ?? "").replace(
        /\/$/,
        "",
      );
      if (!service) return NextResponse.json({ status: "unavailable" });
      const songId = (params.get("id") ?? "").trim();
      if (!songId) return NextResponse.json({ status: "unavailable" });
      const action = params.get("action") ?? "status";
      try {
        if (action === "start") {
          const res = await fetch(`${service}/karaoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              song_id: songId,
              audio_url: params.get("audio") ?? "",
              title: params.get("title") ?? "",
              artist: params.get("artist") ?? "",
            }),
            cache: "no-store",
          });
          return NextResponse.json(await res.json());
        }
        const res = await fetch(
          `${service}/karaoke/${encodeURIComponent(songId)}`,
          { cache: "no-store" },
        );
        return NextResponse.json(await res.json());
      } catch {
        return NextResponse.json({ status: "unavailable" });
      }
    }

    return NextResponse.json({ error: "Unknown type." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Music Mitra is having a moment — try again." },
      { status: 502 },
    );
  }
}
