// Quote of the day for the loading screen (owner's ask, 2026-11-11:
// "while loading add a day quote of love, relationship that all
// stuffs — college — friendship"). Original lines written for
// OneUco, in rotation across the four themes; no attributions —
// none are borrowed quotes. The pick is deterministic by IST day
// number, so everyone sees the same quote all day and it turns
// over at India midnight — no database, no fetch, works in the
// server-rendered app/loading.tsx.

const QUOTES: string[] = [
  // Love
  "Love, in college, is saving someone the last seat — and the last bite.",
  "Real love is proofreading their assignment at 2 a.m. without being asked.",
  "Some people walk in as classmates and quietly become home.",
  "Love isn't the grand gesture. It's walking them to the bus stop in the rain.",
  "The heart learns its favourite subject long before the degree ends.",
  "Love is sharing your umbrella and pretending you don't mind the wet shoulder.",
  "Every love story here began as a group project nobody wanted to leave.",
  // Relationships
  "A good relationship is two people who still choose each other on the boring days.",
  "Relationships grow where small kindnesses repeat.",
  "The strongest couples were first the best of friends.",
  "Talk is cheap; showing up is the whole currency of love.",
  "A relationship is just two people agreeing to carry the same umbrella.",
  "Love stays where respect arrives first and leaves last.",
  "Grow together or grow apart — there is no third direction.",
  // College
  "College hands you a degree in four years, and people for a lifetime.",
  "The canteen table you pick today becomes the story you tell for decades.",
  "Marks fade from memory. The 8 a.m. lecture survived together never does.",
  "You came for the syllabus and stayed for the people.",
  "Half of college is learning; the other half is finding your people.",
  "Someday you'll miss even the corridor you complained about daily.",
  "The best classroom on campus is a bench, at sunset, with your people.",
  // Friendship
  "Friends are the family you get to pick — pick the ones who share fries.",
  "A true friend knows your attendance percentage and your coffee order.",
  "Friendship is splitting one plate of maggi five ways and calling it a feast.",
  "Good friends never let you face the viva alone.",
  "A friend is someone who laughs before you finish the joke, because they already know it.",
  "Distance means so little when the group chat never sleeps.",
  "Friends hold your place in the queue and your place in life.",
  "The best souvenir of college is a person.",
  "Side by side or miles apart, real friends stay in the same story.",
];

export function quoteOfTheDay(now: Date = new Date()): string {
  // IST day boundary (UTC+5:30): the quote turns over at India
  // midnight, not UTC midnight.
  const istMs = now.getTime() + (5 * 60 + 30) * 60_000;
  const day = Math.floor(istMs / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
