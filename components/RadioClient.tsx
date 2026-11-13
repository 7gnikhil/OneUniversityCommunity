"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRadio, type RadioTrack } from "@/components/RadioPlayer";
import { createChirpAction } from "@/app/chirp/actions";

// Music Mitra (2026-11-14 — the owner's MusicMitra app merged
// into OneUco, replacing the Radio v1 page): a full music app in
// one client component.
//  - Search across Songs / Albums / Playlists (JioSaavn); album
//    and playlist pages open inline with Play All.
//  - Results arrive re-ranked by play count from the proxy, so
//    originals sit above remixes and covers.
//  - Load more walks the catalogue page by page (the totals run
//    into the tens of thousands per search).
//  - When a song search runs thin, an Audius shelf (independent
//    artists, full streams) appears under the results.
//  - ♥ Liked songs and Recently played live in localStorage —
//    personal, instant, on-device.
//  - Now Playing carries Karaoke (LRCLIB synced lyrics, the
//    active line lit and auto-scrolling), Share to Chirp (posts
//    the song to the Chirp feed with its artwork), Download and
//    the system Share sheet.
// Playback itself never lives here — the shell player (components/
// RadioPlayer) owns the <audio>, so music survives navigation.

interface RadioCollection {
  id: string;
  name: string;
  image: string | null;
  subtitle: string;
}

type SearchMode = "songs" | "albums" | "playlists";

const CHIPS: Array<{ label: string; query: string }> = [
  { label: "Trending", query: "trending hits" },
  { label: "Telugu", query: "telugu hits" },
  { label: "Hindi", query: "hindi hits" },
  { label: "English", query: "english pop hits" },
  { label: "Punjabi", query: "punjabi hits" },
  { label: "Tamil", query: "tamil hits" },
];

const FAVORITES_KEY = "mm:favorites";
const RECENTS_KEY = "mm:recents";

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPlays(plays: number): string {
  if (!plays || plays <= 0) return "";
  return `${new Intl.NumberFormat("en", { notation: "compact" }).format(plays)} plays`;
}

