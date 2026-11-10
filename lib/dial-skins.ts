// Dial wheel skins — the dial's OWN look, selectable independently of
// the app interface (lib/themes.ts). An interface still owns the app
// (palette, background, surfaces) AND carries a house dial skin; a
// wheel skin overrides ONLY the dial's face/ring/ticks/hub/glow and
// adds its own drawn furniture (spokes, handles, stripes) in DialNav.
//
// Persistence: profiles.dial_skin (migration 0010), read fail-soft by
// lib/server/theme-settings (getProfileDialSkin) and written by
// app/profile/theme-actions (setMyDialSkinAction). 'auto' = follow
// the applied interface's own skin (today's behaviour, including the
// polished-gold Default Midnight skin). The dial's long-press gesture
// cycles these skins with a live preview; Profile settings carries
// the same list as a picker.
//
// All artwork is CSS/SVG drawn in components/DialNav — no images and
// NO trademarked logos or badges: the car wheels evoke a style
// (sport / luxury / racing / vintage) with generic geometry only.

import type { DialSkinTokens } from "@/lib/themes";

/** The drawn furniture a skin adds on top of the dial face. */
export type DialSkinKind =
  | "pirate"
  | "munich"
  | "stuttgart"
  | "racing"
  | "vintage";

/** profiles.dial_skin values: a skin kind, or 'auto' (interface's). */
export type DialSkinId = DialSkinKind | "auto";

export interface DialSkin {
  id: DialSkinKind;
  /** Picker / hub readout name. */
  name: string;
  /** One-line flavour for the settings list. */
  vibe: string;
  /** Full dial token set (same shape as an interface's dial skin). */
  tokens: DialSkinTokens;
}

