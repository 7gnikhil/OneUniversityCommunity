// Pirate helm loader — the page-transition symbol (owner's call,
// 2026-11-11: "the loading symbol should be a pirate dial
// animation"; clarified the same evening: it is a PIRATE AT THE
// HELM — a pirate gripping the wheel and turning it left, then
// right — not a wheel rocking on its own).
//
// So the figure is drawn in: bandana with fluttering tails, beard,
// eye patch, coat — standing behind the dial's own Pirate Helm
// wheel (lib/dial-skins palette: timber, brass, eight handles,
// offset 22.5° like the skin so no handle crosses his face). Two
// motions, one steering feel (globals.css): the WHEEL group —
// wheel, arms and hands together, so his grip never leaves the
// rim — swings ±19°, while the BODY group leans ±6° a beat behind
// it. Rendered by app/loading.tsx on every navigation that makes
// the next page fetch.

const HANDLES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

export default function PirateHelmLoader({
  size = 148,
}: {
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size * 1.14,
        filter: "drop-shadow(0 12px 22px rgba(0, 0, 0, 0.45))",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 200 228" width={size} height={size * 1.14}>
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

        {/* ── The pirate (leans gently, a beat behind the wheel) ── */}
        <g className="helm-body-sway">
          {/* Coat / torso — the wheel covers everything below its
              top arc; only the shoulders need to read. */}
          <path
            d="M38,152 L38,106 Q38,84 64,79 L136,79 Q162,84 162,106 L162,152 Z"
            fill="#6e2a1e"
          />
          {/* Beard mass behind the head, offset down so a crescent
              shows under the chin. */}
          <circle cx="100" cy="50" r="18" fill="#2e1a0e" />
          {/* Head. */}
          <circle cx="100" cy="38" r="20" fill="#d99e63" />
          {/* Beard over the jaw. */}
          <path
            d="M82,42 Q84,66 100,67 Q116,66 118,42 Q116,56 100,56 Q84,56 82,42 Z"
            fill="#2e1a0e"
          />
          {/* Eye-patch strap, then the patch, then the other eye. */}
          <path d="M83,31 L117,47" stroke="#14100d" strokeWidth="2.5" />
          <ellipse cx="90" cy="40" rx="6" ry="7" fill="#14100d" />
          <circle cx="109" cy="41" r="2.2" fill="#1d1109" />
          {/* Bandana: dome, band, knot and two fluttering tails. */}
          <path d="M78,39 a22,22 0 0 1 44,0 Z" fill="#c03a30" />
          <rect x="76" y="35" width="48" height="7" rx="3" fill="#a02c24" />
          <circle cx="125" cy="39" r="4" fill="#a02c24" />
          <path d="M127,41 q11,3 9,16 q-6,-2 -9,-8 Z" fill="#c03a30" />
          <path d="M128,44 q12,0 15,10 q-7,1 -12,-4 Z" fill="#c03a30" />
        </g>

        {/* ── Wheel + arms + hands (one group: the grip never
            leaves the rim as it swings) ── */}
        <g className="helm-wheel-rock">
          {/* Arms: coat sleeves from the shoulders to the 10-and-2
              grips; hands land on top of the rim below. */}
          <path
            d="M57,93 L65,75"
            stroke="#6e2a1e"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M143,93 L135,75"
            stroke="#6e2a1e"
            strokeWidth="13"
            strokeLinecap="round"
          />

          {/* Eight protruding handles outside the rim. */}
          {HANDLES.map((a) => (
            <g key={`h${a}`} transform={`rotate(${a} 100 136)`}>
              <rect
                x="95.5"
                y="46"
                width="9"
                height="26"
                rx="4.5"
                fill="url(#helmWood)"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth="0.75"
              />
              <circle cx="100" cy="52" r="3.6" fill="#b08a3e" />
            </g>
          ))}

          {/* Rim: dark outer edge, timber ring, brass band inside. */}
          <circle cx="100" cy="136" r="78" fill="none" stroke="#3a2008" strokeWidth="4" />
          <circle cx="100" cy="136" r="71" fill="none" stroke="#7c4f1e" strokeWidth="11" />
          <circle cx="100" cy="136" r="63.5" fill="none" stroke="#b08a3e" strokeWidth="3" />

          {/* Face + eight spokes, hub to rim. */}
          <circle cx="100" cy="136" r="62" fill="url(#helmFace)" />
          {HANDLES.map((a) => (
            <rect
              key={`s${a}`}
              x="96.5"
              y="75"
              width="7"
              height="50"
              rx="3"
              fill="url(#helmWood)"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="0.75"
              transform={`rotate(${a} 100 136)`}
            />
          ))}

          {/* Brass hub cap + centre bolt. */}
          <circle cx="100" cy="136" r="17" fill="url(#helmCap)" stroke="#8a6414" strokeWidth="2" />
          <circle cx="100" cy="136" r="5" fill="#54300e" />

          {/* Hands ON the rim at 10 and 2 — the grip that sells it. */}
          <circle cx="65" cy="75" r="8.5" fill="#d99e63" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
          <circle cx="135" cy="75" r="8.5" fill="#d99e63" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
