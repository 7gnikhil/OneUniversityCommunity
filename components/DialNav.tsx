"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";

// The round rotating dial — OneUco's home navigation.
//
// Faithful port of the approved demo dial (Muse artifact "OneUco"):
// a real rotary-telephone feel. Five stops sit on the rim; the stop at
// the top notch is the readout shown in the fixed centre hub. Drag in a
// circle (or flick) to rotate — the wheel ratchet-clicks over its gear
// teeth as you pull it, then springs back with a governor whir and pulse
// clicks, clunking into the nearest stop. Tapping a stop spins it to the
// notch and, once the wheel locks in, navigates to it.
//
// Sound is the demo's WebAudio kit (synthesised ratchet ticks, governor
// whir, rest-stop clunk — no audio files). One shared AudioContext,
// created lazily inside the first user gesture; every sound call is
// failure-proof so a missing/blocked AudioContext can never break nav.
//
// Server contract (unchanged): `badges` carries per-href unread counts
// plus the viewer's accent colour; a stop with count > 0 shows a badge
// bubble capped at 99+.

export interface DialBadges {
  counts: Record<string, number>;
  accentHex: string;
}

interface DialStopDef {
  label: string;
  href: string;
  iconPath: string;
  iconCircle?: boolean;
}

// Minimal stroke icons, one consistent set (ported from the demo).
const STOPS: DialStopDef[] = [
  {
    label: "Servers",
    href: "/servers",
    iconPath:
      "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  },
  {
    label: "Swipe Deck",
    href: "/swipe",
    iconPath:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z",
  },
  {
    label: "Friends",
    href: "/friends",
    iconPath:
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    label: "Chirp",
    href: "/chirp",
    iconPath:
      "M20.2 3.8a6 6 0 0 0-8.5 0L5 10.5V19h8.5l6.7-6.7a6 6 0 0 0 0-8.5zM16 8L2 22M17.5 15H9",
  },
  {
    label: "Profile",
    href: "/profile",
    iconPath: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    iconCircle: true,
  },
];

const SPACING = 360 / STOPS.length; // 72° between the five stops
const HALF = SPACING / 2;

// The demo's dark dial palette (production is black/minimal throughout).
const FACE = "#131316";
const RING = "#27272a";
const SURFACE = "#131316";
const SURFACE_2 = "#1f1f23";
const TEXT = "#fafafa";
const DIM = "#a1a1aa";
const BORDER = "#27272a";
const FALLBACK_ACCENT = "#737373"; // demo dark-theme default accent

function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function norm(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Signed shortest angular distance from `from` to `to`, in [-180, 180]. */
function delta(from: number, to: number): number {
  let d = norm(to - from);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Readable variant of the accent for text on the black page: the demo's
 * black accent pairs with a light grey "strong" tone, so very dark
 * accents (e.g. production's default #171717) fall back to that grey
 * while brighter accents speak for themselves.
 */
function readableAccent(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#a3a3a3";
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.3 ? "#a3a3a3" : hex;
}

function DialIcon({ d, circle }: { d: string; circle?: boolean }) {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {circle ? <circle cx="12" cy="8" r="4" /> : null}
      <path d={d} />
    </svg>
  );
}

// ── Sound kit (ported from the demo) ────────────────────────────────────
// A real rotary dial makes two distinct mechanical sounds: the ratchet
// pawl clicking over gear teeth while you pull (playTick), and on
// release the governor whirring ("brrrt") under the pulse-cam clicks
// until the wheel clunks into its rest stop (playLock). All synthesised
// from filtered noise bursts + short tones.

let soundCtx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!soundCtx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      soundCtx = new AC();
    }
    if (soundCtx.state === "suspended") void soundCtx.resume();
    return soundCtx;
  } catch {
    return null;
  }
}

