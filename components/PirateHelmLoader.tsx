// Pirate helm loader — the page-transition symbol (owner's call,
// 2026-11-11: "the loading symbol should be a pirate dial
// animation… rocks/rotates left and right, like a pirate steering").
//
// The Pirate Helm is one of the dial's own wheel skins
// (lib/dial-skins — timber, brass, eight spoke handles); this is
// that same wheel redrawn as one self-contained SVG so it can live
// anywhere, and rocked by the .helm-rock keyframes in globals.css:
// swing to port, settle, swing to starboard — a helmsman correcting
// course, never a full spin. Rendered by app/loading.tsx on every
// navigation that makes the next page fetch.

export default function PirateHelmLoader({
  size = 124,
}: {
  size?: number;
}) {
  const handles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <div
      className="helm-rock"
      style={{
        width: size,
        height: size,
        filter: "drop-shadow(0 12px 22px rgba(0, 0, 0, 0.45))",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id="helmFace" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#8a5a24" />
            <stop offset="55%" stopColor="#6b421a" />
            <stop offset="100%" stopColor="#4a2b0e" />
          </radialGradient>
          <radialGradient id="helmCap" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="40%" stopColor="#d9ab4a" />
            <stop offset="75%" stopColor="#a87b1e" />
            <stop offset="100%" stopColor="#6e4f0e" />
          </radialGradient>
          <linearGradient id="helmWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#96622a" />
            <stop offset="100%" stopColor="#4a2b0e" />
          </linearGradient>
        </defs>

        {/* Eight protruding handles outside the rim — the classic
            ship's-wheel grips. */}
        {handles.map((a) => (
          <g key={`h${a}`} transform={`rotate(${a} 100 100)`}>
            <rect
              x="95.5"
              y="1"
              width="9"
              height="31"
              rx="4.5"
              fill="url(#helmWood)"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="0.75"
            />
            <circle cx="100" cy="7" r="3.6" fill="#b08a3e" />
          </g>
        ))}

        {/* Rim: dark outer edge, timber ring, brass band inside. */}
        <circle cx="100" cy="100" r="79" fill="none" stroke="#3a2008" strokeWidth="4" />
        <circle cx="100" cy="100" r="72" fill="none" stroke="#7c4f1e" strokeWidth="11" />
        <circle cx="100" cy="100" r="64.5" fill="none" stroke="#b08a3e" strokeWidth="3" />

        {/* Face + eight spokes, hub to rim. */}
        <circle cx="100" cy="100" r="63" fill="url(#helmFace)" />
        {handles.map((a) => (
          <rect
            key={`s${a}`}
            x="96.5"
            y="35"
            width="7"
            height="51"
            rx="3"
            fill="url(#helmWood)"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="0.75"
            transform={`rotate(${a} 100 100)`}
          />
        ))}

        {/* Brass hub cap + centre bolt. */}
        <circle cx="100" cy="100" r="17" fill="url(#helmCap)" stroke="#8a6414" strokeWidth="2" />
        <circle cx="100" cy="100" r="5" fill="#54300e" />
      </svg>
    </div>
  );
}
