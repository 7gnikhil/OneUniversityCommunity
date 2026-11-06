// Pure validation + shared option lists for Slice 2 (account completion,
// verification, profile). No server or client imports — safe to use from
// Server Components, server actions and Client Components alike.

// ── Username (@handle) ─────────────────────────────────────────────────────
// Stored lowercase. 3–20 chars: lowercase letters, digits, underscore;
// must start with a letter (keeps handles distinct from OneUco IDs).
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

export function validateUsername(raw: string): string | null {
  const username = normaliseUsername(raw);
  if (!username) return "Pick a username.";
  if (username.length < 3 || username.length > 20) {
    return "Usernames are 3–20 characters.";
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use lowercase letters, digits and underscores, starting with a letter.";
  }
  return null;
}

// ── Hall ticket ────────────────────────────────────────────────────────────
// JNTUH hall-ticket / admission numbers are 10 characters:
//   chars 1–2  joining year (YY → 2000+YY)
//   chars 3–4  college code (validated against public.college_codes)
//   rest       course / branch / roll characters
// This is a STRUCTURE check only — there is no public JNTU API, so nothing
// here (or anywhere) claims the number was verified against university
// records.
export const HALL_TICKET_PATTERN = /^[0-9A-Z]{10}$/;

export function normaliseHallTicket(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export interface HallTicketStructure {
  joiningYear: number;
  collegeCode: string;
  suggestedGradYear: number;
}

// Returns null when the ticket is not even structurally a hall ticket.
export function parseHallTicket(raw: string): HallTicketStructure | null {
  const ticket = normaliseHallTicket(raw);
  if (!HALL_TICKET_PATTERN.test(ticket)) return null;
  if (!/^[0-9]{2}/.test(ticket)) return null;
  const joiningYear = 2000 + Number(ticket.slice(0, 2));
  return {
    joiningYear,
    collegeCode: ticket.slice(2, 4),
    // +4 for a standard B.Tech entry; lateral entry is +3 — the student
    // confirms/edits the graduation year in the form, this is a hint only.
    suggestedGradYear: joiningYear + 4,
  };
}

export type LayerOutcome = "pass" | "fail" | "not_provided" | "skipped";

// The structure-layer outcome, driven by the OFFICIAL college-code list:
// - list not loaded yet (empty)  -> 'not_provided' (never fail a student
//   because our reference data is missing)
// - code present in the list     -> 'pass'
// - list loaded, code absent     -> 'fail' (still submittable — the row
//   goes to manual review like everything doubtful)
export function structureLayerFor(
  structure: HallTicketStructure,
  collegeCodes: ReadonlyArray<{ code: string }>,
): LayerOutcome {
  if (collegeCodes.length === 0) return "not_provided";
  return collegeCodes.some((row) => row.code === structure.collegeCode)
    ? "pass"
    : "fail";
}

// ── OneUco ID generation ───────────────────────────────────────────────────
// "UC" + 6 uppercase alphanumerics, ambiguous characters (0/O, 1/I/L)
// excluded so students can read the ID off a screen without mistakes.
const ONEUCO_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOneucoId(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += ONEUCO_ID_ALPHABET[Math.floor(Math.random() * ONEUCO_ID_ALPHABET.length)];
  }
  return `UC${suffix}`;
}

// ── Profile option lists ───────────────────────────────────────────────────
export const LANGUAGES: string[] = [
  "Telugu",
  "Hindi",
  "English",
  "Urdu",
  "Tamil",
  "Other",
];

export const ACCENT_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: "black", label: "Black", hex: "#171717" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "coral", label: "Coral", hex: "#fb7185" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "amber", label: "Amber", hex: "#f59e0b" },
];

export function accentHex(accentColor: string | null | undefined): string {
  const found = ACCENT_COLORS.find((row) => row.id === accentColor);
  return (found ?? ACCENT_COLORS[0]).hex;
}

// ── Upload guards (shared by ID-card and avatar uploads) ──────────────────
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "That file isn't an image — please pick a photo (JPG, PNG or WebP).";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "That image is over 5 MB — please pick a smaller one.";
  }
  if (file.size === 0) {
    return "That file looks empty — please pick another photo.";
  }
  return null;
}

export function imageExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
