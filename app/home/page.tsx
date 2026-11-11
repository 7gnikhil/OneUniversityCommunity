import { redirect } from "next/navigation";

// REMOVED (2026-11-11, owner's confirmation) — there is no home /
// dial page anymore. This route existed first as the rotary dial
// and briefly as a plain brand home; the owner then confirmed the
// page itself goes: "yes — the dial page." The app opens on Fling
// and the bottom bar is the navigation, so anything still pointing
// at /home (old links, bookmarks, an installed PWA) lands on the
// deck instead. The "← OneUco" header links were repointed to
// /swipe in the same change.
//
// This file remains a redirector rather than being deleted
// because snapshot pushes cannot delete remote files.
export default function RemovedHomePage(): never {
  redirect("/swipe");
}