function getNoise(a: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** One short filtered noise burst — the "click" body of a mechanical part. */
function noiseBurst(opts: {
  when?: number;
  dur?: number;
  freq?: number;
  q?: number;
  gain?: number;
  type?: BiquadFilterType;
}): void {
  const a = audioContext();
  if (!a) return;
  try {
    const t = a.currentTime + (opts.when ?? 0);
    const src = a.createBufferSource();
    src.buffer = getNoise(a);
    // Random offset so consecutive clicks never sound identical.
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const filter = a.createBiquadFilter();
    filter.type = opts.type ?? "bandpass";
    filter.frequency.value = opts.freq ?? 3000;
    filter.Q.value = opts.q ?? 1.1;
    const gain = a.createGain();
    const peak = opts.gain ?? 0.2;
    const dur = opts.dur ?? 0.02;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  } catch {
    // Sound is decoration — never let it break the dial.
  }
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  gainPeak: number,
  when = 0,
): void {
  const a = audioContext();
  if (!a) return;
  try {
    const t = a.currentTime + when;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    // Sound is decoration — never let it break the dial.
  }
}

/**
 * One ratchet click — a dry metallic double-click: the pawl snapping
 * over a gear tooth, then the tooth's tiny ring. Slight random pitch /
 * gain variation keeps a run of ticks mechanical, not electronic.
 */
function playTick(): void {
  const jitter = 0.9 + Math.random() * 0.25;
  noiseBurst({ dur: 0.018, freq: 3200 * jitter, q: 1.2, gain: 0.22 });
  noiseBurst({
    when: 0.006,
    dur: 0.012,
    freq: 1900 * jitter,
    q: 1.4,
    gain: 0.1,
  });
  blip(2400 * jitter, 0.02, "square", 0.028);
}

/**
 * The governor whir while the dial springs back to rest: a continuous
 * band-filtered rattle underneath the return clicks. It fades on its own.
 */
function playDialWhir(durationSec = 0.45): void {
  const a = audioContext();
  if (!a) return;
  try {
    const t = a.currentTime;
    const dur = Math.max(0.15, Math.min(1.2, durationSec));
    const src = a.createBufferSource();
    src.buffer = getNoise(a);
    src.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(750, t);
    filter.frequency.exponentialRampToValueAtTime(480, t + dur);
    filter.Q.value = 2.2;
    // Amplitude flutter at ~28Hz imitates the governor's rattle.
    const flutter = a.createOscillator();
    flutter.frequency.value = 28;
    const flutterGain = a.createGain();
    flutterGain.gain.value = 0.018;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.03);
    gain.gain.setValueAtTime(0.05, t + Math.max(0.03, dur - 0.09));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    flutter.connect(flutterGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t, Math.random() * 0.4);
    flutter.start(t);
    src.stop(t + dur + 0.05);
    flutter.stop(t + dur + 0.05);
  } catch {
    // Sound is decoration — never let it break the dial.
  }
}

/**
 * The dial hitting its rest stop: a solid low clunk, a metal tick, and
 * one faint settling click a beat later — like the real mechanism.
 */
function playLock(): void {
  noiseBurst({ dur: 0.05, freq: 700, q: 0.8, gain: 0.26, type: "lowpass" });
  blip(170, 0.11, "triangle", 0.22);
  noiseBurst({ when: 0.012, dur: 0.016, freq: 2600, q: 1.3, gain: 0.12 });
  noiseBurst({ when: 0.07, dur: 0.012, freq: 2100, q: 1.4, gain: 0.05 });
}

function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // vibration is best-effort
  }
}

// ── The dial ────────────────────────────────────────────────────────────

/**
 * Which stop a route belongs to (Servers /servers*, Swipe Deck /swipe,
 * Friends /friends*, Chirp /chirp, Profile /profile*). Anything else —
 * home, inbox, search, admin, a profile-reveal page — maps to null: no
 * stop is forced and the wheel stays wherever it rests.
 */
export function stopIndexForPath(path?: string): number | null {
  if (!path) return null;
  if (path === "/servers" || path.startsWith("/servers/")) return 0;
  if (path === "/swipe") return 1;
  if (path === "/friends" || path.startsWith("/friends/")) return 2;
  if (path === "/chirp") return 3;
  if (path === "/profile" || path.startsWith("/profile/")) return 4;
  return null;
}

export interface DialNavProps {
  badges?: DialBadges;
  /**
   * "home" (default): the big dial on the dial home — 264px on phones,
   * stepping back to 200px on md screens, and 360px on lg+ so it reads
   * as the centrepiece on PC. "shell": the compact ~190px dial pinned
   * in the left column inside sections on desktop (components/
   * DialShell); fixed size, no help caption.
   */
  size?: "home" | "shell";
  /**
   * Current pathname (shell use). The stop matching the route starts
   * at the notch and follows route changes, so the dial doubles as the
   * "you are here" indicator next to the open section.
   */
  activePath?: string;
}

