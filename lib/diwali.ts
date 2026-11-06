// Diwali launch theme — a temporary festive layer over the black/minimal
// base (gold/amber accents, diya banner, sparkle touches). It is NOT a
// redesign: when it is off, the app renders exactly as before.
//
// Window (IST): 8 Nov 2026 00:00 → 13 Nov 2026 00:00 (live through 12 Nov,
// ~5 days), then it switches itself off automatically.
// Mode ('auto' | 'on' | 'off') lives in public.app_settings key
// 'diwali_mode', editable by the owner/admin from /admin; 'auto' follows
// the window.

export type DiwaliMode = "auto" | "on" | "off";

export const DIWALI_START_UTC = Date.UTC(2026, 10, 7, 18, 30, 0); // 8 Nov 00:00 IST
export const DIWALI_END_UTC = Date.UTC(2026, 10, 12, 18, 30, 0); // 13 Nov 00:00 IST

export function isDiwaliMode(value: string | null | undefined): value is DiwaliMode {
  return value === "auto" || value === "on" || value === "off";
}

export function diwaliLive(mode: DiwaliMode, now: number = Date.now()): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return now >= DIWALI_START_UTC && now < DIWALI_END_UTC;
}
