"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DeckCandidate } from "@/lib/social";
import { recordSwipeAction, resetPassesAction } from "./actions";

// The swipe deck (client). Cards arrive pre-filtered from the server
// (public fields only — see lib/social.ts). Interactions: pointer drag
// (mouse + touch), ←/→ arrow keys, and the ✕ / ♥ buttons. A card is only
// consumed once the swipe has been recorded server-side; a mutual like
// returns matched=true and the match moment takes over the screen.
//
// "Start again" after exhaustion sits behind a VISIBLE 2-minute
// countdown (product rule) and then resets only my passes server-side —
// likes and matches are never undone.

const SWIPE_THRESHOLD_PX = 90;
const FLY_MS = 220;
const RESET_WAIT_MS = 120_000;

function playMatchChime(): void {
  // Short two-note "love-birds" chime generated with WebAudio — no audio
  // file to ship. Wrapped in try/catch: sound is decoration, never a
  // blocker, and browsers may refuse a context outside a user gesture
  // (a swipe IS a gesture, so this normally plays).
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const notes: Array<{ freq: number; at: number }> = [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.12 },
      { freq: 1567.98, at: 0.24 },
    ];
    notes.forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.5);
    });
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 900);
  } catch {
    // No sound — the banner still shows.
  }
}

function shuffleTail<T>(items: T[], fromIndex: number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > fromIndex; i -= 1) {
    const j = fromIndex + Math.floor(Math.random() * (i - fromIndex + 1));
    const tmp: T = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

export default function SwipeDeck({
  candidates,
  accentHex: accent,
}: {
  candidates: DeckCandidate[];
  accentHex: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<DeckCandidate[]>(candidates);
  const [index, setIndex] = useState<number>(0);
  const [dragX, setDragX] = useState<number>(0);
  const [dragging, setDragging] = useState<boolean>(false);
  const [flyDir, setFlyDir] = useState<-1 | 0 | 1>(0);
  const [matched, setMatched] = useState<{ matchId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interacted, setInteracted] = useState<boolean>(false);
  const [exhaustedSince, setExhaustedSince] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(RESET_WAIT_MS / 1000);
  const [resetting, setResetting] = useState<boolean>(false);

  const dragStartX = useRef<number | null>(null);
  const busyRef = useRef<boolean>(false);

  const current: DeckCandidate | null = queue[index] ?? null;
  const nextCard: DeckCandidate | null = queue[index + 1] ?? null;
  const exhausted = current === null;

  // Start the visible countdown the moment the deck runs out.
  useEffect(() => {
    if (exhausted && exhaustedSince === null) {
      setExhaustedSince(Date.now());
    }
    if (!exhausted && exhaustedSince !== null) {
      setExhaustedSince(null);
    }
  }, [exhausted, exhaustedSince]);

  useEffect(() => {
    if (exhaustedSince === null) return;
    const tick = (): void => {
      const remaining = Math.max(
        0,
        Math.ceil((exhaustedSince + RESET_WAIT_MS - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [exhaustedSince]);

  const commit = useCallback(
    async (direction: "like" | "pass"): Promise<void> => {
      const card: DeckCandidate | null = queue[index] ?? null;
      if (!card || busyRef.current) return;
      busyRef.current = true;
      setInteracted(true);
      setError(null);
      setFlyDir(direction === "like" ? 1 : -1);
      const result = await recordSwipeAction(card.profile.accountId, direction);
      window.setTimeout(() => {
        setIndex((value) => value + 1);
        setDragX(0);
        setFlyDir(0);
        busyRef.current = false;
        if (result.error) {
          setError(result.error);
        } else if (result.matched && result.matchId) {
          setMatched({ matchId: result.matchId, name: card.profile.name });
          playMatchChime();
        }
      }, FLY_MS);
    },
    [index, queue],
  );

  // Arrow keys: ← pass, → like.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (matched) return;
      if (event.key === "ArrowRight") void commit("like");
      if (event.key === "ArrowLeft") void commit("pass");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, matched]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (busyRef.current || matched) return;
    dragStartX.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging || dragStartX.current === null) return;
    setDragX(event.clientX - dragStartX.current);
  }

  function onPointerUp(): void {
    if (!dragging) return;
    setDragging(false);
    const dx: number = dragX;
    dragStartX.current = null;
    if (dx > SWIPE_THRESHOLD_PX) {
      void commit("like");
    } else if (dx < -SWIPE_THRESHOLD_PX) {
      void commit("pass");
    } else {
      setDragX(0);
    }
  }

  function onShuffle(): void {
    setInteracted(true);
    setQueue((items) => shuffleTail(items, index + 1));
  }

  async function onStartAgain(): Promise<void> {
    setResetting(true);
    const result = await resetPassesAction();
    setResetting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // The server re-deals the deck: passes are forgotten, so those
    // profiles come back; likes stay consumed and matches stay matched.
    router.refresh();
  }

  const flyOffset = flyDir === 0 ? dragX : flyDir * 640;
  const cardTransform = `translateX(${flyOffset}px) rotate(${flyOffset / 18}deg)`;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {matched ? (
        <div className="w-full rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-center shadow-xl">
          <p className="text-base font-semibold">It&apos;s a match! 🎉</p>
          <p className="mt-1 text-sm text-neutral-400">
            You and {matched.name} liked each other. Be the first to message
            them.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Link
              href={`/friends/${matched.matchId}`}
              className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Message them
            </Link>
            <button
              type="button"
              onClick={() => setMatched(null)}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
            >
              Keep swiping
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="w-full text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {current ? (
        <>
          <div className="relative h-[480px] w-full max-w-sm select-none">
            {nextCard ? (
              <div className="absolute inset-0 scale-95 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 opacity-60">
                <CardFace candidate={nextCard} />
              </div>
            ) : null}
            <div
              role="presentation"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="absolute inset-0 cursor-grab overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 active:cursor-grabbing"
              style={{
                transform: cardTransform,
                transition: dragging ? "none" : "transform 0.22s ease",
                touchAction: "pan-y",
              }}
            >
              <CardFace candidate={current} />
              {dragX > 24 || flyDir === 1 ? (
                <span className="absolute left-4 top-4 rounded-lg border-2 border-emerald-400 px-2 py-0.5 text-sm font-bold uppercase tracking-widest text-emerald-400">
                  Like
                </span>
              ) : null}
              {dragX < -24 || flyDir === -1 ? (
                <span className="absolute right-4 top-4 rounded-lg border-2 border-rose-400 px-2 py-0.5 text-sm font-bold uppercase tracking-widest text-rose-400">
                  Pass
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void commit("pass")}
              aria-label="Pass"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700 text-2xl text-rose-400 transition hover:bg-neutral-900"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={onShuffle}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900"
            >
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => void commit("like")}
              aria-label="Like"
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white transition hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              ♥
            </button>
          </div>

          {!interacted ? (
            <p className="hidden text-xs text-neutral-600 sm:block">
              Tip: drag the card, use the ← → arrow keys, or the buttons.
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-10 text-center">
          <p className="text-lg font-semibold">You&apos;re all caught up</p>
          <p className="text-sm leading-relaxed text-neutral-400">
            You&apos;ve seen everyone for now. Your matches are safe — start
            again to re-see the people you passed on.
          </p>
          {secondsLeft > 0 ? (
            <p className="text-sm text-neutral-500">
              Start again available in{" "}
              <span className="font-mono text-neutral-300">
                {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </span>
            </p>
          ) : null}
          <button
            type="button"
            disabled={secondsLeft > 0 || resetting}
            onClick={() => void onStartAgain()}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resetting ? "Resetting…" : "Start again"}
          </button>
        </div>
      )}
    </div>
  );
}

function CardFace({ candidate }: { candidate: DeckCandidate }) {
  const photo: string | null = candidate.photos[0] ?? null;
  const { profile } = candidate;
  return (
    <div className="relative h-full w-full">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={profile.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-6xl font-semibold text-neutral-500">
          {profile.name.charAt(0).toUpperCase() || "?"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-16">
        <p className="text-xl font-semibold">{profile.name}</p>
        <p className="text-sm text-neutral-400">@{profile.username}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {profile.branch ? (
            <span className="rounded-full border border-neutral-600 px-2.5 py-0.5 text-xs text-neutral-200">
              {profile.branch}
            </span>
          ) : null}
          {candidate.intention ? (
            <span className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs capitalize text-neutral-400">
              {candidate.intention.replace("_", " ")}
            </span>
          ) : null}
        </div>
        {profile.bio ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-300">
            {profile.bio}
          </p>
        ) : null}
      </div>
    </div>
  );
}
