// Friends — the dial's chat stop: DM list for friends & matches.
//
// Feature port TODO:
// - List comes from `matches` (+ accepted friends): avatar, name, last
//   message preview, per-chat unread badge.
// - Tapping opens the 1-to-1 chat (same chat screen as match DMs — one
//   implementation, data in `messages`), with gallery image support.
// - Chat layout follows the mobile chat-first rule (see servers page notes).
export default function FriendsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Friends</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — friend chats / DMs are ported here in the feature phase.
      </p>
    </main>
  );
}
