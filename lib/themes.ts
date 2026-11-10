// App interfaces ("themes") — the full-app look & feel system.
//
// An interface is NOT a colour swap: each one bundles a palette, a dial
// skin (ring material, face finish, glow, tick colour), a background
// treatment (pattern overlay) and a surface style (glass / soft /
// bordered / flat). The roster below is the single source of truth —
// the admin default picker, the per-user profile picker and the dial's
// long-press interface mode all read from here.
//
// How an interface reaches the screen: the root layout resolves the
// applied interface server-side (lib/server/theme-settings) and stamps
// it on <html> as data-theme / data-theme-mode / data-pattern /
// data-surface attributes plus the token CSS variables inline. The
// structural restyle lives in app/globals.css under a delimited
// "APP INTERFACES" section keyed on those attributes. When NOTHING is
// stamped (auto mode, nobody picked anything) the app renders exactly
// as it always has — black/minimal + the seasonal Diwali layer.
//
// Resolution order (highest first):
//   1. the signed-in user's own pick (profiles.theme_id)
//   2. the admin's app-wide default (app_settings key 'theme', manual)
//   3. seasonal auto — no stamp; today's behaviour (Diwali window etc.)

export type ThemeMode = "dark" | "light";
export type BgPattern = "none" | "grid" | "dots" | "stars" | "glow";
export type SurfaceStyle = "flat" | "glass" | "soft" | "bordered";

export interface DialSkinTokens {
  /** CSS background for the dial face (gradient / solid / translucent). */
  face: string;
  /** Ring + grip-ridge colour. */
  ring: string;
  /** Tick-mark colour. */
  tick: string;
  /** Box-shadow for the face — the skin's glow ("none" for matte skins). */
  glow: string;
  /** backdrop-filter for frosted skins ("" for opaque skins). */
  blur: string;
}

export interface ThemeTokens {
  bgFrom: string;
  bgTo: string;
  bgSolid: string;
  surface: string;
  surface2: string;
  border: string;
  accent: string;
  accent2: string;
  /** Readable text colour on top of the accent (primary buttons). */
  accentText: string;
  text: string;
  text2: string;
  muted: string;
  dial: DialSkinTokens;
}

export interface AppTheme {
  id: string;
  name: string;
  vibe: string;
  mode: ThemeMode;
  /** Display name of the dial skin, e.g. "Brass rotary". */
  dialSkin: string;
  bgPattern: BgPattern;
  surfaceStyle: SurfaceStyle;
  tokens: ThemeTokens;
}

