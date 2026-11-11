"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { getTheme } from "@/lib/themes";
import {
  dialSkinItems,
  getDialSkin,
  type DialSkinItem,
  type DialSkinKind,
} from "@/lib/dial-skins";
import { setMyDialSkinAction } from "@/app/profile/theme-actions";
import { PAGE_INTROS, type PageIntroSection } from "@/lib/page-intros";

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

/**
 * The applied interface's dial palette (lib/themes.ts tokens, resolved
 * server-side in lib/dial-badges). When present, the dial wears the
 * interface: skin face/ring/ticks/glow plus its surface/text tones.
 * Absent in seasonal-auto — the dial renders in its classic palette.
 */
export interface DialThemePalette {
  face: string;
  ring: string;
  tick: string;
  glow: string;
  blur: string;
  surface: string;
  surface2: string;
  text: string;
  dim: string;
  border: string;
  /** Optional centre-hub cap background (gold skins). → surface2. */
  cap?: string;
  /** Optional centre-hub border colour (gold skins). → ring. */
  capRing?: string;
  /** Optional extra glow layered under the active stop's hue glow. */
  activeGlow?: string;
  /** Optional inactive stop-label colour (bright/dark faces). → dim. */
  label?: string;
}

/**
 * What the dial needs for its long-press WHEEL-STYLE MODE: the user's
 * own saved interface pick, the interface currently applied to them,
 * the admin's app-wide default (for the "Auto" wheel's sub-label),
 * and the user's saved dial wheel skin (profiles.dial_skin).
 */
export interface DialThemePicker {
  savedId: string | null;
  appliedId: string | null;
  defaultId: string | null;
  /** profiles.dial_skin — 'auto' follows the interface's own skin. */
  skinId: import("@/lib/dial-skins").DialSkinId;
}

/**
 * A wheel skin resolved to render tokens (lib/dial-skins), shipped on
 * the badges when the user has picked one: DialNav layers it over the
 * interface palette (or the classic constants) so the wheel wears it
 * while the app keeps the interface. `kind` selects the drawn
 * furniture (spokes / handles / stripes) in DialSkinDecor.
 */
export interface DialSkinPalette {
  kind: DialSkinKind;
  face: string;
  ring: string;
  tick: string;
  glow: string;
  blur: string;
  cap?: string;
  capRing?: string;
  activeGlow?: string;
  label?: string;
}

export interface DialBadges {
  counts: Record<string, number>;
  accentHex: string;
  theme?: DialThemePalette;
  /** The user's saved wheel skin override (absent = 'auto'). */
  dialSkin?: DialSkinPalette;
}

/**
 * The five badge-ring structures — one per stop, same family and
 * weight, different geometry (DialBadgeRing). Drawn in the ACTIVE
 * interface's metal (--metal-ring / --metal-accent, lib/themes.ts),
 * so the stop circles visibly belong to the current interface.
 */
type BadgeRingVariant = "double" | "beads" | "dashed" | "ticks" | "thick";

export interface DialStopDef {
  label: string;
  href: string;
  /**
   * Stroke sub-drawings of the stop's icon: each entry is one <path>
   * rendered by DialIcon. Bold hand — thick strokes, few shapes.
   */
  iconPaths: string[];
  /**
   * Filled accent sub-drawings (the spill drop, the shades band, the
   * clasped hands, the swift's body): solid shapes that carry the
   * read at small sizes where a stroke would vanish.
   */
  iconFills?: string[];
  /** This stop's badge-ring structure (DialBadgeRing). */
  ring: BadgeRingVariant;
  /**
   * The stop's own hue, as the CSS variable defined in globals.css
   * (--stop-*). Colours the stop's label and active indicator in
   * every interface; themes may override the variables, none must.
   */
  accentVar: string;
}

