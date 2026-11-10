# Build notes — presence / ticks / desktop rail batch (migration 0007)

Working-tree only: nothing pushed, deployed, or applied to Supabase.
`supabase/migration-0007.sql` must run BEFORE (or with) this code ships;
every new read fails soft until it lands (see "Fail-soft" below).

## A) Link normalisation (https:// by default)
- NEW `lib/urls.ts` — `normaliseUrl()`: trims; prefixes `https://` when
  no scheme is present; leaves an explicit `http://` alone; upgrades
  protocol-relative `//x` to `https://x`.
- `lib/preferences.ts` — `normalisePortfolio()` now runs every value
  through `normaliseUrl()`. That one function is the choke point for
  the editor's save payload, the profile server action, the profile
  page's initial state and the public profile page's display, so save
  AND display are covered with no other edits.
- Searched for other user-pasted URL inputs: the server icon is an
  upload (not a paste), Chirp has no URL field, sign-up never collects
  links. Portfolio links are the only pasted-URL input in the app.

## B) Presence + live counter + admin accounts list
- NEW `lib/presence.ts` (service-role only, mirrors lib/follows.ts):
  `heartbeat()`, `setTyping()`, `getPresenceMap()`, `isOnline()`
  (3-minute window), `isTypingAt()`, `getOnlineCounts()`,
  `listAccountsWithPresence()`, `getPrivacySettings()` /
  `getPrivacyMap()` (defaults: both switches ON).
- NEW `app/presence/actions.ts` — `heartbeatAction()` (cheap session
  resolution, poll-style), `setTypingAction()` / `clearTypingAction()`.
  Typing targets are VERIFIED before writing: DM = I must be a party
  to the match; server = the channel must exist and I must be a member
  of its server. Actor always from the session.
- NEW `components/PresenceHeartbeat.tsx` — pings on mount + every 30s
  (skips hidden tabs, re-beats on visibility return), fails silently.
  Mounted from the root layout only when a session exists.
- `app/admin/page.tsx` — "Total accounts" and new "Online now" stat
  cards both link to `/admin/accounts`; the stale "Pending
  verification" card now links to `/admin/accounts?filter=pending`
  with the hint "Accounts stuck in the old ID-review state — open to
  fix". Other cards unchanged.
- NEW `app/admin/accounts/page.tsx` (+ `actions.ts`,
  `MarkVerifiedButton.tsx`) — every account as stacked cards (no
  table, no horizontal overflow): photo/initial, name (fallback
  @username), status chip, @username, OneUco ID, email, self-declared
  college, joined date, last seen (green dot + "Online now" when
  within 3 minutes, else relative/"Never"). Pending rows get a
  "Mark verified" button; the action re-checks the Admin Pass and the
  update is guarded on the row still being `pending_verification`.
  `?filter=pending` narrows the list; filter chips show counts.
  This page intentionally shows email/college — it is the owner's
  moderation view behind `requireAdminPage`, never student-facing.

## C) Admin responsiveness
- Audit result: there are NO `<table>` elements anywhere under
  `app/admin/**` — every queue is already card-based with flex-wrap
  rows, and the flair form already wraps. The real small-screen cost
  was page padding, so all admin mains (home, requests, flairs,
  colleges, reports, developer-requests, accounts) went from `p-6` to
  `p-4 sm:p-6`. The home stat grid was already `grid-cols-2`. Desktop
  appearance is unchanged.

## D) Desktop / tablet layout — left navigation rail
- NEW `components/SideNav.tsx` — 240px (w-60) rail, `hidden lg:flex`,
  sticky at viewport height: OneUco wordmark, Dial Home, Servers,
  Swipe Deck, Friends, Chirp, Inbox, Search, Profile, Settings
  (→ /profile, never claims active state — Profile owns it), and Admin
  only when the layout passes `isOwner`. Active state follows
  `usePathname` with prefix matching, so chat/server/profile sub-pages
  light their section. It hides itself on /login, /signup,
  /forgot-password, /reset-password, /admin/login,
  /admin/forgot-password, /verify, /privacy, /terms.
- `app/layout.tsx` — resolves the session once (request-cached local
  claims, the same helper the dial home uses) and renders
  `SideNav` + `PresenceHeartbeat` only when signed in; content sits in
  a `min-w-0 lg:flex-1` column inside an `lg:flex` shell. Below lg the
  DOM is a plain block wrapper — the mobile shell is byte-for-byte the
  old behaviour.
