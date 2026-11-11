// Pirate helm loader — the page-transition symbol (owner's call,
// 2026-11-11; refined the same night: loading symbol ONLY, SMALL,
// dead centre — and the look is a real artefact, not vector art).
//
// The artwork is a photograph-style image of a sea-worn ship's
// wheel with the pirate captain in it (public/images/
// pirate-helm-loader.webp): a chunk of the rim broken and
// splintered, algae along the bottom rim, salt dust in the
// grooves, tarnished brass — aged like it was pulled off a wreck.
// It sits in a brass-ringed round medallion and rocks left-right
// (±10°, .helm-photo-rock in globals.css) — the left-right turning
// is the loading motion. Rendered by app/loading.tsx on every
// navigation that makes the next page fetch; it is a loading
// symbol only, never a control.

export default function PirateHelmLoader({
  size = 84,
}: {
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/pirate-helm-loader.webp"
      alt=""
      width={size}
      height={size}
      className="helm-photo-rock rounded-full"
      style={{
        border: "2px solid rgba(176, 138, 62, 0.65)",
        boxShadow:
          "0 10px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.4)",
      }}
      aria-hidden
    />
  );
}
