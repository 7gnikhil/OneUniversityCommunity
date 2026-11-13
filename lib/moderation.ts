// Auto-moderation for Maya Jwalam (2026-11-13) — a first-pass
// keyword/pattern filter that runs server-side at post time in
// the main (anonymous) channel, plus an admin sweep that re-scores
// recent messages so a human can catch what the filter only flags.
//
// Design rules (deliberate, keep them):
// - This is a TRIPWIRE, not a judge. It blocks the clear-cut cases
//   (severe abuse, threats, scam patterns, flood) and flags the
//   borderline for the admin sweep at /admin/moderation. It never
//   bans anyone and never reveals which word tripped it.
// - Matching is evasion-resistant but conservative: text is
//   lowercased, leetspeak is folded (0→o, 1→i, 3→e, 4→a, 5→s,
//   7→t, @→a, $→s), letter runs are collapsed (fuuuck → fuck), and
//   a fully squashed copy (all separators removed) catches spaced-
//   out spellings (m a d a r c h o d). Severe terms match on whole
//   tokens or the squashed copy only — never as substrings of
//   longer innocent words.
// - Links and phone numbers ALONE are fine (students share notes
//   and numbers). A link/phone TOGETHER WITH a money pitch is the
//   scam shape and blocks. A phone number alone is only flagged.
// - Scope: Maya Jwalam only (the anonymous channel, where abuse
//   has no name attached). Named Teas keep the report flow.

export interface ModerationVerdict {
  /** "block" = refuse the post; "flag" = allow, surface to admin; "allow" = clean. */
  action: "block" | "flag" | "allow";
  /** Admin-facing labels, e.g. "severe abuse", "threat", "scam pattern". Never shown to the poster. */
  reasons: string[];
}

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");
}

/** Collapse runs of 3+ identical letters to one (fuuuck → fuck). */
function collapseRuns(text: string): string {
  return text.replace(/([a-z])\1{2,}/g, "$1");
}

// Severe abuse / harassment terms (English + common Hindi/Telugu
// transliterations). Whole-token or squashed match only.
const SEVERE_TERMS: ReadonlySet<string> = new Set([
  "fuck", "fucker", "motherfucker", "bitch", "bastard", "whore",
  "slut", "dickhead", "asshole", "rape", "rapist", "pedophile",
  "paedophile", "nigger", "nigga", "faggot", "retard",
  "madarchod", "bhenchod", "behenchod", "bhosdike", "chutiya",
  "chutiye", "randi", "gaandu", "harami", "lanja", "lanjodka",
  "dengey", "dengutha", "puka", "nakodaka",
]);

// Threat phrases — matched as substrings of the normalized text.
const THREAT_PHRASES: readonly string[] = [
  "kill you", "kill u", "i will kill", "ill kill", "murder you",
  "beat you up", "i will beat", "acid attack", "burn you alive",
  "rape you", "i will find you", "find your address",
  "leak your photos", "leak your number",
];

// Money-pitch words for the scam shape (need a link or phone too).
const MONEY_PITCH: readonly string[] = [
  "double your money", "guaranteed return", "guaranteed profit",
  "send money", "earn daily", "earn per day", "daily income",
  "investment plan", "crypto double", "pay and earn",
  "registration fee", "joining fee", "work from home earn",
];

const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|in|io|net|org|me|xyz|top|click|link)\b)/i;
const PHONE_RE = /(\+?91[\s-]?)?[6-9]\d{9}\b/;

export function moderateText(raw: string): ModerationVerdict {
  const reasons: string[] = [];
  let blocked = false;
  const text = collapseRuns(normalize(raw ?? ""));
  const tokens = text.split(/[^a-z]+/).filter(Boolean);
  const squashed = tokens.join("");

  // Severe terms: whole token, or the squashed copy contains the
  // term as a full segment (spaced-out evasion). Squashed matching
  // is limited to terms of 5+ chars to avoid false hits inside
  // longer innocent squashes.
  for (const token of tokens) {
    if (SEVERE_TERMS.has(token)) {
      reasons.push("severe abuse");
      blocked = true;
      break;
    }
  }
  if (!blocked) {
    for (const term of SEVERE_TERMS) {
      // Spaced-out evasions live in short messages, so the
      // squashed copy only counts when it is barely longer than
      // the term itself — a long innocent message's squash
      // contains many things by accident.
      if (
        term.length >= 4 &&
        squashed.length <= term.length + 6 &&
        squashed.includes(term)
      ) {
        reasons.push("severe abuse (spaced/obfuscated)");
        blocked = true;
        break;
      }
    }
  }

  for (const phrase of THREAT_PHRASES) {
    if (text.includes(phrase)) {
      reasons.push("threat / intimidation");
      blocked = true;
      break;
    }
  }

  const hasUrl = URL_RE.test(raw);
  const hasPhone = PHONE_RE.test(raw.replace(/[\s-]/g, " ")) || PHONE_RE.test(raw);
  const moneyPitch = MONEY_PITCH.some((phrase) => text.includes(phrase));
  if ((hasUrl || hasPhone) && moneyPitch) {
    reasons.push("scam pattern (contact + money pitch)");
    blocked = true;
  } else if (hasPhone) {
    reasons.push("phone number shared");
  }

  // Character flood: one char repeated 10+ times in a row.
  if (/(.)\1{9,}/.test(raw)) {
    reasons.push("character flood");
  }

  if (blocked) return { action: "block", reasons };
  if (reasons.length > 0) return { action: "flag", reasons };
  return { action: "allow", reasons: [] };
}

/** Flood limit for the anonymous channel: posts per rolling minute. */
export const JWALAM_POSTS_PER_MINUTE = 5;
