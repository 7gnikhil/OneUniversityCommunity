// Servers — public servers, private friend groups and stranger groups.
//
// Feature port TODO:
// - Server list pinned with the main server first: "Maya Jwalam"
//   (servers.is_main_channel = true), rendered as a TELEGRAM CHANNEL:
//   header (round avatar, name, member count, search/more), pinned-message
//   bar, centred date separators, Telegram bubbles, time + view counts,
//   pill composer. Its messages/images come from `server_messages` and the
//   `server-images` bucket.
// - Maya Jwalam is ANONYMOUS to members: no name/username/OneUco ID/photo
//   is ever returned for member viewers (the API strips author fields;
//   author_id stays in the DB for owner/admin moderation only), no member
//   list, no profile tap-through. Members may send a "Show me your profile"
//   reveal request (see `reveal_requests`) — identity is revealed per-pair
//   only on the poster's Accept.
// - All other servers keep the standard (Discord-style) server layout:
//   channels, coloured sender names, flair + branch chips.
// - Flairs: built-in "ReqToAdmin" only; mods/admins may create more.
//   ReqToAdmin-tagged messages surface in the admin requests queue.
// - Private groups: invite by code (group_invites.invite_code), shareable
//   link, or direct add of friends from inside the group.
// - Mobile rule: chat-first layout — slim header, message list takes all
//   remaining height, slim pill composer; composer rides above the keyboard.
export default function ServersPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Servers</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — servers, channels and the anonymous Maya Jwalam channel
        are ported here in the feature phase.
      </p>
    </main>
  );
}