function readStoredTracks(key: string): RadioTrack[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as RadioTrack[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeTracks(key: string, tracks: RadioTrack[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(tracks));
  } catch {
    // Storage off — the feature just doesn't persist.
  }
}

async function downloadTrack(track: RadioTrack): Promise<void> {
  const ext = track.source === "audius" ? "mp3" : "mp4";
  const filename = `${track.title} - ${track.artists}.${ext}`.replace(
    /[/\\?%*:|"<>]/g,
    "",
  );
  try {
    const res = await fetch(track.streamUrl);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    window.open(track.streamUrl, "_blank", "noopener");
  }
}

export default function RadioClient() {
  const radio = useRadio();
  const [mode, setMode] = useState<SearchMode>("songs");
  const [query, setQuery] = useState<string>("");
  const [activeChip, setActiveChip] = useState<string>("Trending");
  const [tracks, setTracks] = useState<RadioTrack[]>([]);
  const [collections, setCollections] = useState<RadioCollection[]>([]);
  const [audiusTracks, setAudiusTracks] = useState<RadioTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [activeSearch, setActiveSearch] = useState<string>(CHIPS[0].query);
  const [collection, setCollection] = useState<{
    kind: "albums" | "playlists";
    meta: RadioCollection;
    songs: RadioTrack[];
  } | null>(null);
  const [collectionLoading, setCollectionLoading] =
    useState<boolean>(false);
  const [favorites, setFavorites] = useState<RadioTrack[]>([]);
  const [showFavorites, setShowFavorites] = useState<boolean>(false);
  const [recents, setRecents] = useState<RadioTrack[]>([]);

  useEffect(() => {
    setFavorites(readStoredTracks(FAVORITES_KEY));
    setRecents(readStoredTracks(RECENTS_KEY));
  }, []);

  // Keep the recents shelf fresh when a new song starts elsewhere.
  const currentId = radio.current?.id ?? null;
  useEffect(() => {
    if (currentId) setRecents(readStoredTracks(RECENTS_KEY));
  }, [currentId]);

  const toggleFavorite = useCallback((track: RadioTrack) => {
    setFavorites((prev) => {
      const exists = prev.some((item) => item.id === track.id);
      const next = exists
        ? prev.filter((item) => item.id !== track.id)
        : [track, ...prev];
      storeTracks(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const favoriteIds = new Set(favorites.map((track) => track.id));

  const loadSongs = useCallback(
    async (search: string, pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/radio?type=songs&q=${encodeURIComponent(search)}&page=${pageNum}`,
        );
        const json = (await res.json()) as {
          tracks?: RadioTrack[];
          total?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "failed");
        const fresh = json.tracks ?? [];
        setTracks((prev) => {
          if (!append) return fresh;
          const seen = new Set(prev.map((track) => track.id));
          return [...prev, ...fresh.filter((track) => !seen.has(track.id))];
        });
        setTotal(json.total ?? 0);
        setPage(pageNum);
        setActiveSearch(search);
        if (!append) {
          setAudiusTracks([]);
          if (fresh.length === 0) {
            setError("No songs found for that — try another search.");
          } else if (fresh.length < 8) {
            // Thin shelf: bring in the second source.
            try {
              const au = await fetch(
                `/api/radio?type=audius&q=${encodeURIComponent(search)}`,
              );
              const auJson = (await au.json()) as {
                tracks?: RadioTrack[];
              };
              if (au.ok) setAudiusTracks(auJson.tracks ?? []);
            } catch {
              // The shelf is a bonus; silence is fine.
            }
          }
        }
      } catch {
        if (!append) {
          setTracks([]);
          setError("Music Mitra is having a moment — try again.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  const loadCollections = useCallback(
    async (kind: "albums" | "playlists", search: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/radio?type=${kind}&q=${encodeURIComponent(search)}&page=1`,
        );
        const json = (await res.json()) as {
          collections?: RadioCollection[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "failed");
        setCollections(json.collections ?? []);
        if ((json.collections ?? []).length === 0) {
          setError("Nothing found for that — try another search.");
        }
      } catch {
        setCollections([]);
        setError("Music Mitra is having a moment — try again.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSongs(CHIPS[0].query, 1, false);
  }, [loadSongs]);

  function runSearch(search: string): void {
    setCollection(null);
    setShowFavorites(false);
    if (mode === "songs") void loadSongs(search, 1, false);
    else void loadCollections(mode, search);
  }

  function onSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const search = query.trim();
    if (!search) return;
    setActiveChip("");
    runSearch(search);
  }

  function onChip(chip: { label: string; query: string }): void {
    setActiveChip(chip.label);
    setQuery("");
    setCollection(null);
    setShowFavorites(false);
    if (mode !== "songs") {
      setMode("songs");
    }
    void loadSongs(chip.query, 1, false);
  }

  function onMode(next: SearchMode): void {
    setMode(next);
    setCollection(null);
    setShowFavorites(false);
    const search = query.trim() || CHIPS[0].query;
    if (next === "songs") void loadSongs(search, 1, false);
    else void loadCollections(next, search);
  }

  async function openCollection(
    kind: "albums" | "playlists",
    meta: RadioCollection,
  ): Promise<void> {
    setCollectionLoading(true);
    setCollection({ kind, meta, songs: [] });
    try {
      const type = kind === "albums" ? "albumSongs" : "playlistSongs";
      const res = await fetch(
        `/api/radio?type=${type}&id=${encodeURIComponent(meta.id)}`,
      );
      const json = (await res.json()) as {
        tracks?: RadioTrack[];
        collection?: RadioCollection | null;
      };
      if (!res.ok) throw new Error("failed");
      setCollection({
        kind,
        meta: json.collection ?? meta,
        songs: json.tracks ?? [],
      });
    } catch {
      setCollection({ kind, meta, songs: [] });
    } finally {
      setCollectionLoading(false);
    }
  }

  const hasMore =
    mode === "songs" && !showFavorites && tracks.length > 0 && tracks.length < total;
  const isHome =
    mode === "songs" && !showFavorites && !collection && activeChip !== "";

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search songs, albums, artists, movies…"
          className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-amber-500/60 focus:outline-none"
          aria-label="Search music"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400"
        >
          Search
        </button>
      </form>

      <div className="flex gap-2" role="tablist" aria-label="Search type">
        {(
          [
            { id: "songs", label: "Songs" },
            { id: "albums", label: "Albums" },
            { id: "playlists", label: "Playlists" },
          ] as Array<{ id: SearchMode; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => onMode(tab.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              mode === tab.id
                ? "bg-white text-black"
                : "border border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowFavorites((value) => !value);
            setCollection(null);
          }}
          className={`ml-auto rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            showFavorites
              ? "bg-rose-500 text-white"
              : "border border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          ♥ Liked{favorites.length > 0 ? ` (${favorites.length})` : ""}
        </button>
      </div>

      {mode === "songs" && !showFavorites ? (
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChip(chip)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                activeChip === chip.label
                  ? "bg-amber-500 text-black"
                  : "border border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      <NowPlaying
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
      />

      {collection ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setCollection(null)}
            className="self-start text-sm text-neutral-400 transition hover:text-white"
          >
            ← Back to results
          </button>
          <div className="flex items-center gap-4 rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
            {collection.meta.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={collection.meta.image}
                alt=""
                className="h-20 w-20 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-3xl">
                🎵
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400">
                {collection.kind === "albums" ? "Album" : "Playlist"}
              </p>
              <h2 className="truncate text-lg font-bold text-white">
                {collection.meta.name}
              </h2>
              <p className="truncate text-xs text-neutral-400">
                {collection.meta.subtitle}
              </p>
              {collection.songs.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    radio.playTrack(collection.songs[0], collection.songs)
                  }
                  className="mt-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-neutral-200"
                >
                  ▶ Play all
                </button>
              ) : null}
            </div>
          </div>
          {collectionLoading ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              Opening…
            </p>
          ) : collection.songs.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">
              This one has no playable songs right now.
            </p>
          ) : (
            <TrackList
              list={collection.songs}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </section>
      ) : showFavorites ? (
        favorites.length === 0 ? (
          <p className="py-10 text-center text-sm leading-relaxed text-neutral-400">
            No liked songs yet — tap the ♥ on any song and it will
            live here, on this device.
          </p>
        ) : (
          <TrackList
            list={favorites}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
          />
        )
      ) : loading ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Tuning Music Mitra…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-neutral-400">{error}</p>
      ) : mode !== "songs" ? (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openCollection(mode, item)}
              className="flex flex-col gap-2 rounded-3xl border border-neutral-800 bg-neutral-950 p-3 text-left transition hover:border-neutral-600"
            >
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt=""
                  className="aspect-square w-full rounded-2xl object-cover"
                />
              ) : (
                <span className="flex aspect-square w-full items-center justify-center rounded-2xl bg-white/5 text-4xl">
                  🎵
                </span>
              )}
              <span className="truncate text-sm font-semibold text-neutral-100">
                {item.name}
              </span>
              <span className="truncate text-xs text-neutral-500">
                {item.subtitle}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {isHome && recents.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Jump back in
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recents.slice(0, 10).map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => radio.playTrack(track, recents)}
                    className="flex w-24 shrink-0 flex-col gap-1.5 text-left"
                  >
                    {track.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.image}
                        alt=""
                        className="h-24 w-24 rounded-2xl object-cover"
                      />
                    ) : (
                      <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/5 text-3xl">
                        🎵
                      </span>
                    )}
                    <span className="truncate text-xs font-medium text-neutral-200">
                      {track.title}
                    </span>
                    <span className="truncate text-[11px] text-neutral-500">
                      {track.artists}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <TrackList
            list={tracks}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
          />

          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadSongs(activeSearch, page + 1, true)}
              className="rounded-full border border-neutral-700 bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition hover:border-amber-500/60 disabled:opacity-50"
            >
              {loadingMore
                ? "Loading…"
                : `Load more songs (${new Intl.NumberFormat("en", { notation: "compact" }).format(total)} in this search)`}
            </button>
          ) : null}

          {audiusTracks.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                More from independent artists · Audius
              </h3>
              <TrackList
                list={audiusTracks}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            </section>
          ) : null}
        </>
      )}

    </div>
  );
}

// ── Track list + row ─────────────────────────────────────────────

function TrackList({
  list,
  favoriteIds,
  onToggleFavorite,
}: {
  list: RadioTrack[];
  favoriteIds: Set<string>;
  onToggleFavorite: (track: RadioTrack) => void;
}) {
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-neutral-900 rounded-3xl border border-neutral-800 bg-neutral-950 px-4">
      {list.map((track) => (
        <TrackRow
          key={track.id}
          track={track}
          list={list}
          isFavorite={favoriteIds.has(track.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </ul>
  );
}

function TrackRow({
  track,
  list,
  isFavorite,
  onToggleFavorite,
}: {
  track: RadioTrack;
  list: RadioTrack[];
  isFavorite: boolean;
  onToggleFavorite: (track: RadioTrack) => void;
}) {
  const radio = useRadio();
  const isCurrent = radio.current?.id === track.id;
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function flash(message: string): void {
    setFeedback(message);
    setMenuOpen(false);
    setTimeout(() => setFeedback(null), 2600);
  }

  async function chirpIt(): Promise<void> {
    const body = `🎵 Listening to "${track.title}" by ${track.artists} on Music Mitra 🎧\nFree inside OneUco — open the Mitra tab and press play.`;
    const result = await createChirpAction(body, track.image);
    flash(result.error ? result.error : "Posted to Chirp ✔");
  }

  async function shareIt(): Promise<void> {
    const url =
      track.songUrl ?? `${window.location.origin}/radio`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${track.title} — ${track.artists}`,
          text: `Listen to "${track.title}" by ${track.artists} free on Music Mitra (OneUco)`,
          url,
        });
        setMenuOpen(false);
        return;
      }
      throw new Error("no share sheet");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        flash("Link copied ✔");
      } catch {
        flash("Couldn't share that one");
      }
    }
  }

  return (
    <li className="relative flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={() => radio.playTrack(track, list)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {track.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.image}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
            🎵
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={`truncate text-sm font-semibold ${
              isCurrent ? "text-amber-400" : "text-neutral-100"
            }`}
          >
            {track.title}
          </span>
          <span className="truncate text-xs text-neutral-500">
            {track.artists}
            {track.source === "audius" ? " · Audius" : ""}
          </span>
          {feedback ? (
            <span className="truncate text-xs font-medium text-emerald-400">
              {feedback}
            </span>
          ) : null}
        </span>
      </button>
      <span className="hidden shrink-0 text-[11px] text-neutral-600 min-[420px]:block">
        {formatPlays(track.plays)}
      </span>
      <span className="shrink-0 text-xs text-neutral-500">
        {formatDuration(track.duration)}
      </span>
      <button
        type="button"
        onClick={() => onToggleFavorite(track)}
        aria-label={isFavorite ? "Unlike song" : "Like song"}
        className={`shrink-0 p-1 text-base transition ${
          isFavorite ? "text-rose-500" : "text-neutral-600 hover:text-rose-400"
        }`}
      >
        {isFavorite ? "♥" : "♡"}
      </button>
      <button
        type="button"
        onClick={() => radio.playTrack(track, list)}
        aria-label={`Play ${track.title}`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
          isCurrent ? "bg-amber-500 text-black" : "bg-white/5 text-white"
        }`}
      >
        {isCurrent && radio.isPlaying ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-label="Song options"
        className="shrink-0 p-1 text-neutral-400 transition hover:text-white"
      >
        ⋯
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-20 w-48 rounded-2xl border border-neutral-700 bg-neutral-900 p-1.5 shadow-2xl shadow-black/60">
          <button
            type="button"
            onClick={() => void chirpIt()}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/5"
          >
            🐦 Post to Chirp
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void downloadTrack(track);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/5"
          >
            ⤓ Download
          </button>
          <button
            type="button"
            onClick={() => void shareIt()}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/5"
          >
            ↗ Share
          </button>
        </div>
      ) : null}
    </li>
  );
}

// ── Now playing + karaoke ────────────────────────────────────────

interface LyricLine {
  t: number;
  text: string;
}

function NowPlaying({
  favoriteIds,
  onToggleFavorite,
}: {
  favoriteIds: Set<string>;
  onToggleFavorite: (track: RadioTrack) => void;
}) {
  const radio = useRadio();
  const current = radio.current;
  const [karaokeOpen, setKaraokeOpen] = useState<boolean>(false);
  const [lyrics, setLyrics] = useState<{
    trackId: string;
    lines: LyricLine[];
    synced: boolean;
  } | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);

  const trackId = current?.id ?? null;
  useEffect(() => {
    if (!karaokeOpen || !current || lyrics?.trackId === current.id) return;
    let cancelled = false;
    setLyricsLoading(true);
    const artist = current.artists.split(",")[0]?.trim() ?? "";
    fetch(
      `/api/radio?type=lyrics&track=${encodeURIComponent(current.title)}&artist=${encodeURIComponent(artist)}`,
    )
      .then((res) => res.json())
      .then((json: { lines?: LyricLine[]; synced?: boolean }) => {
        if (cancelled) return;
        setLyrics({
          trackId: current.id,
          lines: json.lines ?? [],
          synced: Boolean(json.synced),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics({ trackId: current.id, lines: [], synced: false });
        }
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karaokeOpen, trackId]);

  const activeIndex =
    lyrics && current && lyrics.trackId === current.id && lyrics.synced
      ? lyrics.lines.reduce(
          (acc, line, index) =>
            line.t <= radio.currentTime + 0.25 ? index : acc,
          -1,
        )
      : -1;

  useEffect(() => {
    if (activeIndex >= 0) {
      activeLineRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  if (!current) return null;
  const isFavorite = favoriteIds.has(current.id);

  async function chirpCurrent(): Promise<void> {
    if (!current) return;
    const body = `🎵 Listening to "${current.title}" by ${current.artists} on Music Mitra 🎧\nFree inside OneUco — open the Mitra tab and press play.`;
    const result = await createChirpAction(body, current.image);
    setFeedback(result.error ? result.error : "Posted to Chirp ✔");
    setTimeout(() => setFeedback(null), 2600);
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-amber-500/25 bg-neutral-950 p-4">
      <div className="flex items-center gap-3">
        {current.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.image}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-2xl">
            🎵
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400">
            Now playing
          </p>
          <p className="truncate text-base font-bold text-white">
            {current.title}
          </p>
          <p className="truncate text-xs text-neutral-400">
            {current.artists}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(current)}
          aria-label={isFavorite ? "Unlike song" : "Like song"}
          className={`ml-auto shrink-0 p-1 text-xl transition ${
            isFavorite ? "text-rose-500" : "text-neutral-600 hover:text-rose-400"
          }`}
        >
          {isFavorite ? "♥" : "♡"}
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span>{formatDuration(radio.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={current.duration || 0}
          value={Math.min(radio.currentTime, current.duration || 0)}
          onChange={(event) => radio.seek(Number(event.target.value))}
          className="min-w-0 flex-1 accent-amber-500"
          aria-label="Seek"
        />
        <span>{formatDuration(current.duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={radio.prev}
          aria-label="Previous song"
          className="p-2 text-lg text-neutral-300 transition hover:text-white"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={radio.toggle}
          aria-label={radio.isPlaying ? "Pause" : "Play"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-base text-black transition hover:bg-neutral-200"
        >
          {radio.isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={radio.next}
          aria-label="Next song"
          className="p-2 text-lg text-neutral-300 transition hover:text-white"
        >
          ⏭
        </button>
        <button
          type="button"
          onClick={radio.toggleMute}
          aria-label={radio.muted ? "Unmute" : "Mute"}
          className="p-2 text-lg text-neutral-300 transition hover:text-white"
        >
          {radio.muted ? "🔇" : "🔊"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setKaraokeOpen((value) => !value)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            karaokeOpen
              ? "bg-amber-500 text-black"
              : "border border-neutral-700 text-neutral-200 hover:border-amber-500/60"
          }`}
        >
          🎤 Karaoke
        </button>
        <button
          type="button"
          onClick={() => void chirpCurrent()}
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-neutral-500"
        >
          🐦 Post to Chirp
        </button>
        <button
          type="button"
          onClick={() => void downloadTrack(current)}
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-neutral-500"
        >
          ⤓ Download
        </button>
      </div>
      {feedback ? (
        <p className="text-center text-xs font-medium text-emerald-400">
          {feedback}
        </p>
      ) : null}

      {karaokeOpen ? (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-black/60 px-4 py-3">
          {lyricsLoading ? (
            <p className="py-4 text-center text-sm text-neutral-500">
              Finding the lyrics…
            </p>
          ) : !lyrics || lyrics.trackId !== current.id || lyrics.lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              Lyrics aren&apos;t available for this one yet — hum the
              tune, we won&apos;t judge.
            </p>
          ) : (
            <>
              <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto scroll-smooth py-1">
                {lyrics.lines.map((line, index) => {
                  const isActive = index === activeIndex;
                  if (!line.text && !isActive) return null;
                  return (
                    <p
                      key={`${line.t}-${index}`}
                      ref={isActive ? activeLineRef : undefined}
                      className={`text-center leading-relaxed transition-all ${
                        isActive
                          ? "text-base font-bold text-amber-400"
                          : "text-sm text-neutral-400"
                      }`}
                    >
                      {line.text || "♪"}
                    </p>
                  );
                })}
              </div>
              <p className="text-center text-[11px] text-neutral-600">
                {lyrics.synced
                  ? "Synced lyrics — sing along 🎤"
                  : "Lyrics (unsynced)"}{" "}
                · Your turn: record your own cover from your profile
                and let the campus hear it.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