export const THEMES: ReadonlyArray<AppTheme> = [
  {
    id: "midnight",
    name: "Default Midnight",
    vibe: "The original OneUco black",
    mode: "dark",
    dialSkin: "Carbon metal",
    bgPattern: "none",
    surfaceStyle: "flat",
    tokens: {
      bgFrom: "#000000", bgTo: "#0a0a0b", bgSolid: "#000000",
      surface: "#0a0a0a", surface2: "#171717", border: "#262626",
      accent: "#a3a3a3", accent2: "#737373", accentText: "#000000",
      text: "#fafafa", text2: "#d4d4d4", muted: "#a1a1aa",
      dial: {
        face: "linear-gradient(145deg, #1a1a1e, #101013)",
        ring: "#2e2e33", tick: "#a1a1aa", glow: "none", blur: "",
      },
    },
  },
  {
    id: "diwali",
    name: "Diwali",
    vibe: "Gold on deep maroon — festive",
    mode: "dark",
    dialSkin: "Brass rotary",
    bgPattern: "stars",
    surfaceStyle: "bordered",
    tokens: {
      bgFrom: "#3b0a06", bgTo: "#160404", bgSolid: "#1c0505",
      surface: "#2b0d08", surface2: "#3d1409", border: "#7c2d12",
      accent: "#f59e0b", accent2: "#ef4444", accentText: "#1c0a00",
      text: "#fff7ed", text2: "#fed7aa", muted: "#c99a5b",
      dial: {
        face: "linear-gradient(145deg, #8a6d1f, #5c430d)",
        ring: "#b8860b", tick: "#fde68a",
        glow: "0 0 34px rgba(245, 158, 11, 0.35)", blur: "",
      },
    },
  },
  {
    id: "ocean",
    name: "Ocean Deep",
    vibe: "Deep-sea blues, glassy calm",
    mode: "dark",
    dialSkin: "Polished chrome",
    bgPattern: "glow",
    surfaceStyle: "glass",
    tokens: {
      bgFrom: "#02131f", bgTo: "#010a14", bgSolid: "#02131f",
      surface: "#06283d", surface2: "#0b354f", border: "#155e75",
      accent: "#38bdf8", accent2: "#2dd4bf", accentText: "#03202f",
      text: "#f0f9ff", text2: "#bae6fd", muted: "#7fb3c8",
      dial: {
        face: "linear-gradient(145deg, #0b354f, #06283d)",
        ring: "#155e75", tick: "#7dd3fc",
        glow: "0 0 28px rgba(56, 189, 248, 0.25)", blur: "",
      },
    },
  },
  {
    id: "sunset",
    name: "Sunset Vibes",
    vibe: "Orange melts into purple",
    mode: "dark",
    dialSkin: "Warm copper",
    bgPattern: "glow",
    surfaceStyle: "soft",
    tokens: {
      bgFrom: "#4a1042", bgTo: "#1c0a24", bgSolid: "#22081f",
      surface: "#33102e", surface2: "#42163a", border: "#7e2a5c",
      accent: "#fb923c", accent2: "#e879f9", accentText: "#2a0a00",
      text: "#fff7ed", text2: "#fbcfe8", muted: "#c99bb4",
      dial: {
        face: "linear-gradient(145deg, #57244d, #33102e)",
        ring: "#a34a7c", tick: "#fdba74",
        glow: "0 0 30px rgba(251, 146, 60, 0.28)", blur: "",
      },
    },
  },
  {
    id: "forest",
    name: "Forest",
    vibe: "Pine greens, quiet and calm",
    mode: "dark",
    dialSkin: "Moss metal",
    bgPattern: "dots",
    surfaceStyle: "flat",
    tokens: {
      bgFrom: "#04150c", bgTo: "#020d07", bgSolid: "#04150c",
      surface: "#0a2417", surface2: "#103420", border: "#1d5c3a",
      accent: "#4ade80", accent2: "#a3e635", accentText: "#04150a",
      text: "#f0fdf4", text2: "#bbf7d0", muted: "#86b894",
      dial: {
        face: "linear-gradient(145deg, #123c24, #0a2417)",
        ring: "#1d5c3a", tick: "#86efac", glow: "none", blur: "",
      },
    },
  },
  {
    id: "royal",
    name: "Royal Violet",
    vibe: "Regal purple with a pink spark",
    mode: "dark",
    dialSkin: "Polished chrome",
    bgPattern: "stars",
    surfaceStyle: "bordered",
    tokens: {
      bgFrom: "#1d0a38", bgTo: "#0f0522", bgSolid: "#150830",
      surface: "#25104d", surface2: "#301661", border: "#5b21b6",
      accent: "#a78bfa", accent2: "#f472b6", accentText: "#1c0b33",
      text: "#f5f3ff", text2: "#ddd6fe", muted: "#a48fc7",
      dial: {
        face: "linear-gradient(145deg, #301661, #1e0b40)",
        ring: "#6d28d9", tick: "#c4b5fd",
        glow: "0 0 28px rgba(167, 139, 250, 0.30)", blur: "",
      },
    },
  },
  {
    id: "crimson",
    name: "Crimson",
    vibe: "Bold red energy",
    mode: "dark",
    dialSkin: "Carbon metal",
    bgPattern: "glow",
    surfaceStyle: "flat",
    tokens: {
      bgFrom: "#2b060d", bgTo: "#140409", bgSolid: "#1d0409",
      surface: "#330a12", surface2: "#450e19", border: "#881337",
      accent: "#fb7185", accent2: "#f43f5e", accentText: "#2a020a",
      text: "#fff1f2", text2: "#fecdd3", muted: "#cf8a94",
      dial: {
        face: "linear-gradient(145deg, #450e19, #2b060d)",
        ring: "#9f1239", tick: "#fda4af",
        glow: "0 0 26px rgba(244, 63, 94, 0.30)", blur: "",
      },
    },
  },
  {
    id: "rose",
    name: "Rose Pink",
    vibe: "Soft pink glow",
    mode: "dark",
    dialSkin: "Blush metal",
    bgPattern: "dots",
    surfaceStyle: "soft",
    tokens: {
      bgFrom: "#2b0a1c", bgTo: "#170410", bgSolid: "#22081a",
      surface: "#3a0f27", surface2: "#4a1433", border: "#9d2c64",
      accent: "#f9a8d4", accent2: "#f472b6", accentText: "#33051c",
      text: "#fdf2f8", text2: "#fbcfe8", muted: "#d69ab8",
      dial: {
        face: "linear-gradient(145deg, #4a1433, #2b0a1c)",
        ring: "#be4b8b", tick: "#fbcfe8",
        glow: "0 0 26px rgba(244, 114, 182, 0.25)", blur: "",
      },
    },
  },
  {
    id: "neon",
    name: "Cyber Neon",
    vibe: "Arcade neon on black",
    mode: "dark",
    dialSkin: "Neon ring",
    bgPattern: "grid",
    surfaceStyle: "bordered",
    tokens: {
      bgFrom: "#030308", bgTo: "#000000", bgSolid: "#020204",
      surface: "#0a0a18", surface2: "#12122a", border: "#0e7490",
      accent: "#00e5ff", accent2: "#ff2ea6", accentText: "#001318",
      text: "#ecfeff", text2: "#a5f3fc", muted: "#67a7b5",
      dial: {
        face: "#05050f",
        ring: "#00e5ff", tick: "#00e5ff",
        glow: "0 0 34px rgba(0, 229, 255, 0.45), inset 0 0 18px rgba(255, 46, 166, 0.25)",
        blur: "",
      },
    },
  },
  {
    id: "sakura",
    name: "Sakura",
    vibe: "Cherry-blossom pastel (light)",
    mode: "light",
    dialSkin: "Pastel flat",
    bgPattern: "dots",
    surfaceStyle: "soft",
    tokens: {
      bgFrom: "#fff5f7", bgTo: "#ffe4ec", bgSolid: "#fff5f7",
      surface: "#ffffff", surface2: "#ffeef4", border: "#f3b8cd",
      accent: "#ec4899", accent2: "#f59e0b", accentText: "#ffffff",
      text: "#4a0e24", text2: "#7c2d4e", muted: "#b06a87",
      dial: {
        face: "linear-gradient(145deg, #ffffff, #ffe4ec)",
        ring: "#f3a8c3", tick: "#ec4899",
        glow: "0 6px 22px rgba(236, 72, 153, 0.18)", blur: "",
      },
    },
  },
  {
    id: "lavender",
    name: "Lavender Haze",
    vibe: "Dreamy light purple, frosted glass",
    mode: "light",
    dialSkin: "Frosted glass",
    bgPattern: "none",
    surfaceStyle: "glass",
    tokens: {
      bgFrom: "#f3f0ff", bgTo: "#e9e4ff", bgSolid: "#f5f2ff",
      surface: "#ffffff", surface2: "#efeaff", border: "#cfc2f5",
      accent: "#7c5cf0", accent2: "#38bdf8", accentText: "#ffffff",
      text: "#2a1650", text2: "#55427e", muted: "#8d7bb5",
      dial: {
        face: "rgba(255, 255, 255, 0.65)",
        ring: "#c4b0f2", tick: "#7c5cf0",
        glow: "0 6px 22px rgba(124, 92, 240, 0.18)", blur: "blur(10px)",
      },
    },
  },
  {
    id: "mint",
    name: "Mint Fresh",
    vibe: "Cool mint night",
    mode: "dark",
    dialSkin: "Polished chrome",
    bgPattern: "dots",
    surfaceStyle: "glass",
    tokens: {
      bgFrom: "#031712", bgTo: "#020d0a", bgSolid: "#031712",
      surface: "#07332a", surface2: "#0a4436", border: "#14705a",
      accent: "#2dd4bf", accent2: "#4ade80", accentText: "#02201a",
      text: "#f0fdfa", text2: "#99f6e4", muted: "#74b8a6",
      dial: {
        face: "linear-gradient(145deg, #0a4436, #052a21)",
        ring: "#14b8a6", tick: "#5eead4",
        glow: "0 0 26px rgba(45, 212, 191, 0.25)", blur: "",
      },
    },
  },
  {
    id: "coffee",
    name: "Coffee House",
    vibe: "Warm espresso browns",
    mode: "dark",
    dialSkin: "Wooden warm",
    bgPattern: "none",
    surfaceStyle: "soft",
    tokens: {
      bgFrom: "#1c1007", bgTo: "#0f0803", bgSolid: "#170c05",
      surface: "#2a1a0e", surface2: "#38220f", border: "#78502c",
      accent: "#d9a05b", accent2: "#e8c07a", accentText: "#241203",
      text: "#faf3ea", text2: "#ecd9bd", muted: "#bb9a72",
      dial: {
        face: "linear-gradient(145deg, #4a2f18, #2a1a0e)",
        ring: "#8a5a2b", tick: "#e8c07a", glow: "none", blur: "",
      },
    },
  },
  {
    id: "amber",
    name: "Solar Amber",
    vibe: "Sun-baked gold",
    mode: "dark",
    dialSkin: "Brass rotary",
    bgPattern: "glow",
    surfaceStyle: "flat",
    tokens: {
      bgFrom: "#241300", bgTo: "#120a00", bgSolid: "#1c0f00",
      surface: "#33200a", surface2: "#45300d", border: "#92600f",
      accent: "#fbbf24", accent2: "#fb923c", accentText: "#261600",
      text: "#fffbeb", text2: "#fde68a", muted: "#c9a45c",
      dial: {
        face: "linear-gradient(145deg, #a87b1e, #6e4f0e)",
        ring: "#d9a41e", tick: "#fde68a",
        glow: "0 0 30px rgba(251, 191, 36, 0.30)", blur: "",
      },
    },
  },
  {
    id: "ice",
    name: "Ice Blue",
    vibe: "Frosty steel blue",
    mode: "dark",
    dialSkin: "Frosted glass",
    bgPattern: "stars",
    surfaceStyle: "glass",
    tokens: {
      bgFrom: "#0a1626", bgTo: "#050b16", bgSolid: "#081120",
      surface: "#10233c", surface2: "#16304f", border: "#2b5a86",
      accent: "#7dd3fc", accent2: "#e0f2fe", accentText: "#082635",
      text: "#f0f9ff", text2: "#bae6fd", muted: "#87a9c4",
      dial: {
        face: "rgba(148, 197, 255, 0.10)",
        ring: "#3b82b8", tick: "#bae6fd",
        glow: "0 0 26px rgba(125, 211, 252, 0.28)", blur: "blur(10px)",
      },
    },
  },
  {
    id: "mono",
    name: "Monochrome",
    vibe: "Pure black & white, grid lines",
    mode: "dark",
    dialSkin: "Monochrome metal",
    bgPattern: "grid",
    surfaceStyle: "bordered",
    tokens: {
      bgFrom: "#0a0a0a", bgTo: "#000000", bgSolid: "#050505",
      surface: "#111111", surface2: "#1c1c1c", border: "#3f3f46",
      accent: "#ffffff", accent2: "#a1a1aa", accentText: "#000000",
      text: "#ffffff", text2: "#e4e4e7", muted: "#a1a1aa",
      dial: {
        face: "linear-gradient(145deg, #26262a, #131316)",
        ring: "#52525b", tick: "#e4e4e7", glow: "none", blur: "",
      },
    },
  },
  {
    id: "peachy",
    name: "Peachy Light",
    vibe: "Warm peach daylight (light)",
    mode: "light",
    dialSkin: "Pastel flat",
    bgPattern: "dots",
    surfaceStyle: "soft",
    tokens: {
      bgFrom: "#fff7ed", bgTo: "#ffedd5", bgSolid: "#fff8f0",
      surface: "#ffffff", surface2: "#fff1de", border: "#f2cf9f",
      accent: "#ea580c", accent2: "#f59e0b", accentText: "#ffffff",
      text: "#431407", text2: "#7c3f16", muted: "#b3814f",
      dial: {
        face: "linear-gradient(145deg, #ffffff, #ffe8cc)",
        ring: "#f2b26b", tick: "#ea580c",
        glow: "0 6px 22px rgba(234, 88, 12, 0.16)", blur: "",
      },
    },
  },
  {
    id: "paper",
    name: "Paper Light",
    vibe: "Clean paper minimal (light)",
    mode: "light",
    dialSkin: "Porcelain",
    bgPattern: "none",
    surfaceStyle: "bordered",
    tokens: {
      bgFrom: "#fafaf9", bgTo: "#f0efed", bgSolid: "#fafaf9",
      surface: "#ffffff", surface2: "#f5f5f4", border: "#d6d3d1",
      accent: "#111111", accent2: "#57534e", accentText: "#ffffff",
      text: "#1c1917", text2: "#44403c", muted: "#78716c",
      dial: {
        face: "linear-gradient(145deg, #ffffff, #eceae7)",
        ring: "#c9c4bf", tick: "#44403c",
        glow: "0 6px 18px rgba(0, 0, 0, 0.08)", blur: "",
      },
    },
  },
];