export const DIAL_SKINS: ReadonlyArray<DialSkin> = [
  {
    id: "pirate",
    name: "Pirate Helm",
    vibe: "A wooden ship's wheel — timber, brass and eight spoke handles",
    tokens: {
      // Turned timber: warm radial light off the top left, deep
      // shadow pooled bottom right, a conic sweep so the grain tones
      // shift as the helm turns.
      face: "radial-gradient(circle at 32% 24%, rgba(255, 214, 150, 0.35) 0%, rgba(255, 214, 150, 0) 42%), radial-gradient(circle at 78% 86%, rgba(24, 10, 0, 0.55) 0%, rgba(24, 10, 0, 0) 52%), conic-gradient(from 200deg, #5a3410, #8a5a24, #6b421a, #a06a2c, #54300e, #7c4f1e, #5a3410), linear-gradient(145deg, #7c4f1e, #4a2b0e)",
      ring: "#b08a3e",
      tick: "#f0d9a0",
      glow: "0 0 30px rgba(176, 138, 62, 0.35), 0 18px 42px rgba(0, 0, 0, 0.5)",
      blur: "",
      cap: "radial-gradient(circle at 34% 28%, #ffe9a8 0%, #d9ab4a 38%, #a87b1e 70%, #6e4f0e 100%)",
      capRing: "#8a6414",
      activeGlow: "0 0 20px rgba(217, 171, 74, 0.55)",
      label: "#f5e6c4",
    },
  },
  {
    id: "munich",
    name: "Munich Sport",
    vibe: "Black leather three-spoke sport wheel, silver accents",
    tokens: {
      face: "radial-gradient(circle at 50% 38%, #26262b 0%, #17171a 58%, #0c0c0e 100%), linear-gradient(145deg, #1d1d21, #0c0c0e)",
      ring: "#3f3f46",
      tick: "#d4d4d8",
      glow: "0 0 24px rgba(0, 0, 0, 0.55), 0 14px 34px rgba(0, 0, 0, 0.5)",
      blur: "",
      cap: "radial-gradient(circle at 38% 30%, #2e2e33 0%, #17171a 62%, #0a0a0c 100%)",
      capRing: "#a1a1aa",
      activeGlow: "0 0 18px rgba(212, 212, 216, 0.35)",
      label: "#e4e4e7",
    },
  },
  {
    id: "stuttgart",
    name: "Stuttgart Luxe",
    vibe: "Slim chrome spokes over piano black and dark wood",
    tokens: {
      face: "radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 40%), conic-gradient(from 210deg, #17110b, #241708, #120d08, #2e1c0c, #17110b), linear-gradient(145deg, #201409, #0d0906)",
      ring: "#c9c9ce",
      tick: "#e7e5e4",
      glow: "0 0 26px rgba(201, 201, 206, 0.22), 0 16px 38px rgba(0, 0, 0, 0.5)",
      blur: "",
      cap: "radial-gradient(circle at 36% 28%, #3a3a40 0%, #17171a 58%, #08080a 100%)",
      capRing: "#d6d3d1",
      activeGlow: "0 0 18px rgba(231, 229, 228, 0.4)",
      label: "#f5f0e6",
    },
  },
  {
    id: "racing",
    name: "Racing GT",
    vibe: "Flat-bottom carbon wheel — red centre stripe, yellow stitch",
    tokens: {
      face: "radial-gradient(circle at 50% 36%, #232328 0%, #131316 62%, #0a0a0b 100%), linear-gradient(145deg, #1b1b1f, #0a0a0b)",
      ring: "#27272a",
      tick: "#facc15",
      glow: "0 0 26px rgba(220, 38, 38, 0.22), 0 14px 34px rgba(0, 0, 0, 0.5)",
      blur: "",
      cap: "radial-gradient(circle at 38% 30%, #2b2b31 0%, #141416 60%, #08080a 100%)",
      capRing: "#dc2626",
      activeGlow: "0 0 18px rgba(250, 204, 21, 0.4)",
      label: "#fef9c3",
    },
  },
  {
    id: "vintage",
    name: "Vintage Classic",
    vibe: "Thin chrome rim, cream centre, warm sepia metal",
    tokens: {
      face: "radial-gradient(circle at 36% 26%, #fffdf4 0%, #f6ecd2 46%, #e7d5ab 78%, #d9c48f 100%)",
      ring: "#b9bdc4",
      tick: "#7c5a36",
      glow: "0 0 26px rgba(217, 196, 143, 0.35), 0 14px 32px rgba(0, 0, 0, 0.35)",
      blur: "",
      cap: "radial-gradient(circle at 36% 28%, #fffef9 0%, #f3e7c8 55%, #ddc890 100%)",
      capRing: "#9aa0a8",
      activeGlow: "0 0 18px rgba(217, 196, 143, 0.55)",
      label: "#4a3520",
    },
  },
];

const SKIN_BY_ID: ReadonlyMap<DialSkinKind, DialSkin> = new Map(
  DIAL_SKINS.map((skin) => [skin.id, skin]),
);

export function getDialSkin(id: string | null | undefined): DialSkin | null {
  if (!id || id === "auto") return null;
  return SKIN_BY_ID.get(id as DialSkinKind) ?? null;
}

export function isDialSkinKind(value: unknown): value is DialSkinKind {
  return typeof value === "string" && SKIN_BY_ID.has(value as DialSkinKind);
}

export function isDialSkinId(value: unknown): value is DialSkinId {
  return value === "auto" || isDialSkinKind(value);
}

/** Parse a stored profiles.dial_skin value; anything odd → 'auto'. */
export function parseDialSkin(value: unknown): DialSkinId {
  return isDialSkinId(value) ? value : "auto";
}

/** One wheel-skin choice as the dial's hold gesture cycles it. */
export interface DialSkinItem {
  /** profiles.dial_skin value to save. */
  id: DialSkinId;
  label: string;
  sub: string;
  /** Null for 'auto' — the wheel wears the interface's own skin. */
  skin: DialSkin | null;
}

export function dialSkinItems(
  autoSub: string,
): ReadonlyArray<DialSkinItem> {
  return [
    { id: "auto", label: "Auto", sub: autoSub, skin: null },
    ...DIAL_SKINS.map((skin) => ({
      id: skin.id as DialSkinId,
      label: skin.name,
      sub: "Wheel style",
      skin: skin as DialSkin | null,
    })),
  ];
}
