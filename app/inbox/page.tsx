// Inbox — everything addressed to the user that isn't a chat.
//
// Feature port TODO (data in `inbox_items`):
// - Profile-reveal requests from Maya Jwalam (Accept / Reject; revoking a
//   past reveal also lives here).
// - Reveal outcomes for the requester (accepted -> link to the revealed
//   profile; declined -> polite notice, poster stays anonymous).
// - Group invites received, verification outcomes, Req to Developer status
//   updates, admin notices.
// - Read/unread state; the unread count feeds the global badge system.
export default function InboxPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — the Inbox is ported here in the feature phase.
      </p>
    </main>
  );
}
