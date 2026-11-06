// Pure validation + shared option lists for account completion, the open
// college registry and profiles. No server or client imports — safe to use from
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

// ── Open college registry ─────────────────────────────────────────────────
// Students can add a college or university that is not listed yet. Names
// are compared in a normalised form so trivial spacing/punctuation variants
// do not create duplicate registry entries.
export function normaliseCollegeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseCollegeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const COLLEGE_CODE_STOP_WORDS = new Set(["AND", "FOR", "OF", "THE"]);
const COLLEGE_CODE_SUFFIXES = "23456789ABCDEFGHJKMNPQRSTUVWXYZ".split("");

// Derive a short registry code from a college name: initials for multi-word
// names (up to four), or the leading consonants of a one-word name.
export function deriveCollegeCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !COLLEGE_CODE_STOP_WORDS.has(word));

  if (words.length >= 2) {
    return words
      .slice(0, 4)
      .map((word) => word.charAt(0))
      .join("");
  }

  const word = words[0] ?? "COLLEGE";
  const consonants = word.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, "");
  const base = consonants.length >= 2 ? consonants : word;
  return base.slice(0, 4).padEnd(2, "X");
}

// Candidate codes in preference order: the derived code first, then
// suffixed variants that stay within four characters and are not taken.
export function collegeCodeCandidates(
  name: string,
  existingCodes: ReadonlyArray<{ code: string }>,
): string[] {
  const taken = new Set(
    existingCodes.map((row) => row.code.trim().toUpperCase()),
  );
  const base = deriveCollegeCode(name);
  const candidates: string[] = [];
  const addCandidate = (candidate: string): void => {
    if (!taken.has(candidate) && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  addCandidate(base);
  for (const suffix of COLLEGE_CODE_SUFFIXES) {
    addCandidate(
      base.length < 4 ? `${base}${suffix}` : `${base.slice(0, 3)}${suffix}`,
    );
  }
  return candidates;
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

// ── Upload guards (shared by avatar and other profile image uploads) ─────
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
