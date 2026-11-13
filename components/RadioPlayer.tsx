"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Radio player (owner's feature, 2026-11-13): free in-app music
// via the JioSaavn unofficial API. The <audio> element and its
// state live HERE, in a provider mounted by the app shell
// (components/DialShell) — never inside a page — so playback
// survives navigation: start a song on the Radio page, keep
// swiping, chirping and chatting while it plays. The Media
// Session wiring gives lock-screen / notification controls, so
// it also keeps playing with the phone locked or the app in the
// background. The mini player renders just above the bottom tab
// bar on every shelled screen whenever a track is loaded, with
// the mute he asked for ("we can mute it while using the app").

export interface RadioTrack {
  id: string;
  title: string;
  artists: string;
  image: string | null;
  duration: number;
  streamUrl: string;
}

interface RadioContextValue {
  current: RadioTrack | null;
  queue: RadioTrack[];
  isPlaying: boolean;
  muted: boolean;
  currentTime: number;
  playTrack: (track: RadioTrack, queue: RadioTrack[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  toggleMute: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
}

const RadioContext = createContext<RadioContextValue | null>(null);

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used inside RadioProvider");
  return ctx;
}

export function RadioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<RadioTrack | null>(null);
  const [queue, setQueue] = useState<RadioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  const playTrack = useCallback((track: RadioTrack, list: RadioTrack[]) => {
    setQueue(list.length > 0 ? list : [track]);
    setCurrent(track);
    setCurrentTime(0);
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!current || queue.length === 0) return;
      const index = queue.findIndex((track) => track.id === current.id);
      const nextIndex =
        index === -1
          ? 0
          : (index + direction + queue.length) % queue.length;
      setCurrent(queue[nextIndex]);
      setCurrentTime(0);
    },
    [current, queue],
  );

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [current]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setCurrent(null);
    setQueue([]);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  // Load + play whenever the track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = current.streamUrl;
    void audio.play().catch(() => undefined);
  }, [current]);

  // Lock-screen / notification controls (Media Session): metadata
  // for the current song + hardware/OS transport buttons wired to
  // the same controls — this is what lets it "close the mobile
  // and also listen" with working controls.
  const controlsRef = useRef({ toggle, next, prev });
  controlsRef.current = { toggle, next, prev };
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artists,
      album: "OneUco Radio",
      artwork: current.image
        ? [{ src: current.image, sizes: "500x500", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.setActionHandler("play", () =>
      controlsRef.current.toggle(),
    );
    navigator.mediaSession.setActionHandler("pause", () =>
      controlsRef.current.toggle(),
    );
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      controlsRef.current.prev(),
    );
    navigator.mediaSession.setActionHandler("nexttrack", () =>
      controlsRef.current.next(),
    );
  }, [current]);

  const value: RadioContextValue = {
    current,
    queue,
    isPlaying,
    muted,
    currentTime,
    playTrack,
    toggle,
    next,
    prev,
    toggleMute,
    stop,
    seek,
  };

  return (
    <RadioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onEnded={() => next()}
      />
    </RadioContext.Provider>
  );
}

// The app-wide mini player: a slim card fixed just above the
// bottom tab bar, shown whenever a track is loaded. Artwork,
// title, prev / play-pause / next, mute and close — everything
// needed without going back to the Radio page.
export function MiniPlayer() {
  const radio = useRadio();
  const { current } = radio;
  if (!current) return null;
  const progress =
    current.duration > 0
      ? Math.min(100, (radio.currentTime / current.duration) * 100)
      : 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-40 px-3">
      <div className="pointer-events-auto relative mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 py-2.5 pl-2.5 pr-3 shadow-2xl shadow-black/60 backdrop-blur">
        <span
          className="absolute inset-x-0 top-0 h-0.5 bg-amber-500/80 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
          aria-hidden
        />
        {current.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg">
            🎵
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-white">
            {current.title}
          </span>
          <span className="truncate text-xs text-neutral-400">
            {current.artists} · Radio
          </span>
        </span>
        <button
          type="button"
          onClick={radio.prev}
          aria-label="Previous song"
          className="shrink-0 p-1 text-neutral-300 transition hover:text-white"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={radio.toggle}
          aria-label={radio.isPlaying ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm text-black transition hover:bg-neutral-200"
        >
          {radio.isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={radio.next}
          aria-label="Next song"
          className="shrink-0 p-1 text-neutral-300 transition hover:text-white"
        >
          ⏭
        </button>
        <button
          type="button"
          onClick={radio.toggleMute}
          aria-label={radio.muted ? "Unmute" : "Mute"}
          className="shrink-0 p-1 text-neutral-300 transition hover:text-white"
        >
          {radio.muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          onClick={radio.stop}
          aria-label="Stop radio"
          className="shrink-0 p-1 text-neutral-500 transition hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
