// Dial Home — the landing screen after login.
//
// Feature port TODO:
// - Round dial selector (Servers · Swipe Deck · Friends · Chirp · Profile)
//   with a real rotary-dial sound (mechanical clicks + return snap),
//   respecting the in-app sound toggle and device silent mode.
// - Small live clock line: weekday · date + year · HH:MM:SS ticking.
// - Notification-count badges on dial stops for the *other* pages.
// - Desktop: dial shrinks; content column widens.
export default function DialHomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">OneUco</h1>
      <p className="text-sm text-neutral-400">One University Community</p>
      <p className="text-sm text-neutral-500">
        Placeholder — the round dial home (Servers · Swipe Deck · Friends ·
        Chirp · Profile) is ported here in the feature phase.
      </p>
    </main>
  );
}
