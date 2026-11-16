"use server";

// REMOVED (2026-11-17, owner's call): the Maya Jwalam "show me your
// profile" reveal feature — requestRevealAction / respondRevealAction
// / revokeRevealAction used to live here. Profiles are public anyway,
// so the reveal dance was friction without a purpose; Jwalam posts
// are simply anonymous now, with no unmasking path.
//
// This file remains as an inert stub because snapshot pushes cannot
// delete remote files; nothing imports it anymore. The
// reveal_requests table stays in the database (unused) and old rows
// remain visible read-only on the admin requests page.
export async function revealFeatureRemoved(): Promise<void> {
  // Intentionally empty.
}
