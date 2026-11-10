// Brief info lines — one per section, shown at the top of the page on
// EVERY open (owner's ask): a new user should know what a section is
// for the moment it renders, without onboarding, tips or dismissals.
// Permanent and subtle by design: no localStorage, no cookie, no close
// button — components/PageIntro renders this text verbatim, and the
// home dial reuses the five stop lines from the same map so a section
// never describes itself two different ways.

export type PageIntroSection =
  | "servers"
  | "swipe"
  | "friends"
  | "chirp"
  | "profile"
  | "inbox"
  | "search";

export const PAGE_INTROS: Record<PageIntroSection, string> = {
  servers:
    "Your group spaces — subject squads, clubs and campus communities. Maya Jwalam stays fully anonymous.",
  swipe:
    "Discover students — swipe right to follow, left to pass. Your details unlock only when they accept.",
  friends:
    "Your people — chats, online status and typing live here. Yellow double-ticks mean they've seen your message.",
  chirp:
    "Campus in short posts — plus live news and weather for your place, refreshed through the day.",
  profile:
    "This is you on OneUco — your gallery, links and intention stay hidden until someone becomes your friend.",
  inbox:
    "Requests and invites land here — follows, reveal requests and group invites waiting on you.",
  search: "Find any student by their @username or OneUco ID.",
};