- Judgement call: chat mains keep `h-dvh`. The rail is STICKY, not a
  fixed-height column, so the content column starts at the top of the
  viewport and a viewport-height chat still fits exactly; no page
  rewrites were needed. One caveat: while the Diwali banner is live it
  sits above the shell, so desktop chat pages extend one banner-height
  (~36px) past the fold until the banner window ends.

## E) Online + typing indicators with privacy settings
- Settings UI: NEW `app/profile/PrivacySettings.tsx` — "Privacy"
  section in the profile settings area with two switches, "Show my
  online status" and "Read receipts", saving immediately via NEW
  `updatePrivacyAction` in `app/profile/actions.ts` (session client,
  own row only). Failed saves roll the switch back. The profile page
  feeds initial values via lib/presence (fail-soft defaults).
- DM chat: the poll result carries `peerOnline` / `peerLastSeen` /
  `peerTyping`. All three are gated on the peer's show_online: hidden
  status → null/null/false, so the UI shows nothing (no last seen
  either). ChatView renders a status line under the header ("• online"
  in emerald, or "last seen …"), and an animated three-dot typing
  bubble at the foot of the message list.
- Server channels: `fetchServerMessagesAction` now returns
  `{ messages, typingNames }` (ServerChat updated). Names are scoped
  to the server's members, exclude self, and exclude members whose
  show_online is off. Rendered above the composer as "X is typing…" /
  "X and Y are typing…" / "X, Y and Z are typing…".
- Composers (DM + server) emit typing on change, throttled to one
  call per 3s while the draft is non-empty, clear on empty/send/
  unmount; the server stamps a 4s expiry per call as the safety net.
- Friends list: green dot on the avatar when the friend is online AND
  their show_online is on.
- NOT done, deliberately: typing for Maya Jwalam. Its invariant is
  server-side anonymity — surfacing typing names there would break
  it, and the spec's server-typing requirement is met by normal
  server channels.

## F) Message ticks (DMs)
- `messages.delivered_at` (migration 0007) is marked server-side,
  batched, inside the existing flows — the DM poll marks the open
  match's incoming messages, and a Friends-list load marks all of
  mine (`markIncomingDelivered` in lib/social.ts). No new requests.
- Read marking is unchanged (`markMatchReadAction`), but the SENDER's
  view is now shaped by the RECEIVER's read_receipts switch: when off,
  the poll strips read_at from the sender's tick array and message
  rows, and the chat page strips it from the initial load too — the
  sender's ticks simply never turn yellow. The receiver's own unread
  badges are computed elsewhere and are unaffected.
- Bubbles render ticks for own messages at the bottom-right with the
  time: one grey ✓ = sent, two grey ✓✓ = delivered, two amber-400
  ✓✓ = viewed. The old "· Read" text is gone.

## G) Speed — incremental polling
- DM poll: `fetchMessagesAction(matchId, since)` returns only
  messages at/after the client's newest created_at (gte, not gt —
  the boundary row re-merges by id, so same-millisecond messages
  can't be lost), the tick states for the latest 50 own messages, and
  the presence triple — one request, same 5s cadence. First load /
  null cursor falls back to the full window.
- Server poll: lib/servers' fetch already windows (latest 100), so
  per the brief it was left as-is apart from adding typingNames to
  the same response.
- Request COUNT is unchanged everywhere: presence rides the 30s
  heartbeat + the existing 5s polls; delivery marking rides the poll
  and the friends-list load.

## Files changed
New: supabase/migration-0007.sql, lib/urls.ts, lib/presence.ts,
app/presence/actions.ts, components/PresenceHeartbeat.tsx,
components/SideNav.tsx, app/profile/PrivacySettings.tsx,
app/admin/accounts/{page,actions,MarkVerifiedButton}.tsx,
BUILD_NOTES.md.
Edited: lib/preferences.ts, lib/social.ts, app/layout.tsx,
app/friends/{page,actions}.ts(x), app/friends/[matchId]/{page,ChatView}.tsx,
app/servers/actions.ts, app/servers/[serverId]/ServerChat.tsx,
app/profile/{page,actions,ProfileEditor}.tsx, app/admin/page.tsx,
app/admin/{requests,flairs,colleges,reports,developer-requests}/page.tsx.

## Fail-soft note for whoever deploys
Until migration 0007 runs, presence/privacy reads degrade to
"offline / defaults" instead of erroring, and delivery marking is
skipped silently — BUT the new `delivered_at` column is part of
lib/social's message column list, so message reads themselves need
the column. Apply the migration before (or together with) the push,
not after.

