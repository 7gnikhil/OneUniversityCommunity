// Polls of the day (owner's picks, 2026-11-11/12: a poll on the
// starting pages — then "ask numerous questions, not just one").
// A daily SET of questions, picked deterministically by IST day
// number — the same set for everyone, turning over at India
// midnight, exactly like the quote of the day (lib/loading-
// quotes). Questions live here in code; only the VOTES live in
// the database (daily_poll_votes, migration 0015), keyed by IST
// date + question index — no admin tooling, no daily job to run.

import { istDateString, istDayNumber } from "@/lib/daily";

export interface DailyPoll {
  question: string;
  options: string[];
}

/** How many questions make up one day's set. */
export const POLLS_PER_DAY = 5;

const POLLS: DailyPoll[] = [
  {
    question: "Hostel mess food today:",
    options: ["Surprisingly edible", "A crime scene", "Skipped — maggi zindabad"],
  },
  {
    question: "The 8 a.m. lecture:",
    options: ["Attended, fully awake", "Attended, fully asleep", "Proxy handled it", "What lecture?"],
  },
  {
    question: "Your semester crush:",
    options: ["Knows I exist", "Group-project only", "Taken — tragedy", "I am the crush"],
  },
  {
    question: "Best campus hangout:",
    options: ["The canteen", "Library steps", "That one bench", "A hostel room"],
  },
  {
    question: "Exam-season strategy:",
    options: ["Start early (liar)", "One night before", "Previous-year papers", "Pure prayer"],
  },
  {
    question: "Group project reality:",
    options: ["I carry the team", "We share equally", "One ghost member", "Chaos, but it works"],
  },
  {
    question: "This weekend's plan:",
    options: ["Sleep. Only sleep.", "Trip back home", "Out with the gang", "Assignment backlog"],
  },
  {
    question: "Love in college is:",
    options: ["Real, and worth it", "A beautiful distraction", "Honestly overrated", "Still loading…"],
  },
  {
    question: "The last slice of pizza:",
    options: ["Split it fairly", "Fastest hand wins", "Goes to my person", "Order another one"],
  },
  {
    question: "Your phone battery at 6 p.m.:",
    options: ["80%+ — I planned", "20% and praying", "Dead since noon", "Power bank is my partner"],
  },
  {
    question: "Pre-exam notes come from:",
    options: ["My own, colour-coded", "The class topper", "A kind stranger's PDF", "Notes? Bold of you"],
  },
  {
    question: "First salary goes to:",
    options: ["Family first", "That phone / bike", "Travel with friends", "Investing, like an adult"],
  },
  {
    question: "A rainy day on campus means:",
    options: ["Chai and a long walk", "Cancel everything", "Perfect nap weather", "Photoshoot mode"],
  },
  {
    question: "The class group chat is:",
    options: ["Family", "A second classroom", "Mostly memes", "Muted since forever"],
  },
];

export interface TodaysPoll extends DailyPoll {
  /** IST date key ('YYYY-MM-DD') the votes are filed under. */
  date: string;
  /** Index into POLLS — stable identity for the question. */
  index: number;
}

/**
 * Today's set: POLLS_PER_DAY questions in a rotating window over
 * the full list (the window advances by the set size each day, so
 * over three days every question appears). Deterministic by IST
 * day — everyone gets the same set.
 */
export function pollsOfTheDay(now: Date = new Date()): TodaysPoll[] {
  const date = istDateString(now);
  const start =
    (istDayNumber(now) * POLLS_PER_DAY) % POLLS.length;
  const out: TodaysPoll[] = [];
  for (let i = 0; i < POLLS_PER_DAY; i += 1) {
    const index = (start + i) % POLLS.length;
    out.push({ date, index, ...POLLS[index] });
  }
  return out;
}
