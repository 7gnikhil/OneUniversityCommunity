// Shared "today" helpers — the app's day runs on IST (UTC+5:30):
// the quote of the day, the poll of the day and the "new today"
// pulse all turn over at India midnight, not UTC midnight. Pure
// date math, no database — every daily feature derives the same
// day from these.

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** Whole days since the epoch, counted on IST days. */
export function istDayNumber(now: Date = new Date()): number {
  return Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/** Today's date in IST as 'YYYY-MM-DD' — the daily features' key. */
export function istDateString(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The UTC instant of today's IST midnight (start of "today"). */
export function istMidnightUtc(now: Date = new Date()): Date {
  return new Date(istDayNumber(now) * DAY_MS - IST_OFFSET_MS);
}