// Bold stroke icons, one consistent hand (redrawn 2026-11-10 after
// the owner rejected the first, finer set live: "make them big" —
// thick 2.4 strokes on the 24-grid, generous shapes, few internal
// details, solid filled accents where a stroke would vanish at
// stop size). Each glyph is render-tested at ~36px and ~22px.
export const STOPS: DialStopDef[] = [
  {
    label: "Tea",
    href: "/servers",
    accentVar: "var(--stop-servers)",
    ring: "double",
    // A big cup with the tea sloshing out over its left rim: the
    // pour wave down the outside, one fat filled drop mid-fall, and
    // the puddle wave it lands in.
    iconPaths: [
      "M7.5 8.5h11l-1 9a2.8 2.8 0 0 1-2.8 2.5h-3.4A2.8 2.8 0 0 1 8.5 17.5l-1-9z",
      "M18.2 11h1a2.6 2.6 0 0 1 0 5.2h-1.3",
      "M7.8 8.3c-2 .2-3 1.5-2.9 3.1.1 1.5.2 2.7-.4 4.1",
      "M1.8 21.4c1.7-1 3.5-1 5.2 0",
    ],
    iconFills: [
      "M3.1 15.4c.9 1.3 1.5 2.2 1.5 3a1.5 1.5 0 1 1-3 0c0-.8.6-1.7 1.5-3z",
    ],
  },
  {
    label: "Fling",
    href: "/swipe",
    accentVar: "var(--stop-swipe)",
    ring: "beads",
    // A girl and a boy facing each other, holding hands at the
    // centre: round heads, her triangle dress, his straight legs,
    // both inner arms meeting at the filled clasped-hands dot.
    iconPaths: [
      "M4.2 5.8a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0",
      "M6.5 8.6L3.6 18.6h5.8L6.5 8.6z",
      "M5.2 18.6v2.2M7.8 18.6v2.2",
      "M8.6 11.8L11 13.8",
      "M15.2 5.8a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0",
      "M17.5 8.4v6.2",
      "M17.5 14.6l-2.3 6M17.5 14.6l2.3 6",
      "M15.4 11.8L13 13.8",
    ],
    iconFills: [
      "M12 12.7a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6z",
    ],
  },
  {
    label: "Homies",
    href: "/friends",
    accentVar: "var(--stop-friends)",
    ring: "dashed",
    // The homie, bold edition: bucket hat (crown + one thick brim
    // line), a SOLID sunglasses band across the face, takeaway cup
    // in one hand, legs mid-stride. (A phone in the other hand was
    // drawn, then cut in the render test — it read as noise.)
    iconPaths: [
      "M8 7V5.4A1.9 1.9 0 0 1 9.9 3.5h4.2A1.9 1.9 0 0 1 16 5.4V7",
      "M3.8 7h16.4",
      "M8 7v2.4c0 2.2 1.8 3.6 4 3.6s4-1.4 4-3.6V7",
      "M12 13.2v3.6",
      "M12.3 14.6l3.4 1.3",
      "M15.2 14.9h3.4l-.4 4h-2.6l-.4-4z",
      "M11.7 14.6L8.6 17.2",
      "M12 16.8l-3.2 4.5",
      "M12 16.8l3.4 1.7 1.2 2.9",
    ],
    iconFills: [
      "M8.1 8.9h7.8a.9.9 0 0 1 .9.9v.7a1.6 1.6 0 0 1-1.6 1.6H8.8a1.6 1.6 0 0 1-1.6-1.6v-.7a.9.9 0 0 1 .9-.9z",
    ],
  },
  {
    label: "Chirp",
    href: "/chirp",
    accentVar: "var(--stop-chirp)",
    ring: "ticks",
    // A swift in a glide, nothing else (owner, 2026-11-10: first a
    // singing bird at a mic, then "a hummingbird, just", then "or a
    // swift" — both birds were drawn and render-tested at 36/22px;
    // the swift's crescent read cleanly at 22px, the hummingbird
    // fused twice, so the swift shipped): two long scythe wings as
    // closed crescent leaves, one solid teardrop body, short forked
    // tail.
    iconPaths: [
      "M11.7 11C8.4 7.8 5.4 6 2.2 5.6c1.2 3.4 3.7 6.1 7 7.7 1.2.6 2.6-.6 2.5-2.3z",
      "M12.3 11c3.3-3.2 6.3-5 9.5-5.4-1.2 3.4-3.7 6.1-7 7.7-1.2.6-2.6-.6-2.5-2.3z",
      "M11.3 16.7L9.5 20.2",
      "M12.7 16.7l1.8 3.5",
    ],
    iconFills: [
      "M12 10.2c1.3 0 2.1 1 2.1 2.3 0 1.9-.9 3.6-2.1 4.6-1.2-1-2.1-2.7-2.1-4.6 0-1.3.8-2.3 2.1-2.3z",
    ],
  },
  {
    label: "Profile",
    href: "/profile",
    accentVar: "var(--stop-profile)",
    ring: "thick",
    // The person, redrawn in the same bold hand: big round head,
    // one generous shoulder arc.
    iconPaths: [
      "M12 11.2a3.3 3.3 0 1 0 0-6.6a3.3 3.3 0 1 0 0 6.6z",
      "M5.2 20.2c.9-3.8 3.6-5.7 6.8-5.7s5.9 1.9 6.8 5.7",
    ],
  },
];

const SPACING = 360 / STOPS.length; // 72° between the five stops
const HALF = SPACING / 2;

// The brief info line shown above the home dial (lib/page-intros —
// the same text each section page carries at its top). Keyed by stop
// position, aligned with STOPS above.
const STOP_INTRO_KEYS: PageIntroSection[] = [
  "servers",
  "swipe",
  "friends",
  "chirp",
  "profile",
];

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

function DialIcon({
  paths,
  fills,
  px,
}: {
  paths: string[];
  fills?: string[];
  /** Rendered size in px — ~0.6 of the stop badge's diameter. */
  px: number;
}) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
      {fills
        ? fills.map((p, i) => (
            <path key={`f${i}`} d={p} fill="currentColor" stroke="none" />
          ))
        : null}
    </svg>
  );
}

/**
 * A stop's badge ring — the round structure around its icon. Every
 * stop gets a DIFFERENT geometry (the owner's ask) in the same
 * weight and family, drawn in the ACTIVE interface's metal tokens:
 * the main ring wears --metal-ring, the secondary marks
 * --metal-accent, so the circles visibly belong to whichever
 * interface is applied (Midnight = bronze ring + polished-gold
 * marks; themes without their own metal derive both from their
 * accent/border — lib/themes.ts themeCssVars). Identical in idle
 * and active states — the active stop's hue lives in the badge
 * FILL behind this ring, never in the ring itself. Drawn on a
 * 60-grid over the badge; pointer-events-none + aria-hidden.
 */