const THEME_BY_ID: ReadonlyMap<string, AppTheme> = new Map(
  THEMES.map((theme) => [theme.id, theme]),
);

export function getTheme(id: string | null | undefined): AppTheme | null {
  if (!id) return null;
  return THEME_BY_ID.get(id) ?? null;
}

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && THEME_BY_ID.has(value);
}

// ── The admin-side setting (app_settings key 'theme') ──────────────────
// Stored as JSON text: {"mode":"auto"} or {"mode":"manual","id":"ocean"}.
// 'auto' = no app-wide default; the seasonal logic owns the look.

export type ThemeSetting =
  | { mode: "auto" }
  | { mode: "manual"; id: string };

export const AUTO_THEME_SETTING: ThemeSetting = { mode: "auto" };

/**
 * Parse a raw app_settings value into a ThemeSetting. The column is
 * text on the live database (migration 0003) and jsonb on a fresh one
 * (migration 0008), and the writer stores JSON.stringify(...) — so the
 * raw value may arrive as a string OR as an already-parsed object.
 * Anything unrecognised degrades to auto.
 */
export function parseThemeSetting(raw: unknown): ThemeSetting {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return AUTO_THEME_SETTING;
    }
  }
  if (typeof value !== "object" || value === null) return AUTO_THEME_SETTING;
  const record = value as Record<string, unknown>;
  if (record.mode === "manual" && isThemeId(record.id)) {
    return { mode: "manual", id: record.id };
  }
  return AUTO_THEME_SETTING;
}

