"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The round rotating dial — OneUco's home navigation.
// Five stops arranged on a circle; tapping one spins the ring so the stop
// rotates to the top marker, then navigates. (The mechanical rotary-dial
// sound and unread-count badges from the full spec land in a later slice.)

interface DialStop {
  label: string;
  href: string;
  angle: number; // degrees, clockwise from the top
}

const STOPS: DialStop[] = [
  { label: "Servers", href: "/servers", angle: 0 },
  { label: "Swipe Deck", href: "/swipe", angle: 72 },
  { label: "Friends", href: "/friends", angle: 144 },
  { label: "Chirp", href: "/chirp", angle: 216 },
  { label: "Profile", href: "/profile", angle: 288 },
];

const RADIUS_REM = 8;

export default function DialNav() {
  const router = useRouter();
  const [rotation, setRotation] = useState<number>(0);
  const [selected, setSelected] = useState<string>("OneUco");

  function choose(stop: DialStop): void {
    setRotation(-stop.angle);
    setSelected(stop.label);
    // Let the spin read before the page changes.
    window.setTimeout(() => {
      router.push(stop.href);
    }, 280);
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-80 w-80 max-w-[85vw]">
        {/* Top marker */}
        <div className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1 rounded-full bg-white" />
        {/* Rotating ring */}
        <div
          className="absolute inset-0 rounded-full border border-neutral-800 bg-neutral-950 shadow-[0_0_60px_rgba(255,255,255,0.04)] transition-transform duration-500 ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {STOPS.map((stop) => (
            <button
              key={stop.href}
              type="button"
              onClick={() => choose(stop)}
              aria-label={`Open ${stop.label}`}
              className="absolute left-1/2 top-1/2 flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-black text-center text-[11px] font-medium leading-tight text-neutral-200 transition hover:border-white hover:text-white"
              style={{
                transform: `translate(-50%, -50%) rotate(${stop.angle}deg) translateY(-${RADIUS_REM}rem) rotate(${-stop.angle - rotation}deg)`,
              }}
            >
              {stop.label}
            </button>
          ))}
        </div>
        {/* Fixed centre readout (does not rotate) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-800 bg-black text-center">
          <span className="px-2 text-sm font-semibold text-white">{selected}</span>
        </div>
      </div>
      <p className="text-xs text-neutral-500">Tap a stop to open it.</p>
    </div>
  );
}