function DialBadgeRing({ variant }: { variant: BadgeRingVariant }) {
  const metalRing = { stroke: "var(--metal-ring)" } as CSSProperties;
  const metalAccent = { stroke: "var(--metal-accent)" } as CSSProperties;
  const metalAccentFill = {
    fill: "var(--metal-accent)",
  } as CSSProperties;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 60 60"
      fill="none"
      strokeLinecap="round"
      aria-hidden
    >
      {variant === "double" ? (
        <>
          {/* Tea — two concentric rings. */}
          <circle cx="30" cy="30" r="28" strokeWidth="2.6" style={metalRing} />
          <circle cx="30" cy="30" r="23" strokeWidth="1.7" style={metalAccent} />
        </>
      ) : variant === "beads" ? (
        <>
          {/* Fling — one ring, two beads riding it at the top. */}
          <circle cx="30" cy="30" r="28" strokeWidth="2.6" style={metalRing} />
          <circle cx="17.7" cy="4.8" r="3" stroke="none" style={metalAccentFill} />
          <circle cx="42.3" cy="4.8" r="3" stroke="none" style={metalAccentFill} />
        </>
      ) : variant === "dashed" ? (
        <>
          {/* Homies — a dashed ring, streetwear stitch. */}
          <circle
            cx="30"
            cy="30"
            r="28"
            strokeWidth="2.6"
            strokeDasharray="6.5 4.5"
            style={metalRing}
          />
        </>
      ) : variant === "ticks" ? (
        <>
          {/* Chirp — a ring with short tick notches inside it,
              a little sound-wave / clock engraving. */}
          <circle cx="30" cy="30" r="28" strokeWidth="2.6" style={metalRing} />
          {Array.from({ length: 8 }).map((_, i) => {
            const rad = (i * 45 * Math.PI) / 180;
            const x1 = 30 + 23.5 * Math.sin(rad);
            const y1 = 30 - 23.5 * Math.cos(rad);
            const x2 = 30 + 26.3 * Math.sin(rad);
            const y2 = 30 - 26.3 * Math.cos(rad);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth="2.2"
                style={metalAccent}
              />
            );
          })}
        </>
      ) : (
        <>
          {/* Profile — one single thick ring. */}
          <circle cx="30" cy="30" r="27" strokeWidth="4.6" style={metalRing} />
        </>
      )}
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
 * Which stop a route belongs to (Tea /servers*, Fling /swipe,
 * Homies /friends*, Chirp /chirp, Profile /profile*). Anything else —
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
  /**
   * Wheel-style state (lib/dial-badges). When provided, a long-press
   * on the dial switches it into wheel-style mode: the stops become
   * the dial wheel skins (lib/dial-skins), drag-rotating previews
   * each one live on the wheel, and tapping the centre saves the
   * pick to the user's profile (profiles.dial_skin). Absent → no
   * wheel-style mode. (Full interfaces are picked in Profile
   * settings — components/InterfacePicker.)
   */
  themePicker?: DialThemePicker;
}

/**
 * The drawn furniture of a wheel skin (lib/dial-skins): spokes,
 * handles, stripes — pure CSS shapes, no images, no logos. Rendered
 * INSIDE the rotating face layer (so it turns with the wheel, under
 * the stops at z-10 and the hub at z-20) and always
 * pointer-events-none + aria-hidden: it can never block a stop tap
 * or reach a screen reader. Each spoke is a bar in a full-face
 * wrapper rotated to its angle, running from just outside the hub to
 * just inside the rim.
 */
