// REMOVED 2026-11-10 — the desktop SideNav rail shipped in the
// presence/ticks batch (commit cbec2a24) and the owner rejected it the
// same day: "i dont want the side bar — the dial will be same and big
// for the pc users; after clicking in the dial the user gets the dial
// to the left and the chat interface will open [on the right]".
//
// Desktop navigation is now the dial itself: components/DialShell
// (client) + components/DialShellServer (badges), wired from
// app/layout.tsx. Nothing imports this file any more; it stays as an
// inert stub because snapshot pushes cannot delete remote files.

export {};