export function themeSettingToStorage(setting: ThemeSetting): string {
  return setting.mode === "manual"
    ? JSON.stringify({ mode: "manual", id: setting.id })
    : JSON.stringify({ mode: "auto" });
}

// ── CSS variable plumbing ──────────────────────────────────────────────
// The layout stamps these on <html> inline; the dial's interface mode
// re-stamps them live on the client for previews (same helpers, so a
// preview is pixel-identical to what the server renders after saving).

export const THEME_VAR_NAMES: ReadonlyArray<string> = [
  "--bg-from",
  "--bg-to",
  "--bg-solid",
  "--surface",
  "--surface-2",
  "--border",
  "--accent",
  "--accent-2",
  "--accent-text",
  "--text",
  "--text-2",
  "--muted",
];

export function themeCssVars(theme: AppTheme): Record<string, string> {
  const t = theme.tokens;
  return {
    "--bg-from": t.bgFrom,
    "--bg-to": t.bgTo,
    "--bg-solid": t.bgSolid,
    "--surface": t.surface,
    "--surface-2": t.surface2,
    "--border": t.border,
    "--accent": t.accent,
    "--accent-2": t.accent2,
    "--accent-text": t.accentText,
    "--text": t.text,
    "--text-2": t.text2,
    "--muted": t.muted,
  };
}