function DialSkinDecor({
  kind,
  size,
  skin,
}: {
  kind: DialSkinKind;
  size: number;
  skin: DialSkinPalette;
}) {
  const s = size / 264;
  const rimIn = 12 * s; // bar starts this far inside the rim
  const hubOut = 34 * s; // …and ends this far from the centre
  const barLen = size / 2 - rimIn - hubOut;
  const spoke = (
    angle: number,
    width: number,
    background: string,
    key: string,
    extra?: CSSProperties,
  ) => (
    <div
      key={key}
      className="absolute inset-0"
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <div
        className="absolute left-1/2 rounded-full"
        style={{
          width,
          height: barLen,
          marginLeft: -width / 2,
          top: rimIn,
          background,
          ...extra,
        }}
      />
    </div>
  );
  const ringLine = (
    inset: number,
    width: number,
    color: string,
    key: string,
    dashed = false,
  ) => (
    <div
      key={key}
      aria-hidden
      className="absolute rounded-full"
      style={{
        inset,
        border: `${width}px ${dashed ? "dashed" : "solid"} ${color}`,
      }}
    />
  );

  switch (kind) {
    case "pirate": {
      const wood =
        "linear-gradient(90deg, #54300e, #8a5a24 45%, #a06a2c 55%, #54300e)";
      return (
        <>
          {/* Eight timber spokes, hub to rim. */}
          {Array.from({ length: 8 }).map((_, i) =>
            spoke(i * 45, 11 * s, wood, `spoke-${i}`),
          )}
          {/* A brass band just inside the rim. */}
          {ringLine(7 * s, 3, skin.ring, "band")}
          {/* Eight protruding handles OUTSIDE the rim — the classic
              ship's-wheel grips. They live in the rotating layer and
              are pointer-events-none like everything here. */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`handle-${i}`}
              className="absolute inset-0"
              style={{ transform: `rotate(${i * 45 + 22.5}deg)` }}
            >
              <div
                className="absolute left-1/2 rounded-full"
                style={{
                  width: 13 * s,
                  height: 34 * s,
                  marginLeft: -6.5 * s,
                  top: -30 * s,
                  background:
                    "linear-gradient(90deg, #4a2b0e, #96622a 50%, #4a2b0e)",
                  boxShadow:
                    "inset 0 6px 0 #b08a3e, inset 0 -5px 0 rgba(0,0,0,0.45)",
                }}
              />
            </div>
          ))}
        </>
      );
    }
    case "munich": {
      const leather =
        "linear-gradient(90deg, #3f3f46, #17171a 22%, #101012 78%, #3f3f46)";
      return (
        <>
          {/* Thick grip shadow just inside the rim. */}
          {ringLine(3 * s, 9 * s, "rgba(0, 0, 0, 0.38)", "grip")}
          {/* Three-spoke sport wheel: bottom + two upper spokes. */}
          {spoke(180, 30 * s, leather, "spoke-bottom")}
          {spoke(58, 26 * s, leather, "spoke-left")}
          {spoke(-58, 26 * s, leather, "spoke-right")}
        </>
      );
    }
    case "stuttgart": {
      const chrome =
        "linear-gradient(90deg, #8e8e94, #f5f5f4 45%, #d6d3d1 55%, #83838a)";
      return (
        <>
          {/* Dark-wood inlay band with a chrome hairline. */}
          {ringLine(16 * s, 6 * s, "#4a2c14", "wood")}
          {ringLine(11 * s, 1.5, "rgba(214, 211, 209, 0.5)", "hairline")}
          {/* Slim chrome spokes: a horizontal pair + one below. */}
          {spoke(90, 8 * s, chrome, "spoke-left")}
          {spoke(-90, 8 * s, chrome, "spoke-right")}
          {spoke(180, 8 * s, chrome, "spoke-bottom")}
        </>
      );
    }
    case "racing": {
      return (
        <>
          {/* Yellow stitching ring (dashed) inside the grip. */}
          {ringLine(8 * s, 2, "rgba(250, 204, 21, 0.75)", "stitch", true)}
          {/* Flat-bottom chord: a straight carbon bar across the
              lower rim, suggesting the cut-off racing rim. */}
          <div
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: "19%",
              right: "19%",
              bottom: 13 * s,
              height: 12 * s,
              background:
                "linear-gradient(180deg, #1f1f23, #0a0a0b)",
              boxShadow: "inset 0 1px 0 rgba(250, 204, 21, 0.35)",
            }}
          />
          {/* Chunky lower grips. */}
          {spoke(140, 24 * s, "#101013", "grip-left")}
          {spoke(-140, 24 * s, "#101013", "grip-right")}
          {/* The red centre stripe at the top of the rim — it turns
              with the wheel, like the real thing. */}
          <div
            aria-hidden
            className="absolute left-1/2 rounded-full"
            style={{
              width: 11 * s,
              height: 30 * s,
              marginLeft: -5.5 * s,
              top: 2 * s,
              background:
                "linear-gradient(180deg, #ef4444, #b91c1c)",
            }}
          />
        </>
      );
    }
    case "vintage": {
      const chrome =
        "linear-gradient(90deg, #9aa0a8, #f4f6f8 45%, #d8dce2 55%, #8b9096)";
      return (
        <>
          {/* Thin chrome inner ring on the cream face. */}
          {ringLine(6 * s, 2, "#c3c9d1", "rim")}
          {/* Retro two-spoke: one slim chrome bar across. */}
          {spoke(90, 7 * s, chrome, "spoke-left")}
          {spoke(-90, 7 * s, chrome, "spoke-right")}
        </>
      );
    }
    default:
      return null;
  }
}

