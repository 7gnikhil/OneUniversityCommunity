import PirateHelmLoader from "@/components/PirateHelmLoader";

// Page-transition loader (owner's call, 2026-11-11): whenever a
// navigation makes the next page fetch, a small pirate-helm
// medallion rocks left-right at the centre of the screen — a
// loading symbol only, never a spinner. Next renders this inside
// the app shell (the bottom bar stays put) for every route without
// its own loading file, which today is all of them. The min-height
// nets out the shell's bottom padding so the medallion sits at the
// centre of the free screen, above the bar.
export default function Loading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Loading"
    >
      <PirateHelmLoader size={84} />
      <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">
        Steering…
      </p>
    </div>
  );
}
