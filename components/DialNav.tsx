// RETIRED 2026-11-11 — the rotary dial was removed by the owner's
// call ("I think we don't need that dial anymore"). The bottom tab
// bar (components/BottomBar) is the app's navigation, the app opens
// on Fling, and /home is a plain brand home now.
//
// This file remains only because snapshot pushes cannot delete
// remote files; it is an inert stub. The dial's data contracts
// (STOPS, DialBadges, the palette/picker types) live on in
// lib/nav-stops.ts and are re-exported here so any stale import
// path still resolves to the real definitions. Nothing renders
// this component, and nothing should.

export * from "@/lib/nav-stops";

export default function DialNav(): null {
  return null;
}
