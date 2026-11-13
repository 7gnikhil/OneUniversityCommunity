import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RadioTrack } from "@/components/RadioPlayer";

// Radio search proxy (2026-11-13): the client asks here, here asks
// the JioSaavn unofficial API (saavn.sumit.co) and returns a
// small, normalised track list. Server-side on purpose: no CORS
// roulette in the browser, one place to shape/trim the upstream
// payload (the raw song objects are huge), and the stream URL the
// player needs is picked here — the highest quality offered
// (320kbps when present). Signed-in students only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://saavn.sumit.co/api/search/songs";

interface RawImage {
  quality: string;
  url: string;
}
interface RawSong {
  id: string;
  name: string;
  duration: number | string | null;
  image?: RawImage[];
  downloadUrl?: RawImage[];
  artists?: { primary?: Array<{ name: string }> };
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

function normalize(song: RawSong): RadioTrack | null {
  const streamUrl = pickLargest(song.downloadUrl);
  if (!streamUrl) return null;
  const artists = (song.artists?.primary ?? [])
    .map((artist) => decodeEntities(artist.name))
    .filter(Boolean)
    .join(", ");
  return {
    id: song.id,
    title: decodeEntities(song.name ?? "Untitled"),
    artists: artists || "Unknown artist",
    image: pickLargest(song.image),
    duration:
      typeof song.duration === "number"
        ? song.duration
        : Number(song.duration ?? 0) || 0,
    streamUrl,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { tracks: [], error: "Please sign in again." },
      { status: 401 },
    );
  }

  const query = (
    new URL(req.url).searchParams.get("q") ?? ""
  )
    .trim()
    .slice(0, 80);
  const search = query.length > 0 ? query : "trending hits";

  try {
    const res = await fetch(
      `${UPSTREAM}?query=${encodeURIComponent(search)}&limit=24`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = (await res.json()) as {
      data?: { results?: RawSong[] };
    };
    const tracks = (json.data?.results ?? [])
      .map(normalize)
      .filter((track): track is RadioTrack => track !== null);
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json(
      { tracks: [], error: "Radio is having a moment — try again." },
      { status: 502 },
    );
  }
}