## Verification done here
No node_modules in this tree (Vercel is the compiler), so no local
tsc/build was run. Every new/edited file passed a TypeScript syntax
parse (compiler API, zero parse diagnostics), and all call sites of
the two changed action signatures (fetchMessagesAction,
fetchServerMessagesAction) were grep-checked — ChatView and
ServerChat are the only callers and both are updated.

---

# Addendum — 2026-11-10 correction: the dial IS the desktop navigation

The owner rejected the SideNav rail above the same day it shipped:
"i dont want the side bar — the dial will be same and big for the pc
users; after clicking in the dial the user gets the dial to the left
and the chat interface will open [on the right]". This addendum
supersedes section D of the notes above. Working-tree only again:
nothing pushed or deployed.

## What changed
- `components/SideNav.tsx` — gutted to an inert stub (comment +
  `export {}`); snapshot pushes cannot delete remote files, so the
  stub is what removes the rail. Nothing imports it.
- `app/layout.tsx` — SideNav import and the `lg:flex` rail wrapper
  removed; content is full-width again. For signed-in users the
  children are wrapped in the new `DialShellServer`; the layout's
  session resolution is unchanged and still shared with the presence
  heartbeat (request-cached, no double Auth fetch). The now-unused
  `isOwnerEmail` import went with the rail.
- NEW `components/DialShell.tsx` (client) — pathname-driven shell:
  - `/` → children bare (home renders its own big dial).
  - Auth/legal/setup routes (`/login`, `/signup`, `/forgot-password`,
    `/reset-password`, `/admin/login`, `/admin/forgot-password`,
    `/verify`, `/privacy`, `/terms`, `/auth/*`) → children bare.
  - Any other route → `lg:flex` row: a left column (`hidden` below
    lg; `lg:flex`, 230px, sticky, `h-dvh`, wordmark on top) holding
    the compact dial, and the page in a `flex-1 min-w-0` right
    column. Below lg the wrapper is a plain block, so phones/tablets
    render byte-identically to before. Admin routes DO get the shell
    (there is no app/admin/layout.tsx to conflict with; the dial sits
    outside the admin pages' own padding/headers).
- NEW `components/DialShellServer.tsx` — resolves the account
  (request-cached `getMyAccount`) and the dial badges via the shared
  helper, then renders `DialShell`. Signed-out → children bare.
- NEW `lib/dial-badges.ts` — `getDialData()`: the badge computation
  factored verbatim out of the dial home (profile accent + DM unread
  in parallel; server + inbox unread via the service-role client,
  fail-soft). Returns `{ badges, inboxUnread }`.
- `app/page.tsx` — dial home now calls `getDialData()`; rendered
  output unchanged.
- `components/DialNav.tsx` — two new optional props (home usage
  untouched):
  - `size?: "home" | "shell"`. Home sizing is now three-step:
    264px below md (unchanged), 200px on md (unchanged), **360px on
    lg+** (was 200px — the "dial reads small on PC" complaint). Shell
    is a fixed 190px and drops the "Drag the dial…" caption (no room
    for it in a 230px column; the wheel works identically).
  - `activePath?: string`.

## How the active stop is derived
`stopIndexForPath()` (exported from DialNav): /servers* → Servers,
/swipe → Swipe Deck, /friends* → Friends, /chirp → Chirp,
/profile* → Profile; anything else (home, /inbox, /search, /admin,
public profile pages) → null, no stop forced. The shell dial
initialises its angle/selection from the route, and an effect snaps
(no spring, no sound) to the new section's stop when the route
changes — the tap that navigated already played the full spin, and
link/keyboard navigation shouldn't replay sounds. Dragging to
explore never changes the route, so it never trips the effect;
tapping a stop keeps the existing spin-then-`router.push` behaviour.

## Chat heights in the shell
DM chat (`app/friends/[matchId]`) and server pages keep their
`h-dvh` mains. The shell's right column is an unconstrained block
(not a height-bounded flex child), so those pages fill the viewport
exactly as before — no nested-dvh double scroll, no page edits
needed. The one standing caveat is unchanged from the rail design:
while the Diwali banner is live it adds its height above the shell.

## Known minor cost
On `/` the badge counts are computed twice per request — once by
DialShellServer (which cannot know the pathname server-side; the
middleware sets no pathname header) and once by the home page
itself. Four lightweight count queries; the shell discards its copy
on `/`. Left as-is rather than growing middleware surface for it.

## Verification done here
Same constraint as above (no node_modules; Vercel is the typecheck).
All seven touched/new files — DialNav, DialShell, DialShellServer,
SideNav stub, layout, home page, lib/dial-badges — passed a
TypeScript syntax parse (compiler API, zero diagnostics). Remaining
`SideNav` references are comments only (grep-verified).
