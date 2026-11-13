import PirateHelmLoader from "@/components/PirateHelmLoader";
import { randomQuote } from "@/lib/loading-quotes";

// Page-transition loader (owner's calls, 2026-11-11): whenever a
// navigation makes the next page fetch, a small pirate-helm
// medallion rocks left-right at the centre of the screen — a
// loading symbol only, never a spinner — with a quote under it
// (love, relationships, college, friendship — lib/loading-quotes;
// a fresh random one on every navigation since 2026-11-13, the
// owner's call). Next renders
// this inside the app shell (the bottom bar stays put) for every
// route without its own loading file, which today is all of them.
// The min-height nets out the shell's bottom padding so the
// medallion sits at the centre of the free screen, above the bar.
export default function Loading() {
  const quote = randomQuote();
  return (
    <div
      className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-3 px-8 text-center"
      role="status"
      aria-label="Loading"
    >
      <PirateHelmLoader size={84} />
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-neutral-600">
        Quote
      </p>
      <p className="max-w-[34ch] text-sm leading-relaxed text-neutral-300">
        &ldquo;{quote}&rdquo;
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-neutral-500">
        Steering…
      </p>
    </div>
  );
}