/** The data-* attributes the layout stamps for a theme. */
export function themeDataAttrs(theme: AppTheme): Record<string, string> {
  return {
    "data-theme": theme.id,
    "data-theme-mode": theme.mode,
    "data-pattern": theme.bgPattern,
    "data-surface": theme.surfaceStyle,
  };
}

export interface RootThemeSnapshot {
  attrs: Record<string, string | null>;
  vars: Record<string, string>;
}

const ROOT_ATTR_NAMES: ReadonlyArray<string> = [
  "data-theme",
  "data-theme-mode",
  "data-pattern",
  "data-surface",
];

/**
 * Stamp (or clear, when theme is null) the interface on the document
 * root — client-side twin of the layout's server stamp. Used by the
 * dial's interface mode to preview live. No-op off the client.
 */
export function applyThemeToRoot(theme: AppTheme | null): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!theme) {
    for (const name of ROOT_ATTR_NAMES) el.removeAttribute(name);
    for (const name of THEME_VAR_NAMES) el.style.removeProperty(name);
    return;
  }
  const attrs = themeDataAttrs(theme);
  for (const name of ROOT_ATTR_NAMES) el.setAttribute(name, attrs[name]);
  const vars = themeCssVars(theme);
  for (const name of THEME_VAR_NAMES) el.style.setProperty(name, vars[name]);
}

