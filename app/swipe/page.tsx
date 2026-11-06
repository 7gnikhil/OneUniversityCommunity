// Swipe Deck — the app's #1 priority surface (Tinder-style, verified
// students only).
//
// Feature port TODO:
// - Cards show PUBLIC fields only: photo, name, bio, branch. The server
//   strips year, college, hall-ticket number and preferences from deck
//   responses — privacy enforced server-side, not just hidden in the UI.
// - Deck order filtered by the user's intention + preferences
//   (dating / friendship / study partner / networking — all optional,
//   everything defaults to "Any").
// - Optimistic swiping with pre-loaded next cards; mutual like -> match
//   (see `swipes` / `matches` tables) + love-bird match sound +
//   slide-down "Be the first to message her/him/them" prompt opening the DM.
// - Shuffle button reshuffles the remaining deck (swiped stay swiped).
// - Exhausted deck -> "You're all caught up" + Start Again behind a
//   visible 2-minute countdown; restarting keeps existing matches.
// - PC support: mouse/trackpad drag, trackpad two-finger swipe,
//   arrow keys (left = pass, right = like), on-screen pass/like buttons.
export default function SwipePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Swipe Deck</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — the swipe/match deck is ported here in the feature
        phase.
      </p>
    </main>
  );
}
