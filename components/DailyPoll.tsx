// REMOVED (2026-11-12) — the polls of the day. The owner first
// had them added to Fling and Chirp, then called it: "why
// questions everywhere" / "remove the poll of the day" — the
// feature is gone from every page. This file remains only
// because snapshot pushes cannot delete remote files; it is an
// inert stub and nothing imports it. (The daily_poll_votes table
// from migration 0015 still exists in the database, unused.)

export default function DailyPolls(): null {
  return null;
}
