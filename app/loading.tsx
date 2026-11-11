import PirateHelmLoader from "@/components/PirateHelmLoader";

// Page-transition loader (owner's call, 2026-11-11): whenever a
// navigation makes the next page fetch, the pirate helm takes the
// wheel — rocking port to starboard like a helmsman steering —
// instead of any generic spinner. Next renders this inside the app
// shell (the bottom bar stays put) for every route without its own
// loading file, which today is all of them.
export default function Loading() {
  return (
    <div
      className="flex min-h-[70dvh] flex-col items-center justify-center gap-5"
      role="status"
      aria-label="Loading"
    >
      <PirateHelmLoader size={148} />
      <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
        Steering…
      </p>
    </div>
  );
}