export default function DialNav({
  badges,
  size: sizeProp = "home",
  activePath,
}: DialNavProps) {
  const router = useRouter();
  const accent = badges?.accentHex ?? FALLBACK_ACCENT;
  const accentStrong = readableAccent(accent);

  const routeIdx = stopIndexForPath(activePath);
  const [angle, setAngle] = useState<number>(() =>
    routeIdx !== null ? -routeIdx * SPACING : 0,
  );
  const [dragging, setDragging] = useState<boolean>(false);
  const [selIdx, setSelIdx] = useState<number>(() => routeIdx ?? 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerAngle: number;
    startAngle: number;
    lastTickAngle: number;
    moved: boolean;
  } | null>(null);
  const animRef = useRef<number>(0);
  const velRef = useRef<number>(0);
  const angleRef = useRef<number>(angle);
  angleRef.current = angle;

  const targetFor = (i: number): number => -i * SPACING;

  const nearestIndex = (a: number): number =>
    Math.round(-a / SPACING) % STOPS.length;

  const wrappedIndex = (a: number): number =>
    ((nearestIndex(a) % STOPS.length) + STOPS.length) % STOPS.length;

  const springTo = (
    from: number,
    to: number,
    velocity = 0,
    onDone?: () => void,
  ): void => {
    cancelAnimationFrame(animRef.current);
    let current = from;
    let v = velocity;
    let last = performance.now();
    // Real-dial return: as the spring drives the wheel back, the pulse
    // cam clicks roughly every 16° of travel over a governor whir, then
    // the wheel clunks into its rest stop (playLock).
    let lastTickAt = from;
    const travel = Math.abs(to - from);
    if (travel > 24) playDialWhir(Math.min(1, 0.25 + travel / 260));
    const step = (now: number): void => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const k = 170;
      const damping = 16;
      const f = -k * (current - to) - damping * v;
      v += f * dt;
      current += v * dt;
      setAngle(current);
      if (Math.abs(current - lastTickAt) >= 16) {
        lastTickAt = current;
        playTick();
      }
      if (Math.abs(current - to) > 0.05 || Math.abs(v) > 2) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setAngle(to);
        playLock();
        haptic(14);
        if (onDone) onDone();
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // Follow the route (shell dial): when navigation lands on a section,
  // rest that section's stop at the notch. A plain snap, no spring —
  // the tap that caused the navigation already played the full spin,
  // and arrow-key / link navigation shouldn't replay sounds. Dragging
  // the wheel to explore never changes the route, so it never trips
  // this effect.
  const prevRouteIdx = useRef<number | null>(routeIdx);
  useEffect(() => {
    if (routeIdx === prevRouteIdx.current) return;
    prevRouteIdx.current = routeIdx;
    if (routeIdx === null) return;
    cancelAnimationFrame(animRef.current);
    setSelIdx(routeIdx);
    setAngle(-routeIdx * SPACING);
  }, [routeIdx]);

  // Tap a stop (or arrow-key to it): spin it to the notch by the shortest
  // rotation, then navigate once the wheel has clunked into place.
  const goTo = (i: number): void => {
    const stop = STOPS[i];
    if (!stop) return;
    const cur = angleRef.current;
    const base = targetFor(i);
    const turns = Math.round((cur - base) / 360);
    setSelIdx(i);
    springTo(cur, base + turns * 360, 0, () => {
      router.push(stop.href);
    });
  };

  const pointerAngle = (e: ReactPointerEvent): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
  };

  const onPointerDown = (e: ReactPointerEvent): void => {
    cancelAnimationFrame(animRef.current);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerAngle: pointerAngle(e),
      startAngle: angleRef.current,
      lastTickAngle: angleRef.current,
      moved: false,
    };
    velRef.current = 0;
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const pa = pointerAngle(e);
    let diff = pa - d.pointerAngle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) > 2) d.moved = true;
    const next = d.startAngle + diff;
    velRef.current = next - angleRef.current;
    setAngle(next);
    // Ratchet ticks like a real rotary dial: the pawl clicks over a gear
    // tooth about every 13° of drag, so a slow pull ticks slowly and a
    // fast spin rattles — not one tick per stop.
    if (Math.abs(next - d.lastTickAngle) >= 13) {
      d.lastTickAngle = next;
      playTick();
      haptic(4);
    }
  };

  const endDrag = (): void => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const cur = angleRef.current;
    // A drag explores: on release the wheel springs to the nearest stop
    // and the readout follows — navigation is a tap's job (goTo).
    const idx = d.moved ? wrappedIndex(cur) : selIdx;
    const base = -idx * SPACING;
    const turns = Math.round((cur - base) / 360);
    if (d.moved) setSelIdx(idx);
    springTo(cur, base + turns * 360, d.moved ? velRef.current * 22 : 0);
  };

  // Home dial sizes: mobile keeps the full-size 264px touch dial; md
  // screens step it back to 200px; on lg+ the owner wants it BIG —
  // 360px, the centrepiece of the PC home. The shell dial is a fixed
  // compact 190px at every width (it only renders on lg+ anyway).
  const [homeDialSize, setHomeDialSize] = useState<number>(264);
  useEffect(() => {
    if (sizeProp === "shell") return;
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqMd = window.matchMedia("(min-width: 768px)");
    const apply = (): void =>
      setHomeDialSize(mqLg.matches ? 360 : mqMd.matches ? 200 : 264);
    apply();
    mqLg.addEventListener("change", apply);
    mqMd.addEventListener("change", apply);
    return () => {
      mqLg.removeEventListener("change", apply);
      mqMd.removeEventListener("change", apply);
    };
  }, [sizeProp]);
  const size = sizeProp === "shell" ? 190 : homeDialSize;
  const radius = size / 2 - 44 * (size / 264);
  const activeIdx = wrappedIndex(angle);

  return (
    <div className="flex flex-col items-center select-none">
      <div
        ref={wrapRef}
        role="slider"
        aria-label="Page dial"
        aria-valuetext={STOPS[activeIdx]?.label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            goTo((selIdx + 1) % STOPS.length);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            goTo((selIdx - 1 + STOPS.length) % STOPS.length);
          }
        }}
        className={`relative touch-none outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 rounded-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Top notch marker */}
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 -top-1 z-10"
          style={{
            width: 0,
            height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: `13px solid ${accent}`,
          }}
        />
        {/* Dial face (rotates; stops are positioned from the same angle
            in wrapper coordinates, so their labels stay upright) */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border shadow-[inset_0_2px_10px_rgba(0,0,0,0.08),0_10px_30px_rgba(0,0,0,0.10)]"
          style={{
            background: FACE,
            borderColor: RING,
            borderWidth: 2,
            transform: `rotate(${angle}deg)`,
          }}
        >
          {/* tick marks */}
          {Array.from({ length: 36 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                width: i % 3 === 0 ? 3 : 2,
                height: i % 3 === 0 ? 12 : 7,
                marginLeft: i % 3 === 0 ? -1.5 : -1,
                background: DIM,
                opacity: i % 3 === 0 ? 0.55 : 0.3,
                borderRadius: 2,
                transform: `rotate(${i * 10}deg) translateY(${-(size / 2 - 16)}px)`,
                transformOrigin: "center top",
              }}
            />
          ))}
          {/* grip ridges near rim */}
          <div
            className="absolute inset-3 rounded-full border border-dashed"
            style={{ borderColor: RING }}
          />
        </div>
        {/* Stops (labels stay upright; the stop at the notch is active) */}
        {STOPS.map((stop, i) => {
          const stopAngle = angle + i * SPACING;
          const rad = (stopAngle * Math.PI) / 180;
          const x = Math.sin(rad) * radius;
          const y = -Math.cos(rad) * radius;
          const active = Math.abs(delta(0, stopAngle)) < HALF + 1;
          const count = badges?.counts[stop.href] ?? 0;
          return (
            <button
              key={stop.href}
              type="button"
              aria-label={`Go to ${stop.label}${count > 0 ? ` (${count} unread)` : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-10 flex flex-col items-center justify-center rounded-full transition-transform"
              style={{
                width: 76 * (size / 264),
                height: 76 * (size / 264),
                left: size / 2 + x - 38 * (size / 264),
                top: size / 2 + y - 38 * (size / 264),
                transform: `scale(${active ? 1.12 : 0.92})`,
              }}
            >
              <span
                className="relative flex items-center justify-center rounded-full border-2 shadow-sm"
                style={{
                  width: 52 * (size / 264),
                  height: 52 * (size / 264),
                  color: active ? "#ffffff" : TEXT,
                  background: active ? accent : SURFACE,
                  borderColor: active ? accentStrong : BORDER,
                }}
              >
                <DialIcon d={stop.iconPath} circle={stop.iconCircle} />
                {count > 0 ? (
                  <span
                    role="status"
                    aria-label={`${count} unread in ${stop.label}`}
                    className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center tabular-nums"
                    style={{ background: accent }}
                  >
                    {badgeLabel(count)}
                  </span>
                ) : null}
              </span>
              <span
                className="mt-1 text-[11px] font-semibold"
                style={{ color: active ? accentStrong : DIM }}
              >
                {stop.label}
              </span>
              <span className="sr-only">{active ? "(selected)" : ""}</span>
            </button>
          );
        })}
        {/* Centre hub — fixed readout: the stop resting at the notch */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center shadow-inner"
          style={{
            width: 74 * (size / 264),
            height: 74 * (size / 264),
            background: SURFACE_2,
            border: `2px solid ${RING}`,
          }}
        >
          <span
            className="px-1 text-center font-extrabold leading-tight tracking-tight"
            style={{ color: accentStrong, fontSize: 13 * (size / 264) }}
          >
            {STOPS[activeIdx]?.label ?? "OneUCo"}
          </span>
        </div>
      </div>
      {sizeProp === "shell" ? null : (
        <p
          className="mt-3 text-xs md:mt-2 md:text-[11px]"
          style={{ color: DIM }}
        >
          Drag the dial, flick it, or tap a stop — it clicks and whirs like
          a real rotary dial
        </p>
      )}
    </div>
  );
}