export default function DialNav({
  badges,
  size: sizeProp = "home",
  activePath,
  themePicker,
}: DialNavProps) {
  const router = useRouter();

  // ── Wheel-style mode ──────────────────────────────────────────────
  // The wheel's second life: a long-press turns the stops into the
  // WHEEL SKINS (lib/dial-skins) — 'Auto' (the applied interface's own
  // skin) plus Pirate Helm, Munich Sport, Stuttgart Luxe, Racing GT
  // and Vintage Classic. Drag-rotating previews each skin ON THE WHEEL
  // ONLY (the app's interface never changes), and tapping the centre
  // saves the centred skin to profiles.dial_skin. Full-interface
  // switching lives in Profile settings (components/InterfacePicker).
  const appliedThemeForSkin = getTheme(themePicker?.appliedId ?? null);
  const skinItems: ReadonlyArray<DialSkinItem> = dialSkinItems(
    appliedThemeForSkin
      ? `${appliedThemeForSkin.dialSkin} · ${appliedThemeForSkin.name}`
      : "Seasonal look",
  );
  const SKIN_COUNT = skinItems.length;
  const SSPACING = 360 / SKIN_COUNT;
  const [skinMode, setSkinMode] = useState<boolean>(false);
  const [skinIdx, setSkinIdx] = useState<number>(0);
  const [savedSkin, setSavedSkin] = useState<
    import("@/lib/dial-skins").DialSkinId
  >(themePicker?.skinId ?? "auto");
  const [enteredPulse, setEnteredPulse] = useState<boolean>(false);
  const skinModeRef = useRef<boolean>(false);
  skinModeRef.current = skinMode;
  const skinIdxRef = useRef<number>(0);
  const enteredPathRef = useRef<string | undefined>(undefined);
  const pressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef<boolean>(false);

  // The skin the wheel wears right now: the previewed one while
  // browsing the mode, else the saved pick. The pick is resolved
  // from lib/dial-skins locally (instant, optimistic after a save)
  // and cross-checked against the server-resolved palette riding on
  // badges — both describe the same skin; the local read just never
  // lags a refresh. 'auto' wears nothing — the wheel falls back to
  // the interface palette untouched.
  const skinPaletteFor = (
    item: DialSkinItem | undefined,
  ): DialSkinPalette | null => {
    const skin = item?.skin ?? null;
    return skin ? { kind: skin.id, ...skin.tokens } : null;
  };
  const savedSkinObj = getDialSkin(savedSkin);
  const wornSkin: DialSkinPalette | null = savedSkinObj
    ? { kind: savedSkinObj.id, ...savedSkinObj.tokens }
    : (badges?.dialSkin ?? null);
  const activeSkin: DialSkinPalette | null = skinMode
    ? skinPaletteFor(skinItems[skinIdx])
    : wornSkin;

  // Palette: the interface riding on badges (or the classic demo
  // constants), with the active wheel skin's dial tokens layered over
  // it. Surface/text tones ALWAYS come from the interface — a wheel
  // skin never repaints the app, only the wheel.
  const basePal: DialThemePalette | undefined = badges?.theme;
  const pal: DialThemePalette | undefined = activeSkin
    ? {
        face: activeSkin.face,
        ring: activeSkin.ring,
        tick: activeSkin.tick,
        glow: activeSkin.glow,
        blur: activeSkin.blur,
        cap: activeSkin.cap,
        capRing: activeSkin.capRing,
        activeGlow: activeSkin.activeGlow,
        label: activeSkin.label,
        surface: basePal?.surface ?? SURFACE,
        surface2: basePal?.surface2 ?? SURFACE_2,
        text: basePal?.text ?? TEXT,
        dim: basePal?.dim ?? DIM,
        border: basePal?.border ?? BORDER,
      }
    : basePal;
  const skinKind: DialSkinKind | null = activeSkin?.kind ?? null;
  const face = pal?.face ?? FACE;
  const ring = pal?.ring ?? RING;
  const tick = pal?.tick ?? DIM;
  const glow = pal?.glow ?? "none";
  const blur = pal?.blur ?? "";
  const surf = pal?.surface ?? SURFACE;
  const surf2 = pal?.surface2 ?? SURFACE_2;
  const textTone = pal?.text ?? TEXT;
  const dim = pal?.dim ?? DIM;
  const borderTone = pal?.border ?? BORDER;
  // Gold-skin extras — every one falls back to the classic treatment,
  // so skins that don't set them render exactly as before.
  const cap = pal?.cap ?? surf2;
  const capRing = pal?.capRing ?? ring;
  const skinActiveGlow = pal?.activeGlow;
  const labelTone = pal?.label ?? dim;

  const accent = badges?.accentHex ?? FALLBACK_ACCENT;
  const accentStrong = readableAccent(accent);

  const routeIdx = stopIndexForPath(activePath);
  const [angle, setAngle] = useState<number>(() =>
    routeIdx !== null ? -routeIdx * SPACING : 0,
  );
  const [dragging, setDragging] = useState<boolean>(false);
  const [selIdx, setSelIdx] = useState<number>(() => routeIdx ?? 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Pending tap navigation (see goTo): the push races the spring and
  // fires at this cap at the latest, so a tap never waits out the
  // spring's full settle tail.
  const navTimerRef = useRef<number | null>(null);
  const clearNavTimer = (): void => {
    if (navTimerRef.current !== null) {
      window.clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
  };
  const drag = useRef<{
    pointerAngle: number;
    startAngle: number;
    lastTickAngle: number;
    moved: boolean;
    /** Set when a long-press fired mid-press: the release is spent. */
    consumed: boolean;
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

  useEffect(
    () => () => {
      cancelAnimationFrame(animRef.current);
      clearNavTimer();
    },
    [],
  );

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
    // In wheel-style mode the wheel belongs to the skins; the
    // route-exit effect below cancels the mode rather than letting
    // the wheel snap mid-browse.
    if (skinModeRef.current) return;
    cancelAnimationFrame(animRef.current);
    setSelIdx(routeIdx);
    setAngle(-routeIdx * SPACING);
  }, [routeIdx]);

  // Tap a stop (or arrow-key to it): spin it to the notch by the shortest
  // rotation, then navigate once the wheel has clunked into place —
  // OR after NAV_DELAY_MS, whichever comes first. The push used to
  // wait for the spring's FULL settle (|angle error| ≤ 0.05° and
  // |velocity| ≤ 2°/s under k=170 / damping=16), whose asymptotic tail
  // stretched a far tap (up to ~180° of travel) into 4–5 seconds of
  // spin before the page changed. Decoupled now: the spring keeps its
  // exact feel for near stops (they settle, clunk, and navigate as
  // before), while the timer guarantees navigation starts within
  // 900ms of the tap for far ones. A newer tap, a grab of the dial,
  // entering wheel-style mode or unmounting cancels a pending push.
  const NAV_DELAY_MS = 900;
  const goTo = (i: number): void => {
    const stop = STOPS[i];
    if (!stop) return;
    const cur = angleRef.current;
    const base = targetFor(i);
    const turns = Math.round((cur - base) / 360);
    setSelIdx(i);
    clearNavTimer();
    let navigated = false;
    const doNav = (): void => {
      if (navigated) return;
      navigated = true;
      clearNavTimer();
      router.push(stop.href);
    };
    navTimerRef.current = window.setTimeout(doNav, NAV_DELAY_MS);
    springTo(cur, base + turns * 360, 0, doNav);
  };

  // ── Wheel-style mode ──────────────────────────────────────────────
  // Long-press (~500ms, no movement) on the dial face or any stop
  // enters it; the press that triggered it is consumed so it can
  // neither drag nor navigate. Inside: drag rotates between wheel
  // skins (snap per skin), every landing re-skins the WHEEL live
  // (palette state only — the app's interface is never touched),
  // tapping the centre hub saves the centred skin as the user's own
  // pick (profiles.dial_skin), and ✕ / route change cancels back to
  // the saved skin.

  const skinIndexFor = (a: number): number =>
    ((Math.round(-a / SSPACING) % SKIN_COUNT) + SKIN_COUNT) % SKIN_COUNT;

  const clearPressTimer = (): void => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  /** Spring the wheel back to the current section stop (mode exit). */
  const springBackToSection = (): void => {
    const idx = routeIdx ?? selIdx;
    const cur = angleRef.current;
    const base = -idx * SPACING;
    const turns = Math.round((cur - base) / 360);
    springTo(cur, base + turns * 360);
  };

  const enterSkinMode = (): void => {
    if (!themePicker || skinModeRef.current) return;
    clearNavTimer();
    enteredPathRef.current = activePath;
    // Start on the user's saved skin — the centred entry is what a
    // tap would save.
    const found = skinItems.findIndex((item) => item.id === savedSkin);
    const startIdx = found >= 0 ? found : 0;
    skinIdxRef.current = startIdx;
    setSkinIdx(startIdx);
    setSkinMode(true);
    cancelAnimationFrame(animRef.current);
    setAngle(-startIdx * SSPACING);
    playLock();
    haptic(30);
    setEnteredPulse(true);
    window.setTimeout(() => setEnteredPulse(false), 240);
  };

  const exitSkinCancel = (): void => {
    suppressClickRef.current = false;
    setSkinMode(false);
    springBackToSection();
  };

  const confirmSkin = (): void => {
    const item = skinItems[skinIdxRef.current];
    if (!item) return;
    // Optimistic: the wheel already wears the preview; keep wearing
    // it as the saved pick while the action persists it. The server
    // re-ships the identical skin on the next render (dial-badges).
    suppressClickRef.current = false;
    setSkinMode(false);
    setSavedSkin(item.id);
    playLock();
    haptic(20);
    springBackToSection();
    void setMyDialSkinAction(item.id).then(() => router.refresh());
  };

  /** Keyboard / programmatic wheel-style step (skin mode only). */
  const stepSkin = (step: number): void => {
    const idx =
      ((skinIdxRef.current + step) % SKIN_COUNT + SKIN_COUNT) % SKIN_COUNT;
    skinIdxRef.current = idx;
    setSkinIdx(idx);
    const cur = angleRef.current;
    const base = -idx * SSPACING;
    const turns = Math.round((cur - base) / 360);
    springTo(cur, base + turns * 360);
  };

  // Leaving the route mid-browse cancels (the saved skin stands).
  useEffect(() => {
    if (!skinMode) return;
    if (
      enteredPathRef.current !== undefined &&
      activePath !== enteredPathRef.current
    ) {
      exitSkinCancel();
    }
    // exitSkinCancel is stable enough for this guard's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, skinMode]);

  // Keep the local saved-skin state in step with the server value
  // (e.g. after the saver's own refresh, or a settings-list change).
  useEffect(() => {
    if (themePicker?.skinId) setSavedSkin(themePicker.skinId);
  }, [themePicker?.skinId]);

  const pointerAngle = (e: ReactPointerEvent): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
  };

  const onPointerDown = (e: ReactPointerEvent): void => {
    cancelAnimationFrame(animRef.current);
    // Grabbing the dial to explore supersedes a pending tap push.
    clearNavTimer();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerAngle: pointerAngle(e),
      startAngle: angleRef.current,
      lastTickAngle: angleRef.current,
      moved: false,
      consumed: false,
    };
    velRef.current = 0;
    setDragging(true);
    // Long-press → wheel-style mode. Armed only outside the mode and
    // only when the picker is wired; any real movement disarms it
    // (onPointerMove), so it never fights drag-to-spin.
    if (!skinModeRef.current && themePicker) {
      clearPressTimer();
      pressTimerRef.current = window.setTimeout(() => {
        pressTimerRef.current = null;
        if (drag.current) drag.current.consumed = true;
        suppressClickRef.current = true;
        enterSkinMode();
      }, 500);
    }
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const pa = pointerAngle(e);
    let diff = pa - d.pointerAngle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) > 2) {
      d.moved = true;
      clearPressTimer();
    }
    const next = d.startAngle + diff;
    velRef.current = next - angleRef.current;
    setAngle(next);
    if (skinModeRef.current) {
      // Browsing wheel skins: every landing re-skins the wheel + ticks.
      const idx = skinIndexFor(next);
      if (idx !== skinIdxRef.current) {
        skinIdxRef.current = idx;
        setSkinIdx(idx);
        playTick();
        haptic(4);
      }
      return;
    }
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
    clearPressTimer();
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    // The long-press that opened wheel-style mode spends this release.
    if (d.consumed) return;
    const cur = angleRef.current;
    if (skinModeRef.current) {
      // Settle on the nearest skin; its preview is already live.
      const idx = d.moved ? skinIndexFor(cur) : skinIdxRef.current;
      if (d.moved) {
        skinIdxRef.current = idx;
        setSkinIdx(idx);
      }
      const base = -idx * SSPACING;
      const turns = Math.round((cur - base) / 360);
      springTo(cur, base + turns * 360, d.moved ? velRef.current * 22 : 0);
      return;
    }
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
  // 360px, the centrepiece of the PC home — but ALSO capped by the
  // viewport HEIGHT: on laptop-height screens (~700px tall) a 360px
  // dial plus header, search, intro and footer crowds the column, so
  // on lg the dial takes at most ~52% of the viewport height
  // (min(360px, 52dvh)) and tracks window resizes. The shell dial is
  // a fixed compact 190px at every width (it only renders on lg+
  // anyway) and is not height-capped.
  const [homeDialSize, setHomeDialSize] = useState<number>(264);
  useEffect(() => {
    if (sizeProp === "shell") return;
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqMd = window.matchMedia("(min-width: 768px)");
    const apply = (): void => {
      if (mqLg.matches) {
        setHomeDialSize(
          Math.min(360, Math.round(window.innerHeight * 0.52)),
        );
      } else {
        setHomeDialSize(mqMd.matches ? 200 : 264);
      }
    };
    apply();
    mqLg.addEventListener("change", apply);
    mqMd.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mqLg.removeEventListener("change", apply);
      mqMd.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, [sizeProp]);
  const size = sizeProp === "shell" ? 190 : homeDialSize;
  // Reserved space around the dial box (applied as its top/bottom
  // margin below). A wheel skin's furniture can protrude past the
  // rim — the Pirate Helm's handles reach 30 * (size / 264) px
  // beyond the face (see DialSkinDecor) — and spinning handles were
  // covering the intro line above the home dial and the hint below
  // it (owner screenshot, 2026-11-10). Reserving the maximum
  // protrusion + a 4px buffer in the layout means the dial's true
  // footprint includes its furniture: text above/below can NEVER be
  // overlapped, at home size and docked size alike. Only the pirate
  // skin protrudes today; the reservation is unconditional, so any
  // future skin inherits the guarantee and the layout never shifts
  // when the skin changes. (No left/right reservation: nothing sits
  // beside the dial — the home column is dial-width, and in the
  // shell the handles' 22px reach at 190px fits inside the existing
  // 24px column gap.)
  const decorReserve = Math.ceil(30 * (size / 264)) + 4;
  const radius = size / 2 - 44 * (size / 264);
  const activeIdx = wrappedIndex(angle);

  return (
    <div className="flex flex-col items-center select-none">
      {/* Brief info line (home dial only; the shell dial sits beside
          the section itself, which carries the same line at its top).
          It follows selIdx: at rest that is the selected stop, and
          goTo() sets selIdx to the target the moment a tap lands, so
          while the wheel spins toward a stop the line already shows
          that stop's brief. Hidden in wheel-style mode — the hint
          under the dial ("Swipe to browse wheel styles…") owns the
          space then. Pure readout: no state, no physics touched. */}
      {!skinMode && sizeProp === "home" ? (
        <p
          className="mb-3 max-w-[320px] text-center text-xs leading-relaxed"
          style={{ color: dim }}
        >
          {PAGE_INTROS[STOP_INTRO_KEYS[selIdx] ?? "servers"]}
        </p>
      ) : null}
      <div
        ref={wrapRef}
        role="slider"
        aria-label={skinMode ? "Wheel style dial" : "Page dial"}
        aria-valuetext={
          skinMode
            ? (skinItems[skinIdx]?.label ?? "")
            : STOPS[activeIdx]?.label
        }
        tabIndex={0}
        onKeyDown={(e) => {
          if (skinMode) {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              stepSkin(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              stepSkin(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              confirmSkin();
            } else if (e.key === "Escape") {
              e.preventDefault();
              exitSkinCancel();
            }
            return;
          }
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            goTo((selIdx + 1) % STOPS.length);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            goTo((selIdx - 1 + STOPS.length) % STOPS.length);
          }
        }}
        className={`relative touch-none outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 rounded-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          width: size,
          height: size,
          // The dial's true footprint includes any protruding skin
          // furniture (decorReserve, above): intro and hint keep
          // this much clear space above and below the rim, always.
          marginTop: decorReserve,
          marginBottom: decorReserve,
          // Haptic-like pulse the moment wheel-style mode engages.
          transform: enteredPulse ? "scale(1.045)" : undefined,
          transition: "transform 200ms ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Top notch marker — in page mode it wears the hue of the
            stop resting at the notch; in wheel-style mode it keeps
            the dial's accent. */}
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 -top-1 z-10"
          style={{
            width: 0,
            height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: `13px solid ${skinMode ? accent : (STOPS[activeIdx]?.accentVar ?? accent)}`,
          }}
        />
        {/* Dial face (rotates; stops are positioned from the same angle
            in wrapper coordinates, so their labels stay upright) */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border shadow-[inset_0_2px_10px_rgba(0,0,0,0.08),0_10px_30px_rgba(0,0,0,0.10)]"
          style={{
            background: face,
            borderColor: ring,
            borderWidth: 2,
            transform: `rotate(${angle}deg)`,
            // A skinned dial (interface applied / being previewed)
            // trades the neutral drop shadow for its own glow, and
            // frosted skins blur what's behind the face.
            ...(pal
              ? {
                  boxShadow:
                    glow !== "none"
                      ? glow
                      : "0 10px 30px rgba(0, 0, 0, 0.10)",
                  backdropFilter: blur || undefined,
                  WebkitBackdropFilter: blur || undefined,
                }
              : {}),
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
                background: tick,
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
            style={{ borderColor: ring }}
          />
          {/* Wheel-skin furniture (spokes / handles / stripes) —
              drawn under the stops, pointer-events-none. */}
          {skinKind && activeSkin ? (
            <DialSkinDecor kind={skinKind} size={size} skin={activeSkin} />
          ) : null}
        </div>
        {/* Stops (labels stay upright; the stop at the notch is active).
            Hidden in wheel-style mode — dots mark the skins then. */}
        {!skinMode ? STOPS.map((stop, i) => {
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
                // A click that follows a long-press is already spent.
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                goTo(i);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                // Holding a stop also opens wheel-style mode (the
                // dial face arms the same timer in its own
                // pointerdown).
                if (themePicker) {
                  clearPressTimer();
                  pressTimerRef.current = window.setTimeout(() => {
                    pressTimerRef.current = null;
                    suppressClickRef.current = true;
                    enterSkinMode();
                  }, 500);
                }
              }}
              onPointerUp={() => clearPressTimer()}
              onPointerLeave={() => clearPressTimer()}
              onPointerCancel={() => clearPressTimer()}
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
                className="relative flex items-center justify-center rounded-full shadow-sm"
                style={{
                  width: 52 * (size / 264),
                  height: 52 * (size / 264),
                  color: active ? "#ffffff" : textTone,
                  // The active stop wears its own hue (globals.css
                  // --stop-*) as its FILL, glowing softly in that
                  // hue — plus the skin's own halo (gold skins) when
                  // it defines one. The badge's RING is no longer
                  // this span's border: DialBadgeRing draws it in
                  // the active interface's metal, per-stop geometry.
                  background: active ? stop.accentVar : surf,
                  boxShadow: active
                    ? `${skinActiveGlow ? `${skinActiveGlow}, ` : ""}0 0 16px color-mix(in srgb, ${stop.accentVar} 48%, transparent)`
                    : undefined,
                }}
              >
                <DialBadgeRing variant={stop.ring} />
                <DialIcon
                  paths={stop.iconPaths}
                  fills={stop.iconFills}
                  px={Math.round(52 * (size / 264) * 0.6)}
                />
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
                style={{ color: active ? stop.accentVar : labelTone }}
              >
                {stop.label}
              </span>
              <span className="sr-only">{active ? "(selected)" : ""}</span>
            </button>
          );
        }) : null}
        {/* Wheel-style mode: one dot per skin around the rim; the
            dot at the notch is the centred (previewing) skin. */}
        {skinMode
          ? skinItems.map((item, i) => {
              const dotAngle = angle + i * SSPACING;
              const rad = (dotAngle * Math.PI) / 180;
              const x = Math.sin(rad) * radius;
              const y = -Math.cos(rad) * radius;
              const active = Math.abs(delta(0, dotAngle)) < SSPACING / 2 + 1;
              return (
                <span
                  key={item.id}
                  aria-hidden
                  className="absolute z-10 rounded-full"
                  style={{
                    width: active ? 13 : 8,
                    height: active ? 13 : 8,
                    left: size / 2 + x - (active ? 6.5 : 4),
                    top: size / 2 + y - (active ? 6.5 : 4),
                    background: active ? accent : dim,
                    opacity: active ? 1 : 0.45,
                  }}
                />
              );
            })
          : null}
        {/* Centre hub — fixed readout: the stop resting at the notch.
            In wheel-style mode it becomes the confirm: it names the
            centred skin and tapping it applies that pick. */}
        {skinMode ? (
          <button
            type="button"
            aria-label={`Apply wheel style ${skinItems[skinIdx]?.label ?? ""}`}
            onClick={(e) => {
              e.stopPropagation();
              confirmSkin();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-full shadow-inner"
            style={{
              width: 74 * (size / 264),
              height: 74 * (size / 264),
              background: cap,
              border: `2px solid ${capRing}`,
            }}
          >
            <span
              className="px-1 text-center font-extrabold leading-tight tracking-tight"
              style={{ color: accentStrong, fontSize: 11.5 * (size / 264) }}
            >
              {skinItems[skinIdx]?.label ?? "Wheel style"}
            </span>
            <span
              className="px-1 text-center leading-tight"
              style={{ color: dim, fontSize: 8.5 * (size / 264) }}
            >
              {skinItems[skinIdx]?.sub ?? ""}
            </span>
          </button>
        ) : (
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center shadow-inner"
            style={{
              width: 74 * (size / 264),
              height: 74 * (size / 264),
              background: cap,
              border: `2px solid ${capRing}`,
            }}
          >
            <span
              className="px-1 text-center font-extrabold leading-tight tracking-tight"
              style={{
                color: STOPS[activeIdx]?.accentVar ?? accentStrong,
                fontSize: 13 * (size / 264),
              }}
            >
              {STOPS[activeIdx]?.label ?? "OneUCo"}
            </span>
          </div>
        )}
      </div>
      {skinMode ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          <p
            className="text-center text-xs md:text-[11px]"
            style={{ color: dim }}
          >
            Swipe to browse wheel styles — tap the centre to apply
          </p>
          <button
            type="button"
            onClick={exitSkinCancel}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition"
            style={{ borderColor: borderTone, color: textTone }}
          >
            ✕ Cancel
          </button>
        </div>
      ) : sizeProp === "shell" ? null : (
        <p
          className="mt-3 text-xs md:mt-2 md:text-[11px]"
          style={{ color: dim }}
        >
          Drag the dial, flick it, or tap a stop — it clicks and whirs
          like a real rotary dial. Hold the dial to restyle it — pirate
          helm, car wheels and more.
        </p>
      )}
    </div>
  );
}
