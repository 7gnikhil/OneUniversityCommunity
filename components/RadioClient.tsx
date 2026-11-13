"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRadio, type RadioTrack } from "@/components/RadioPlayer";

// Radio page body (2026-11-13): search + quick-mood chips + the
// track list, all feeding the shell-level player (components/
// RadioPlayer). Starting a song queues the whole visible list,
// so next/prev and auto-advance walk what you were browsing.
// Playback itself never lives here — navigate away and the music
// keeps going under the mini player.

const CHIPS: Array<{ label: string; query: string }> = [
  { label: "Trending", query: "trending hits" },
  { label: "Telugu", query: "telugu hits" },
  { label: "Hindi", query: "hindi hits" },
  { label: "English", query: "english pop hits" },
  { label: "Punjabi", query: "punjabi hits" },
  { label: "Tamil", query: "tamil hits" },
];

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RadioClient() {
  const radio = useRadio();
  const [query, setQuery] = useState<string>("");
  const [activeChip, setActiveChip] = useState<string>("Trending");
  const [tracks, setTracks] = useState<RadioTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/radio?q=${encodeURIComponent(search)}`,
      );
      const json = (await res.json()) as {
        tracks?: RadioTrack[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "failed");
      setTracks(json.tracks ?? []);
      if ((json.tracks ?? []).length === 0) {
        setError("No songs found for that — try another search.");
      }
    } catch {
      setTracks([]);
      setError("Radio is having a moment — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(CHIPS[0].query);
  }, [load]);

  function onSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const search = query.trim();
    if (!search) return;
    setActiveChip("");
    void load(search);
  }

  function onChip(chip: { label: string; query: string }): void {
    setActiveChip(chip.label);
    setQuery("");
    void load(chip.query);
  }

  const current = radio.current;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search songs, artists, movies…"
          className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-amber-500/60 focus:outline-none"
          aria-label="Search songs"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChip(chip)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              activeChip === chip.label
                ? "bg-white text-black"
                : "border border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {current ? (
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
          <p className="text-center text-[11px] leading-relaxed text-neutral-500">
            Keeps playing while you use the app — even with the phone
            locked. Use the mini player or your lock screen to control it.
          </p>
        </section>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Tuning the radio…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-neutral-400">{error}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-900 rounded-3xl border border-neutral-800 bg-neutral-950 px-4">
          {tracks.map((track) => {
            const isCurrent = current?.id === track.id;
            return (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => radio.playTrack(track, tracks)}
                  className="flex w-full items-center gap-3 py-3 text-left"
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
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {formatDuration(track.duration)}
                  </span>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                      isCurrent
                        ? "bg-amber-500 text-black"
                        : "bg-white/5 text-white"
                    }`}
                    aria-hidden
                  >
                    {isCurrent && radio.isPlaying ? "❚❚" : "▶"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-[11px] text-neutral-600">
        Music via the JioSaavn unofficial API · Free to listen in OneUco
      </p>
    </div>
  );
}