/** Capture the root's current stamp so a cancelled preview can undo. */
export function snapshotRootTheme(): RootThemeSnapshot {
  const snapshot: RootThemeSnapshot = { attrs: {}, vars: {} };
  if (typeof document === "undefined") return snapshot;
  const el = document.documentElement;
  for (const name of ROOT_ATTR_NAMES) snapshot.attrs[name] = el.getAttribute(name);
  for (const name of THEME_VAR_NAMES) {
    snapshot.vars[name] = el.style.getPropertyValue(name);
  }
  return snapshot;
}

export function restoreRootTheme(snapshot: RootThemeSnapshot): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const name of ROOT_ATTR_NAMES) {
    const value = snapshot.attrs[name];
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
  for (const name of THEME_VAR_NAMES) {
    const value = snapshot.vars[name];
    if (!value) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
  }
}

// ── The dial's interface-mode wheel ────────────────────────────────────
// First entry is always "App Default" (id null): picking it clears the
// user's own pick, so they follow the admin default / seasonal look.
// Its preview theme is whatever the admin default resolves to (passed
// in by the caller; null when the default is seasonal auto).

export interface InterfaceItem {
  /** profiles.theme_id value to save; null = follow the app default. */
  id: string | null;
  label: string;
  sub: string;
  theme: AppTheme | null;
}

export function interfaceItems(
  defaultTheme: AppTheme | null,
): ReadonlyArray<InterfaceItem> {
  return [
    {
      id: null,
      label: "App Default",
      sub: defaultTheme ? defaultTheme.name : "Seasonal look",
      theme: defaultTheme,
    },
    ...THEMES.map((theme) => ({
      id: theme.id as string | null,
      label: theme.name,
      sub: theme.dialSkin,
      theme: theme as AppTheme | null,
    })),
  ];
}
