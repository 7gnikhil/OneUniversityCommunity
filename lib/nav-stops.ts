// Navigation stops + the shared dial-era data contracts, moved out
// of components/DialNav on 2026-11-11 when the rotary dial itself
// was retired (owner's call: "I think we don't need that dial
// anymore" — the bottom tab bar is the navigation now).
//
// STOPS is the single source for the app's five sections: labels,
// routes, the bold stroke glyphs and per-stop hues. The bottom tab
// bar (components/BottomBar) renders them; nothing else should
// hard-code the list. The palette/picker interfaces below remain
// the server contract computed by lib/dial-badges (badges for the
// bar; the theme fields are now unconsumed — see BUILD_NOTES).

import type { DialSkinKind } from "@/lib/dial-skins";

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
