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

---

# Addendum — 2026-11-10: Live News + weather inside Chirp

Owner request: a LIVE news block inside Chirp (/chirp) — photos on
every card, national / government / regional / tech / sports (+ a
Celebs tab added the same day), live weather for the student's own
place, and it must stay fresh without a page reload. Working-tree
only: nothing pushed, deployed, or applied to Supabase. No new
dependencies and no API keys anywhere.

## What was built
- NEW `lib/news.ts` — the whole data layer (server-side only):
  - A defensive regex RSS parser: CDATA unwrapping (The Hindu wraps
    title/link/pubDate/description in CDATA), HTML-entity decoding,
    tag-stripped summaries truncated at 180 chars, and an image hunt
    in order media:content → media:thumbnail → image enclosure →
    first <img> in the description. Attribute reading accepts BOTH
    quote styles — Bollywood Hungama emits `url='…'` single-quoted,
    which the first cut missed (caught in the live smoke test:
    celebs went 10/12 → 12/12 images after the fix).
  - `getNews(category, region)`: fetches the category's feeds in
    parallel (`fetch` with `next: { revalidate: 600 }`, so Vercel's
    data cache holds upstream RSS for 10 min), merges, dedupes by
    link and by title, sorts by pubDate desc, caps at 12 items, then
    fills missing photos (below).
  - `getWeather(region)`: Open-Meteo current conditions, same
    10-min cache; WMO weather_code → label map.
  - `resolveRegionForAccount(supabase, account)` (below).
- NEW `components/NewsSection.tsx` (client) — rendered by the chirp
  page between the page header and the (untouched) ChirpFeed, so
  user chirps and the composer are exactly as before. Contents:
  header row (pulsing red LIVE dot + "Updated HH:MM" stamp), the
  weather card (place, °C, condition, humidity, wind — omitted if
  the weather fetch failed), category tabs (Top Stories, National,
  Regional, Tech, Sports, Celebs), and a card grid (1 column, 2 on
  sm+ within the chirp column): photo (16:9, lazy, hides on error),
  source + time-ago, headline, 2-line summary; tapping opens the
  original article in a new tab. Tabs lazy-load on first open; the
  open tab + weather auto-refresh every 5 minutes via the server
  actions (no page reload); time-ago labels re-tick every minute.
  Failed/empty categories show "News unavailable right now — check
  back in a bit", never an error page.
- `app/chirp/actions.ts` — NEW `getNewsAction(category)` and
  `getWeatherAction()`. The category string is validated against the
  known list (anything else → Top). The region is ALWAYS resolved
  server-side from the session account; the client never names a
  place.
- `app/chirp/page.tsx` — server-renders the first paint: region +
  Top news + weather in parallel with the existing feed reads, and
  passes them to NewsSection as props.

## Feeds wired (all verified with curl on 2026-11-10)
| Tab | Feed | Items | Images | Freshness |
|---|---|---|---|---|
| Top | The Hindu front page (thehindu.com/feeder/default.rss) | 60 | media:content on ~54 | same-hour |
| Top | Indian Express India (indianexpress.com/section/india/feed/) | 200 | media:content + thumbnails | same-hour |
| National | The Hindu National (…/news/national/feeder/default.rss) | 60 | ~59 | same-hour |
| National | Indian Express India (same as Top) | 200 | yes | same-hour |
| Tech | The Hindu Sci-Tech (…/sci-tech/feeder/default.rss) | 60 | ~58 | same-hour |
| Tech | Indian Express Technology (…/section/technology/feed/) | 200 | media:content | same-hour |
| Sports | The Hindu Sport (…/sport/feeder/default.rss) | 60 | ~44 | same-hour |
| Sports | ESPNcricinfo (espncricinfo.com/rss/content/story/feeds/0.xml) | 100 | media:content on all | same-hour |
| Celebs | Indian Express Entertainment (…/section/entertainment/feed/) | 200 | media:content + thumbnails | same-hour |
| Celebs | Bollywood Hungama (bollywoodhungama.com/rss/news.xml) | 50 | media:content on all 50 (single-quoted attrs) | same-hour |
| Regional | The Hindu city/state feeders (below) | 60 each | most items | same-hour |

Regional feeders wired (all verified 200/60 items): Hyderabad,
Chennai, bangalore (lowercase path works; capital-B also resolves),
Delhi, mumbai, Kolkata, Kochi, Thiruvananthapuram, Vijayawada, plus
the Andhra Pradesh and Telangana state feeders used for state-level
matches and the default region.

Rejected candidates: PIB (pib.gov.in RssMain) — returns 200 with 20
items but the feed is Hindi-only with NO pubDate, NO description and
NO photos, so it cannot be time-sorted or card-rendered; "government"
coverage folds into National via Hindu National + IE India as the
brief allowed. Gadgets 360 and both NDTV feeds (gadgets + sports)
return 403 to server-side fetches — dropped, not wired. Pinkvilla
(/feed 404, /rss is an HTML page), Filmfare (/feed and /rss 404) —
dead. Times of India Entertainment verifies (20 items, fresh) but
carries NO images at all — dropped for Celebs, where photos are the
point; HT Entertainment also verified (72 items, all with
media:content) but IE + Bollywood Hungama were the stronger pair.

## Region resolution (lib/news.ts)
Accounts carry a self-declared `college_name` + `college_code`
(there is no colleges table / profiles.college_id in this schema);
the `college_codes` registry has a `city` column. Resolution order:
1. college_codes.city via the account's college_code,
2. college_codes.city via the exact college_name,
3. keyword/alias match on the college name (Hyderabad, Chennai,
   Bengaluru/Bangalore, Delhi, Mumbai, Kolkata, Kochi/Cochin/
   Ernakulam, Thiruvananthapuram/Trivandrum, Vijayawada, state names),
4. default: "Andhra Pradesh & Telangana" (both state feeders merged,
   labelled as such; weather anchored on Hyderabad).
Each region also carries lat/lon for weather (state regions anchor
on Vijayawada for AP, Hyderabad for Telangana).

## Weather
Open-Meteo (no key): /v1/forecast?latitude&longitude&current=
temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m
&timezone=auto. Verified with curl for Hyderabad coords during the
build (26.6 °C, code 0 → "Clear sky" at the time). Failure → the
weather card is simply omitted.

## Photo fallback (owner refinement: "any with photos — use API,
open source ones")
Every card should carry a photo. Chain per item, applied to ALL
categories inside `getNews` (so it runs once per 10-minute cache
window per category, capped at the 12-item page — never per page
view):
1. The feed's own image (parser hunt above) — the wired feeds are
   image-rich, so this covers most items.
2. Openverse API (api.openverse.org/v1/images, anonymous tier, no
   key): query = the headline's significant words (stopwords
   stripped, first 5 content words — headlines lead with the
   subject, which is what makes celeb names land). Field used:
   `thumbnail` FIRST (Openverse serves it from its own CDN for
   embedding), falling back to the direct `url`. Caveat: the API
   itself returns 504 through this build sandbox's proxy on every
   attempt, so neither field could be load-tested from here — the
   preference is by design, and step 3 covers the gap if Openverse
   is unreachable in production too.
3. Wikimedia Commons API search (generator=search, namespace 6,
   imageinfo thumburl at width 800) with the same query. VERIFIED
   end-to-end during the build, including a hotlink check on
   upload.wikimedia.org (HTTP 200).
4. Still nothing → the card renders a styled gradient tile with the
   category label (per-category gradient in NewsSection), never a
   broken-image icon. Client-side, an <img> that errors also swaps
   to the same tile.

## Verification done here
Same constraint as previous builds (no node_modules; Vercel is the
typecheck): all four touched/new files — lib/news.ts,
app/chirp/actions.ts, app/chirp/page.tsx, components/NewsSection.tsx
— passed a TypeScript syntax parse (compiler API, zero diagnostics).
Beyond parsing, lib/news.ts was transpiled and RUN against the live
feeds: Top 12 items (12 with photos, correctly merged/sorted across
both sources), Celebs 12/12 photos after the quote-style fix, Sports
12/12 (Hindu items without photos visibly filled from Wikimedia
Commons by the fallback), Regional (default AP+Telangana and
Hyderabad) 12 items each, and weather returned a full card for the
default region. NOT verified: Openverse (sandbox 504, above) and
the in-browser rendering (parent's live check after deploy).

---

# Addendum 2026-11-10 (later) — App interfaces: admin default + dial-picked per-user themes

Owner ask: "add any interfaces for the admin so i can change it — like
some 15-20 interfaces, full app, not just for header." Redirected
mid-build: interfaces are NOT colour swaps — each bundles palette +
dial skin + background treatment + surface style; the ADMIN pick is
only the app-wide DEFAULT; every student picks their OWN interface by
long-pressing the dial and swiping through live previews; a list in
Profile settings is the accessibility fallback.

## Theme definitions — lib/themes.ts (single source of truth)
18 interfaces, each: id, name, vibe, mode (dark/light), dialSkin
(display name), bgPattern (none|grid|dots|stars|glow), surfaceStyle
(flat|glass|soft|bordered) and a full token set:
--bg-from/--bg-to/--bg-solid (page gradient), --surface, --surface-2,
--border, --accent, --accent-2, --accent-text, --text, --text-2,
--muted, plus dial tokens (face background, ring, tick, glow shadow,
frosted blur).
Roster: Default Midnight (carbon, the current look), Diwali (brass,
stars, bordered), Ocean Deep (chrome, glow, glass), Sunset Vibes
(copper, glow, soft), Forest (moss, dots), Royal Violet (chrome,
stars, bordered), Crimson (carbon, glow), Rose Pink (blush, dots,
soft), Cyber Neon (neon ring, grid, bordered), Sakura (light; pastel,
dots, soft), Lavender Haze (light; frosted glass), Mint Fresh
(chrome, dots, glass), Coffee House (wood, soft), Solar Amber (brass,
glow), Ice Blue (frosted, stars, glass), Monochrome (mono metal,
grid, bordered), Peachy Light (light; pastel, dots, soft), Paper
Light (light; porcelain, bordered).

## Application mechanism
- Root layout (app/layout.tsx) resolves the applied interface
  server-side and stamps <html> with data-theme / data-theme-mode /
  data-pattern / data-surface + the token variables inline. NO stamp
  in seasonal-auto → zero rules match → the app renders exactly as
  before (black/minimal + Diwali banner logic untouched, dates
  unchanged).
- globals.css gained a delimited "APP INTERFACES" section: body
  gradient/text under html[data-theme]; overrides remapping the app's
  most repeated hard-coded surfaces — bg-neutral-950→--surface,
  bg-neutral-900/800→--surface-2, bg-black→--bg-solid,
  border-neutral-800/700→--border, text-neutral-300→--text-2,
  text-neutral-400/500→--muted, placeholder colour, neutral hovers;
  the primary-button pair .bg-white.text-black→accent/accent-text
  (a lone bg-white, e.g. the privacy toggle knob, is NOT remapped);
  surface styles (glass = translucent surface + blur on
  bg-neutral-950; soft = larger radii on rounded-xl/2xl/3xl; bordered
  = stronger border mix); background patterns as a fixed body::after
  texture (z-index 1 — below sticky headers and modals, pointer-events
  none); light-mode fixes under [data-theme-mode="light"] (text-white
  and neutral-100/200 read as the theme's dark text ramp).
- The DIAL follows via lib/dial-badges: when an interface applies,
  badges.accentHex becomes the theme accent and badges.theme carries
  the dial palette; DialNav renders face/ring/ticks/glow/blur and its
  surface/text tones from it (classic constants as fallback). Skin
  rendering is token-driven — no per-skin CSS classes in the dial.
- Fail-soft everywhere: any read error/missing table/missing column →
  no stamp, classic dial, seasonal look.

## Honest limits — what an interface can NOT restyle here
- One-off hard-coded colours outside the remapped utility set (e.g.
  bg-neutral-800 chips in a few components use the surface-2 mapping
  fine, but bespoke hexes inline in SVG/canvas-ish code stay).
- Semantic colours deliberately excluded: online emerald, report/
  logout red, warning amber, status chips — they mean something.
- Photos, avatars and user images are never tinted.
- The Diwali BANNER keeps its own gold styling; it is a seasonal
  layer, not part of the interface tokens.
- Per-user PROFILE accent (accent_color) still drives profile-page
  flourishes; on the dial it yields to the applied interface's accent
  whenever one applies (interface > profile accent), and returns in
  seasonal-auto with no pick.

## Storage + resolution (migration-0008.sql — APPLY FIRST, code is fail-soft before it)
- app_settings key 'theme' = admin default, JSON text
  {"mode":"auto"} | {"mode":"manual","id":"…"}. The table ALREADY
  EXISTS in production (migration 0003, value TEXT — Diwali mode
  lives there), so the migration's create-if-not-exists (jsonb, for
  fresh DBs) is a no-op live; the writer stores JSON.stringify and
  parseThemeSetting accepts string-or-object, so both column types
  work. Seed row inserted on conflict do nothing. RLS on, no
  policies (service-role only), same as diwali_mode.
- profiles.theme_id text (nullable) = the user's own pick.
  DELIBERATELY not added to lib/profile's PROFILE_COLUMNS — that read
  feeds every profile surface and would break until the migration
  lands; instead lib/server/theme-settings.getProfileThemeId does a
  dedicated fail-soft select of just theme_id.
- Admin read is unstable_cache'd (30s, tag 'app-theme', mirroring
  diwali-settings) because the layout asks on every render;
  setThemeSetting revalidateTags so the owner sees it immediately,
  everyone else within ~30s ("within a minute" on the admin page).
- Resolution order: profiles.theme_id (valid id) > app_settings
  manual > seasonal auto (no stamp). The layout's profile read is one
  extra narrow query per signed-in render (getProfileThemeId); the
  session/account resolution itself was already there (getMyAccount
  is request-cached). getDialData independently resolves the same
  pair (its profile fetch doesn't carry theme_id — separate narrow
  read, cached admin setting shared) so dial and page always agree.

## The dial gesture (components/DialNav.tsx) — spec as built
- Enter: press-and-hold ≥500ms with no >2° movement, on the dial face
  OR any stop (both arm the same timer; movement disarms). The firing
  press is consumed (drag ref flag + click suppression) so it never
  drags or navigates. Entry feedback: clunk + 30ms haptic + a 1.045
  scale pulse for 240ms. Physics/sound/navigation code otherwise
  untouched.
- Inside: stops hide; 19 dots (App Default + 18 interfaces) ring the
  rim at 360/19° spacing. Drag rotates; landing on a new index plays
  the ratchet tick, haptics, and PREVIEWS LIVE — applyThemeToRoot
  stamps the candidate on document.documentElement (same attrs/vars
  the layout stamps server-side, lib/themes helpers shared), so the
  whole app behind the dial re-skins in real time, and DialNav's own
  palette swaps to the previewed skin. Release springs to the nearest
  interface (existing spring, spacing-parameterised targets). Centre
  hub becomes a button naming the centred interface + its skin —
  tap = APPLY. Below the dial: hint "Swipe to browse interfaces —
  tap the centre to apply" + a ✕ Cancel button. Keyboard: arrows
  step, Enter applies, Escape cancels.
- Apply: stamp stays (it equals the server stamp), setMyThemeAction
  writes profiles.theme_id (session client, RLS owner-only), then
  router.refresh(). Starts centred on the user's saved pick (or App
  Default). "App Default"'s preview = the admin default theme (or
  stamp-clearing when the default is seasonal).
- Cancel paths: ✕ button, Escape, route change (activePath differs
  from entry path), and unmount — all restore the exact pre-entry
  root snapshot (attrs + inline vars) unless a pick was saved.
- Also shipped: components/InterfacePicker.tsx in Profile settings
  (list twin using setMyThemeFormAction — App Default row + all 18
  with gradient/surface/accent previews), and /admin/appearance
  (requireAdminPage gate; action re-checks passesAdminGate) framed
  as the app-wide DEFAULT with an Auto (seasonal) control; admin home
  gained an "Appearance & interfaces" tool card.

## Verification done here
Same constraint as previous builds (no node_modules; Vercel build is
the typecheck): all 14 touched/new TS/TSX files — lib/themes.ts,
lib/server/theme-settings.ts, app/layout.tsx, lib/dial-badges.ts,
components/DialNav.tsx, components/DialShell.tsx,
components/DialShellServer.tsx, app/page.tsx, app/profile/page.tsx,
app/profile/theme-actions.ts, components/InterfacePicker.tsx,
app/admin/appearance/{page,actions}.ts(x), app/admin/page.tsx —
passed a TypeScript syntax parse (compiler API, zero diagnostics);
globals.css brace balance verified. NOT verified here: the Vercel
typecheck/build, live gesture feel, and the visual result of each
interface (parent's post-deploy live check). Chirp/news files and
BUILD_NOTES' news section untouched — this addendum only appends.

---

# Addendum — Developer anonymity on public surfaces (2026-11-10)

Bug reported by the owner from the live app: his Chirp post rendered
as "Developer @7gnikhil" — name/handle/photo publicly linkable to the
Developer label, breaking the 2026-11-07 anonymity rule (already
honoured by the masked /profile page and the neutral admin card).

## Mechanism (one shared path, mask at the data layer)

- `lib/server/owner.ts` — NEW `getDeveloperAccountId(admin)`: resolves
  the developer's account id from the owner email (service-role read
  on accounts; the email never leaves the server). Fail-soft → null.
- `lib/social.ts` — NEW pure helpers: `DEVELOPER_DISPLAY_NAME`
  ("OneUCo Developer", matching the profile page / admin card),
  `developerPublicProfile(id)` (masked projection: name swapped,
  username "", photo/bio/branch null, `developer: true`),
  `maskDeveloperProfiles(map, id)` (swaps the developer's entry in a
  PublicProfile map BEFORE serialisation, so the real name/@handle/
  photo never ship to the client at all).
- `lib/types.ts` — `PublicProfile.developer?: boolean`; renderers
  treat a flagged author as unlinkable (plain name, no @handle, "D"
  avatar tile — same glyph as the masked profile page).

## Surfaces audited

| Surface | Leaked? | Action |
| --- | --- | --- |
| Chirp posts (lib/chirp.ts listChirps → ChirpFeed) | YES — the reported bug | Masked at data layer; ChirpFeed renders flagged author unlinked, no @, "D" avatar. listChirps gained an optional admin param; page + fetchChirpsAction pass one (fail-soft). |
| Chirp comments (listChirpComments → ChirpFeed) | YES | Same masking + renderer treatment. |
| Normal-server messages (lib/servers.ts listServerMessages → ServerChat) | YES (name + photo + profile link) | Masked at data layer; ServerChat renders flagged author unlinked, "D" avatar. |
| Normal-server member list (listServerMembers → server page → ServerSettings) | YES (name + @ + photo) | Masked at data layer; MemberEntryData gained `developer`, row renders unlinked with no @ line. Membership accountId/role untouched (kick/ban keys unaffected). |
| Normal-server typing names (app/servers/actions.ts poll) | YES (name, or @handle fallback) | Owner's entry replaced with "OneUCo Developer". |
| Swipe deck (lib/social.ts listDeckCandidates) | YES (card: photo gallery + name + @handle) | Developer is never dealt: swipe page resolves his id and passes it via the new optional `excludeAccountIds` param. A masked card makes no sense in a deck; exclusion matches "details never unlock, even for friends". FLAG for owner/parent: behaviour change beyond the reported bug — trivially revertible (drop the exclusion) if he disagrees. |
| Maya Jwalam (listJwalamMessages projection) | NO | Verified, untouched: anonymous by default, "admin-post" is badge-only, moderation shape is admin-only. The "revealed" shape shows a poster's real profile only under that poster's own accepted reveal grant — the developer accepting a reveal is his deliberate act, by design. |
| Search rows (app/search/page.tsx) | Handle only, NO Developer label | Left per brief: @handle exposure is uniform for every user and the row links to his already-masked profile page. |
| Public profile page | NO | Already masked (email-keyed); unchanged. |
| Home page "Admin" link | NO | Rendered only for the owner's own session. |
| DMs / friends list / own Inbox / own views | — | Out of scope per brief (relationship surfaces; people there already know him). Includes: other users' Inboxes showing his follow requests, ServerSettings "addable friends" (the viewer's own matches). Unchanged. |
| Admin pages | — | Owner-only already; moderation needs real identities. Unchanged. |

Notes: masking is unconditional per surface (not per-viewer) — in his
own feed the owner sees his chirps exactly as everyone else does
("OneUCo Developer"); `mine` is computed from author_id independently,
so his Delete/edit affordances still work. ServerMessageView.authorId
stays the real id (staff flair/moderation plumbing keys off it; it is
never rendered as identity text). No flair logic changed: a
"Developer" flair chip may still appear — the label is allowed, the
identity linkage is what died.

## Verification done here

All 13 touched TS/TSX files (lib/types.ts, lib/server/owner.ts,
lib/social.ts, lib/chirp.ts, lib/servers.ts, app/chirp/page.tsx,
app/chirp/actions.ts, app/chirp/ChirpFeed.tsx,
app/servers/[serverId]/page.tsx, ServerChat.tsx, ServerSettings.tsx,
app/servers/actions.ts, app/swipe/page.tsx) passed a syntax parse
(Bun transpiler, zero failures). No node_modules locally, so the
Vercel build remains the real typecheck; no live/E2E check was run
(parent verifies post-deploy). Forbidden files untouched (layout,
DialNav, globals.css, admin/appearance, themes, news files).

---

# Addendum — 2026-11-10 (evening): performance pass + page brief lines

Two briefs in one push, both driven by production measurements taken
the same day: opening a cold news tab took 20–25s, one Openverse call
took 13.4s, and every page render chained ~12–18 sequential Supabase
round trips. Working-tree only: nothing pushed, deployed, or applied
to Supabase.

## A) News photos + cold-load speed (lib/news.ts, components/NewsSection.tsx)

### The Hindu image diagnosis (empirical, curl — not guessed)
- Every wired Hindu feed (front page, National, Sci-Tech, Sport, the
  city feeders) serves item images the same way: `media:content`
  URLs, ALL of them `https://th-i.thgim.com/...` — across five feeds
  sampled, ZERO http:// image URLs and zero description <img>s. So
  the http→https theory does NOT explain the Hindu failures (the
  upgrade is still applied at parse time as defence for other
  sources/fallbacks — see below).
- Sampled thgim images (front page + sport, incl. a `.jpg.jpg`
  filename) returned `200 image/jpeg` in EVERY combination tried:
  no Referer, the app Referer
  (https://one-university-community.vercel.app/ and …/chirp), a
  random external Referer, default curl UA, and a full browser
  header set (Chrome UA, `Accept: image/avif,image/webp,…`,
  Sec-Fetch-Site/Mode/Dest cross-site/no-cors/image).
- Conclusion: nothing about the URLs or plain referer cases fails at
  the HTTP layer from here; the in-browser failures are consistent
  with the CDN refusing some hotlinked loads depending on the
  requesting browser/egress (which a sandbox curl cannot reproduce).
  The matching standard countermeasure is applied client-side: news
  <img>s now send `referrerPolicy="no-referrer"` — the request then
  arrives with NO Referer, which is exactly the combination verified
  200 above — plus `decoding="async"` (lazy loading was already on).
  If thgim images still fail for a given user after this, the
  remaining lever is proxying those images through our own origin;
  deliberately NOT built here (out of brief scope).

### Photo fallback, rebuilt for speed
Measured from the build sandbox on the day: Wikimedia Commons
search API → 200 in ~1.0s. Openverse API → 504 after ~8.6s (and
13.4s for one call in production). The old chain ran Openverse
FIRST, per item: any category with several imageless items paid
that wait repeatedly on a cold cache — the 20–25s Sports tab.
- New order: Commons first, Openverse second.
- Every lookup carries a hard 3s timeout
  (`AbortSignal.timeout(3000)`); a slow provider now costs at most
  ~6s of background time for one item (Commons timeout → Openverse
  timeout) and usually ~1s, and NEVER blocks siblings.
- Lookups run in PARALLEL across items with a concurrency cap of 4
  (a tiny worker pool in fillMissingImages), and only the first 8
  items of a category are eligible for fallback (feed-own images are
  unaffected at any position).
- A failed/timed-out lookup leaves imageUrl null → the card renders
  its gradient tile immediately, as before.
- Image URLs are https-normalised where they enter an item
  (parser + fallback results): http:// → https://, //host → https://.

### Client warmth
NewsSection now prefetches the remaining categories after first
paint: requestIdleCallback (2.5s timeout) where available, else a
1.5s setTimeout; strictly sequential, skipping anything already
fetched (a shared fetched-set also dedupes the tab lazy-loader;
only the 5-minute refresh forces a re-fetch). Cold categories cost
their seconds ONCE against the 10-minute server cache in the
background, so a tab switch afterwards reads warm cache instead of
paying the cold cost on tap. First paint, tab lazy-load and the
5-minute auto-refresh are otherwise unchanged.

## B) Page-render round trips (plumbing only — rendered output identical)

Root cause found while verifying the brief's premise: the
request-scoped cache() helpers in lib/auth/my-account key on the
Supabase client object, but lib/supabase/server's createClient()
built a NEW client per call — so the layout, the shell and the page
each held a different instance and every cache() missed. On `/` the
account lookup ran up to 3× and getDialData ran 2× (shell + page).

- `lib/supabase/server.ts` — createClient is now wrapped in React
  cache(): ONE session client per request, shared by layout, shell,
  page and actions. (Middleware untouched — it builds its own
  client.) This one change makes the existing getMySessionUser /
  getMyAccount memoisation actually dedupe.
- `lib/dial-badges.ts` — getDialData is now React cache()-wrapped:
  shell + home page share ONE badge computation per request.
- `lib/server/theme-settings.ts` — getProfileThemeId is now React
  cache()-wrapped (layout resolve, dial data and the profile page
  share one narrow query per request; the theme write path updates
  the column directly and never reads it back mid-request).
  resolveAppliedTheme now runs the user-pick read and the admin
  default read in Promise.all instead of serially — precedence is
  unchanged (valid own pick still wins; the admin read is
  unstable_cache'd 30s, so the overlap costs nothing steady-state).
- `app/layout.tsx` — the Diwali check is started first and awaited
  LAST, in one Promise.all with the theme resolution, instead of
  gating the whole chain; the session → account → theme sequence
  (which genuinely depends on itself) is unchanged.

Query-count effect (signed-in renders, steady state):
- `/` before: session/account lookups ~3× + dial data ~2× ≈
  profile 2, DM-unread 2, server-unread 2, inbox 2, theme_id 2–3,
  accounts up to 3 — roughly 13–15 round trips for the shared shell
  data alone. After: each of those runs exactly ONCE (~6), and the
  Diwali/theme reads overlap the rest instead of preceding them.
- Other sections: shell dial data was already single there, but the
  account lookup dedupes from ~2× to 1× and the theme_id read from
  2× (layout + dial) to 1×.

## C) Warm route — NEW app/api/warm/route.ts
GET → { ok: true }. Performs the layout's cheap shared reads so a
keep-warm ping keeps the function instance and the Supabase pool
hot: getDiwaliMode() (the seasonal setting read, unstable_cache'd)
+ one service-role head-count on accounts. Runtime nodejs,
force-dynamic, no auth — it exposes nothing (no data returned
beyond ok) and costs two cheap reads per hit; both reads are
best-effort (a failure still answers ok). PARENT: point the
keep-warm cron at /api/warm.

## D) Interface name truncation (FIX 4)
components/InterfacePicker.tsx: the row name was `block truncate` —
it now wraps (`leading-snug`, no truncate) so full interface names
always render. The admin appearance cards
(app/admin/appearance/page.tsx) were checked: their name spans
carry no truncate class (plain block, wraps naturally) — no change
needed there.

## E) Page brief lines — NEW lib/page-intros.ts + components/PageIntro.tsx
Owner ask: a brief info line about each page, at the top of the
page, on EVERY open — permanent furniture, not a dismissible tip:
no localStorage, no cookie, no dismiss button anywhere in the
implementation.
- `lib/page-intros.ts` — PAGE_INTROS, the single text map keyed by
  section (servers / swipe / friends / chirp / profile / inbox /
  search). Texts are the owner's lines verbatim; each was checked
  against the page's actual behaviour (yellow ✓✓ = seen, deck
  right-swipe = follow with details unlocking on acceptance, profile
  gallery/links/intention hidden until friendship, Jwalam anonymity)
  and none contradicted reality, so none were changed.
- `components/PageIntro.tsx` — renders one line: small muted text
  (text-xs, text-neutral-500 — which applied interfaces remap to
  their muted tone) with an accent dot coloured by the theme's
  --accent var (neutral-grey fallback in the seasonal look), so it
  reads correctly in dark themes, light themes and the classic look.
- Placements (immediately under each page's header row, top of the
  main column): /servers, /swipe, /friends, /chirp (under the
  header, ABOVE the Live News section, per brief), /profile (above
  the editor), /inbox, /search (above the search form). Pages shown
  only in their "account isn't finished" state don't carry it (that
  state has its own explanation text).
- The home dial (components/DialNav.tsx): a brief line now sits
  ABOVE the dial, from the same map, keyed to the selected stop —
  it reads selIdx, which is the resting stop at rest and is set to
  the target the instant a tap/keyboard step lands (goTo), so
  during a tap-spin the line already shows the TARGET stop's brief;
  a drag-release updates it to the landed stop via the same selIdx.
  No new state and no physics/sound/navigation code touched. It
  renders only on the home dial (size "home") — the desktop shell
  dial sits beside the section page, which carries the identical
  line at its own top, so showing it there too would duplicate it.
  In interface mode the line hides: the mode's own hint under the
  dial ("Swipe to browse interfaces — tap the centre to apply")
  owns the space.

## Verification done here
Same constraint as previous builds (no node_modules; Vercel is the
typecheck): all 18 touched/new files — lib/news.ts,
components/NewsSection.tsx, lib/supabase/server.ts,
lib/dial-badges.ts, lib/server/theme-settings.ts, app/layout.tsx,
app/api/warm/route.ts, components/InterfacePicker.tsx,
lib/page-intros.ts, components/PageIntro.tsx, app/servers/page.tsx,
app/swipe/page.tsx, app/friends/page.tsx, app/chirp/page.tsx,
app/profile/page.tsx, app/inbox/page.tsx, app/search/page.tsx,
components/DialNav.tsx — passed a TypeScript syntax parse (Bun
transpiler, zero failures). The Hindu/Openverse/Commons numbers
above are live curl measurements from this session, not estimates.
NOT verified here: the in-browser thgim behaviour after the
referrer change and the felt tab-switch timing (parent's post-deploy
live check, as usual).


---

# Addendum — 2026-11-10 (later): two production defect fixes, collapsible news, free speed batch, PageSpeed fixes

Code-only build (working tree; the parent applies migration-0009,
pushes and deploys). Four workstreams in one tree: (1) the two
live-verified production defects, (2) the owner-requested collapsible
news dropdown, (3) the owner-approved free speed batch, (4) four
PageSpeed fixes from the owner's Lighthouse report on /login.

## Defect 1 — Top Stories rendered ZERO photos in production

Symptom: Top Stories cards contained no <img> at all (image URL
absent server-side); Sports rendered 4/6 (all ESPNcricinfo natives);
Hindu items landed on gradient tiles in every tab. Locally the same
code filled Hindu items via the Wikimedia fallback.

Investigation (empirical, in order):

a) **User-Agent test (Wikimedia Commons API, curl):** a MISSING
   User-Agent gets **403** ("Please set a user-agent…"). `undici`, a
   descriptive UA and curl's default UA all get 200. So Wikimedia
   blocks only an absent UA — a plain default-UA theory does not
   explain production, but a descriptive UA is now sent on **every**
   upstream fetch regardless (RSS feeds, Commons, Openverse — it had
   none, Open-Meteo weather): `UPSTREAM_UA = "OneUcoBot/1.0
   (+https://one-university-community.vercel.app)"` in lib/news.ts.

b) **Hindu feed markup census** (fresh curls of the front, sport and
   IE India feeds): Hindu front items carry images ONLY as
   self-closing `<media:content url="https://th-i.thgim.com/…">` —
   51/60 items; no media:group, no content:encoded, no <img> in
   descriptions. Hindu sport: 44/60 media:content. IE India: 200/200
   media:content + media:thumbnail + content:encoded. The parser
   already read media:content, but its hunt order could miss forms;
   `extractImage` gained a final `content:encoded` <img> scan (via
   `firstImgSrc()`) for ALL feeds, so no feed's encoded imagery is
   left on the table.

c) **Merge/dedupe check:** a title-collision scan over the saved
   front + IE feeds found **zero** collisions — dedupe was NOT
   dropping image-bearing duplicates. As insurance the merge now uses
   byLink/byTitle maps and ADOPTS a dropped duplicate's image when
   the kept item has none.

**Local harness** (lib/news.ts run under both Bun and Node against
live feeds): BEFORE the fix — Top 11/12 with images, Sports 12/12.
AFTER — **Top 11/12** (9 Hindu thgim native + 1 IE native + 1
Wikimedia fallback, 1 miss), **Sports 12/12** (ESPNcricinfo 6/6
native; Hindu 6/6 = 4 native + 2 Wikimedia fallback). Identical on
both runtimes, so parse/merge logic is correct everywhere it can be
run locally.

**Production-only root cause:** the one layer that differs in
production is Next.js's patched fetch. The photo-fallback lookups
(Commons/Openverse) were the only upstream calls carrying an
externally created `AbortSignal` (per-call timeout controllers) —
a signal takes the request off the normal Data Cache path, and in
production those lookups yielded ZERO while un-signalled native feed
images (ESPNcricinfo) survived, matching the live symptom exactly
(natives partially present, fallback entirely absent). Fix: fallback
timeouts are now enforced with `raceTimeout()` — Promise.race
against the fetch with **no AbortSignal in the fetch init** (the
underlying fetch still completes and populates the cache), so
fallback requests travel the same path as the feed fetches.
FALLBACK_ITEM_LIMIT also raised 8 → 12 so every rendered story gets
a fallback attempt. (Caveat recorded honestly: "no <img> in the DOM"
cannot by itself distinguish an absent imageUrl from an errored
<img> the client swapped for the tile; the fix covers both paths —
server yield via the race/UA/parser changes, and the client swap
remains a graceful degradation, not a silent zero.)

## Defect 2 — dial tap → 4–5s of spin before navigation

Root cause (components/DialNav.tsx): `goTo` navigated ONLY from the
spring's `onDone`. The spring (k=170, damping=16) reports done only
when |angle error| ≤ 0.05° AND |velocity| ≤ 2°/s; its asymptotic
tail stretches far taps (~180° of travel) to 4–5s. It was not a
timeout chain — interface mode is unrelated.

Fix: navigation now races the spring against a **NAV_DELAY_MS =
900** cap — a `doNav` guard fires `router.push` on whichever comes
first (spring settle or 900ms after the tap), so navigation starts
≤900ms from tap while the visual spin continues underneath.
`clearNavTimer()` (new navTimerRef) cancels a pending navigation on
a newer goTo, on pointer-down (a grab supersedes the tap), on
entering interface mode, and on unmount. Drag/flick physics, sounds,
interface mode and the PageIntro brief behaviour are untouched.

## News UI — collapsible block with a category dropdown (owner request)

components/NewsSection.tsx rewritten: the LIVE NEWS section is now a
slim header BAR, **closed by default on every fresh load (no
persistence)** — pulsing LIVE dot, "Live News" title button, weather
chip (`place · temp°C · condition`), "Updated HH:MM" (hidden on xs),
a native styled `<select>` (appearance-none + CSS chevron,
aria-label "News category", sr-only "Category" label; all six
categories; dark-surface classes that theme-remap like the rest of
the app) and a chevron toggle (aria-expanded, rotates when open).
Selecting a category sets it AND opens the panel. The panel (full
weather card, "News for {region}" note, loading/empty states, card
grid) renders only when open — Chirp posts get the space back.
Behaviour preserved: the same server actions and cache machinery
drive loads; category PREFETCH now runs only after the first open
(requestIdleCallback with a 1.5s fallback timer, sequential, shared
fetched-set); the 5-minute auto-refresh and 60s "time ago" tick run
only while open. The server-rendered Top Stories first paint remains
the initial panel content. The old tab/tablist code is gone
(CATEGORY_OPTIONS). News card <img> also gained width={800}
height={450} (its aspect container already existed) and keeps
referrerPolicy="no-referrer".


## Free speed batch (Phase 2)

### A. Indexes — supabase/migration-0009.sql (parent applies)

Audited the hot query code against schema.sql + migrations
0002–0008. Everything below is `create index if not exists`; each
serves a named query. Also in 0009: `increment_chirp_views(ids
uuid[])` (SECURITY DEFINER; EXECUTE revoked from public/anon/
authenticated, granted to service_role only) backing §B.

- `matches (account_b, updated_at desc)` — getMyMatches OR query
  (account_a = me OR account_b = me, ordered by updated_at desc);
  the unique (account_a, account_b) index serves only the A side.
- `messages (match_id, sender_id, created_at desc)` — DM tick-state
  poll (every poll of an open chat: match + sender, newest 50); the
  existing (match_id, created_at desc) forces a sender-filter scan.
- `server_members (account_id)` — every "my memberships" lookup
  (servers list, unread counts, inbox invite context); the PK
  (server_id, account_id) leads with server_id.
- `server_messages (server_id, created_at desc)` — the three
  server-wide message lists incl. the Jwalam poll path filter
  server_id and order created_at desc WITHOUT a channel equality;
  the existing (server_id, channel_id, created_at desc) cannot
  provide that ordering across channels.
- `channels (server_id, position)` — listChannels; the FK column
  had no index at all.
- `chirp_likes (account_id, chirp_id)` — listChirps' liked-by-me
  set on every feed load; the PK (chirp_id, account_id) leads with
  chirp_id.
- `reveal_requests (poster_id, status, created_at desc)` — inbox
  pending/accepted reveal lists + unread-outcome count filter
  poster_id + status; existing indexes lead with requester_id.

Deliberately NOT added: group_invites by server (low-frequency
admin path), accounts by role (tiny table), blocks reverse lookups,
profiles/view scans (product-level concern). Already covered and
not repeated: messages (match_id, created_at desc), inbox_items
(recipient_id, is_read, created_at desc), presence (last_seen_at
desc), follow_requests both directions (0006), chirps created/
author, group_invites invitee (0004), swipes/matches unique pairs.

### B. Batched page loads

- **Chirp page view counts:** up to 50 per-chirp UPDATEs (parallel,
  but 50 round trips per feed load) → **1 RPC**
  (`increment_chirp_views`, app/chirp/page.tsx). The old loop is
  kept as a fallback if the RPC errors (pre-migration safety).
- **Friends (lib/social.ts listDmEntries):** getMyMatches was
  fetched TWICE (directly + inside getDmUnreadCounts) and profiles /
  unread / recent-messages ran as three serial waits. Now: matches
  once, then ONE Promise.all round — 5 queries / 3 serial stages →
  **4 queries / 2 stages**, output identical (getDmUnreadCounts
  delegates to a matches-taking internal; its other callers are
  unaffected).
- **Servers + every page's dial badges (lib/servers.ts
  getServerUnreadCounts):** one count query PER membership
  (1 + N queries) → **2 queries flat** (memberships + one messages
  scan newer than the oldest marker, per-server markers applied in
  memory with the exact same strict-> semantics).
- **Inbox page:** audited — already batched (five list calls in one
  Promise.all, batched id lookups, mark-read overlapped). No change.
- **Chirp feed (listChirps):** audited — already batched (chirps +
  profiles + likes in parallel). No change.
- Honest remainder: the Friends PAGE also calls
  markIncomingDelivered, which re-fetches matches on the admin
  client (different client, so the two can't share); left as is.

### C. Shared news cache

`getNews`/`getWeather` in lib/news.ts are now wrapped in
`unstable_cache` as `getNewsCached(category, region)` /
`getWeatherCached(region)` — key parts ["oneuco-news-v1"] /
["oneuco-weather-v1"], revalidate 600, tags ["news"] /
["news-weather"], region keyed by an exported `regionByKey()` so
all users in a region share ONE parse/merge/photo-fallback
computation per 10 minutes (previously the fetch-level cache
covered RSS bytes but the processed result was recomputed per cold
action call). Fail-soft behaviour unchanged. Call sites updated:
app/chirp/actions.ts and app/chirp/page.tsx. (Local-harness note:
outside Next, the copy needs unstable_cache stubbed to identity.)

### D. Image weight

Photo URLs in this codebase are Supabase Storage public URLs
(getPublicUrl at every upload site; buckets avatars / server-images
/ chirp-images), shape `…/storage/v1/object/public/<bucket>/<path>`.
New lib/images.ts `sizedPhotoUrl(url, width, quality=70)` rewrites
ONLY that pattern to the render path
(`…/storage/v1/render/image/public/…?width=W&quality=70`) and
returns anything else untouched.

New shared client component components/Avatar.tsx now renders every
avatar surface that previously hand-rolled the same img/tile pair:
friends rows (48px), chirp authors (40px), server-chat authors
(36px), server-settings members/friends (36px, local Avatar deleted),
search rows (48px), inbox requesters (40px), DM header (40px), admin
accounts (44px). It requests the 96px rendition, sets
loading="lazy", decoding="async" and explicit width/height, and
climbs a failure ladder — sized URL → original stored URL → initial
tile — so if the project's plan lacks image transformation the app
degrades to today's full-size photos instead of broken images.
Developer masking is preserved: the masked projection's photoUrl is
null, so the developer still renders as the "D" tile. Swipe-deck
card photos use sizedPhotoUrl(…, 256) with the same original-URL
onError fallback. News cards: explicit width/height added (§above);
the aspect container already existed. No incompatible URL patterns
were found — every stored photo URL matches the public-object
shape; non-matching URLs pass through sizedPhotoUrl unchanged by
design.


## PageSpeed fixes (Phase 3) — from the owner's /login Lighthouse report

(Performance 100 / Accessibility 95 / SEO 91; only the four flagged
items, nothing swept beyond them.)

1. **robots.txt (SEO):** /robots.txt returned the app HTML because
   NO robots file existed AND the middleware session gate redirected
   signed-out /robots.txt to /login. Fixed the Next way: new
   app/robots.ts (MetadataRoute) — allow /, /login, /signup;
   disallow /admin/, /api/, /servers, /swipe, /friends, /chirp,
   /profile, /inbox, /search, /forgot-password — plus a middleware
   early return for /robots.txt next to the /api/warm exemption so
   crawlers actually reach it. NO sitemap line: the app has no
   sitemap (checked app/sitemap.ts, public/sitemap.xml — neither
   exists), and the line is not invented.
2. **Login contrast (Accessibility):** only the three flagged
   elements, all in app/login/page.tsx, wording/sizes untouched:
   the "One University Community" tagline (text-neutral-500 →
   text-neutral-400), the "or" divider (text-neutral-600 →
   text-neutral-400), and the footer paragraph (text-neutral-600 →
   text-neutral-400). Contrast on black: neutral-400 (#a3a3a3) ≈
   8.3:1 vs neutral-500 ≈ 4.43:1 (just under the 4.5:1 bar — matches
   the flag). Input placeholders in LoginForm were NOT flagged and
   are unchanged; no other page's neutrals were touched (their
   contrast was never measured).
3. **Legacy polyfills:** package.json gained a modern browserslist
   — "last 2 Chrome versions, last 2 Safari versions, last 2
   Firefox versions, last 2 Edge versions, not dead". Verified
   here: the file still parses as JSON and the queries resolve with
   the real browserslist engine to Chrome 156–157, Edge 155–156,
   Firefox 158–159, Safari 27.1–27.2 (no legacy targets → SWC/Next
   drop the legacy polyfill set). NOT verified here: a full
   `next build` — the sandbox has no node_modules (noexec
   workspace); the production build is the parent's deploy step.
   If Vercel's build objects to the key, removing that one line is
   the whole revert.
4. **COOP header:** next.config.mjs now sends
   `Cross-Origin-Opener-Policy: same-origin-allow-popups` on every
   response (allow-popups specifically — plain same-origin would
   sever the Google sign-in popup flow). CSP remains deliberately
   deferred, untouched.

## Verification done here

Same constraint as previous builds (no node_modules; Vercel is the
typecheck): every file touched across Phases 1–3 passed a
TypeScript/JS syntax parse (Bun transpiler; next.config.mjs via
node --check; package.json via JSON parse) — see the build report
for the file list. NOT verified here (parent's post-deploy checks):
production Top Stories photo yield after the race/UA/parser fixes,
felt dial tap→navigation time, the news bar's collapsed default in
the real app, transform renditions under the project's Supabase plan
(the Avatar ladder makes a missing plan a no-op, but the parent
should confirm renditions actually serve), /robots.txt returning
text rules instead of HTML, and the Lighthouse re-run.

# Addendum — 2026-11-10 (night): Top Stories prod yield follow-up — diagnosis, [news-yield] instrumentation, fallback hardening

Code-only (working tree; parent pushes). Context: after commit
9e5be2e went live, production rendered **Top Stories 3/12 photos**
(Sports 9/12) while the local harness with the same lib/news.ts
measured 11/12. This follow-up was scoped to lib/news.ts only
(components/NewsSection.tsx untouched) and all verification is
LOCAL — the production-check rule (2026-11-10) forbids repeated
live passes; the new log line is the production probe instead.

## Diagnosis (measured locally, this session; feeds rotate hourly,
so absolute counts move between runs — the patterns are the signal)

1. **Feed census (live, repeated runs):** The Hindu front feed
   carries native media:content images on only **47–52 of 60**
   items; Indian Express India is 200/200, ESPNcricinfo 100/100.
   The merged Top page is currently ALL Hindu items (their
   timestamps win the date sort), pre-fallback native yield
   measured **9/12** and **7/12** on two runs an hour apart. So a
   large slice of Top ALWAYS depends on the fallback chain, while
   Sports (ESPN-heavy) barely does — matching the prod pattern
   (Top worst, Sports near-full).
2. **Cold latency is the production-only multiplier.** Uncapped
   raw timings from this sandbox, fresh process per call:
   Commons API cold **~590ms** (200); **Openverse cold 5.6–6.3s**
   to a 200 whose body was 69 bytes — an EMPTY result for these
   hyperlocal queries. At the old **3s race cap, a cold Openverse
   call could essentially never answer**; warm it answers in
   ~0.1–0.3s, which is why local harness runs (warm everything)
   kept passing while production (a cold computation on a fresh
   serverless instance, cold TLS to US-hosted APIs) lost the
   fallback-dependent items. Warm/cold asymmetry, not parsing.
3. **Commons is non-deterministic for the same query.** "Villagers
   protest stalled road-widening work" MISSED in one full-pipeline
   run and HIT in 374ms cold in the stress run; repeated rounds
   hit at 126–621ms. A single attempt is a coin flip for marginal
   queries — a retry is worth real yield.
4. **thgim natives are healthy:** 5/5 sampled feed image URLs
   returned 200 image/jpeg with AND without a Referer — the
   native URLs are not being refused at fetch level. Feed
   media:content already points at the LANDSCAPE_1200 variant.
5. **og:image census (6 live Hindu articles):** articles WITH a
   story photo carry og:image = that exact thgim LANDSCAPE_1200
   photo (page fetch 259–868ms). Articles WITHOUT a photo carry
   og:image = `https://www.thehindu.com/theme/images/og-image.png`
   — the site's generic placeholder. An og fallback that doesn't
   reject placeholders would paper cards with the Hindu logo.

What this does NOT settle (honest limit): the exact split of the
prod 3/12 between (a) fallback-dependent items lost to cold
timeouts and (b) any browser-side <img> failures. The [news-yield]
log below settles (a) on the next cold prod computations: if the
log shows final≈11/12 while the page still renders 3/12, the
remaining loss is client-side loading, not server yield.

## Changes (lib/news.ts only)

1. **INSTRUMENTATION (permanent):** every cold getNews now emits
   ONE console.info line —
   `[news-yield] category=top region=ap-telangana sources=[The Hindu:60 items/49 native · Indian Express:200 items/200 native] merged=260 pageNative=7/12 fallback attempted=5 filled=2 commons[tries=8 hits=2 timeouts=0] ogimage[tries=6 hits=0 timeouts=0] openverse[tries=6 hits=0 timeouts=6] final=9/12 computeMs=12144`
   (that is a REAL line from the local verification run below).
   Because getNews only executes inside unstable_cache on a cold
   compute, this fires at most once per category+region per
   10 minutes. Assembly is try/catch-guarded; logging can never
   fail the read.
2. **Per-attempt race cap 3s → 5s** (FALLBACK_TIMEOUT_MS), set from
   the cold measurements above.
3. **One retry per source per item** (attemptSource): initial +
   one retry on timeout/failure, per source. Justified by finding
   3 — in the verification run Commons used 8 tries for 5 items
   and filled 2.
4. **NEW og:image step** (articleOgImage), ordered Commons →
   og:image → Openverse (evidence order: og answers in ~0.3–1.2s
   with the story's REAL photo; Openverse cold is 5.6–6.3s for a
   usually-empty result, so it stays last). Fetches the article
   page with UPSTREAM_UA inside the same race; rejects candidates
   hosted on the article's own host and any path matching
   /(og-image|logo|placeholder|default-image)/i. Positive control
   (feed image stripped from a photo-bearing article): returned
   the exact thgim LANDSCAPE_1200 URL in 1,175ms. Negative control
   (photo-less article): null in 760ms — placeholder rejected.
5. **Overall deadline:** fillMissingImages runs under a 12s
   budget (FALLBACK_BUDGET_MS); attempts shrink to the remaining
   budget and stop when it is spent, so a fully cold getNews stays
   inside ~15s (measured worst case below: 12.1s, and that was the
   budget being consumed by Openverse retries on items no source
   could fill). Fail-soft is unchanged: unfilled items render the
   gradient tile; getNews still never throws.
6. **thgim largest-variant safeguard:** normaliseImageUrl now
   steps any thgim `alternates/(LANDSCAPE|PORTRAIT|SQUARE)_<n>/`
   URL with n<1200 up to _1200. A no-op on today's feeds (they
   already serve 1200 — finding 4); insurance for smaller variants
   arriving via og tags or feed changes.

## Local re-verification (stubbed-cache copy of the new lib/news.ts
run under Bun against the live feeds; real file also passes a Bun
transpiler parse)

- BEFORE (old code, same session): Top **10/12** final (9 native +
  1 Commons; 6.2s). Sports **12/12** (1.9s).
- AFTER (new code): Top **9/12** final from a HARDER rotated page
  (7/12 native pre-fallback vs 9/12 before; 5 fallback-dependent
  items, Commons filled 2, og correctly empty on photo-less
  stories, Openverse timed out on all 6 tries within budget;
  computeMs=12144 — the 12s deadline doing its bounding job).
  Sports **12/12** final (10/12 native, Commons filled both
  missing on first tries; og/Openverse never touched; 1.3s).
- Fallback timing distribution (uncapped raw, cold): Commons
  ~590ms; Openverse 5.6–6.3s (empty results). Capped attempts:
  Commons hits at 126–621ms warm / ~590ms cold; article pages
  259–868ms (HTML), og controls at 760–1,175ms end to end.

NOT verified here (parent's post-deploy step): the [news-yield]
lines in the Vercel logs for bom1 cold computes — read those
before judging this fix; they state server-side final yield per
category directly. If prod server yield is high but rendering is
still low, the next investigation is client-side <img> loading
(NewsCard onError path), not this pipeline.

---

# Addendum 2026-11-10 (evening) — Gold dial + section colours

Owner's words: "Add colors to the dial make gold and add some
creative colors to the page things." Code only; no push, no deploy,
no live-site checks — local verification only (owner's standing
production-check rule).

## 1. Gold dial — Default Midnight + Diwali (lib/themes.ts)

`DialSkinTokens` gained four OPTIONAL fields. Undefined = the exact
pre-change rendering, which is how the other 16 interfaces stay
untouched:

| Field | Meaning | Fallback in DialNav |
|---|---|---|
| `cap` | centre-hub background | theme `surface2` |
| `capRing` | centre-hub border colour | skin `ring` |
| `activeGlow` | extra box-shadow layered under the active stop's hue glow | none |
| `label` | inactive stop-label colour for faces too bright/dark for the muted tone | theme `muted` |

Plumbed through both palette paths: lib/dial-badges.ts (applied
interface) and DialNav's previewTheme mapping (interface mode), into
`DialThemePalette` (same four optional fields).

- **Default Midnight** (dialSkin renamed "Carbon metal" → "Polished
  gold"; palette/accent tokens NOT changed — buttons etc. are as
  before): face is a layered polished-gold background — champagne
  radial sheen top-left, warm radial pool bottom-right, a conic
  sweep of gold tones (so the metal shifts as the wheel turns),
  over a linear gold base. ring #8a6414 (outer border + dashed grip
  ridge), tick #5c430d (engraved bronze on the bright face),
  glow `0 0 38px rgba(212,175,55,.42)` + drop shadow, cap = radial
  champagne-to-bronze gradient, capRing #5c430d,
  activeGlow `0 0 20px rgba(212,175,55,.55)`, label #3d2c05 (deep
  bronze — the grey muted tone cannot read on polished gold).
- **Diwali** ("Brass rotary" → "Festive polished gold"): its old
  flat linear gold was weaker than the new Default skin, so it got
  the same treatment in an antique register — lamp-light radial
  highlight, conic brass sweep, deep bronze base (keeps the pale
  ticks/labels readable against the maroon app). ring #b8860b,
  tick #fde68a, cap radial gold with capRing #f59e0b,
  activeGlow amber, label #fde68a.
- Solar Amber also wears a brass dial but was left as-is (out of
  the owner's scope; it was not weaker in kind, just simpler).

Dial size, physics, sounds, NAV_DELAY_MS, long-press interface
mode and all behaviour are untouched — every DialNav change is a
style value.

## 2. Colourful dial stops — all interfaces (DialNav + globals.css)

New CSS variables, defined once in app/globals.css `:root`
(defaults; themes MAY override under html[data-theme] rules, none
must, and none currently do). 600-level tones so labels read on the
near-black classic face and on light interfaces' pale faces alike:

- `--stop-servers: #7c3aed` (violet)
- `--stop-swipe: #e11d48` (rose)
- `--stop-friends: #059669` (emerald)
- `--stop-chirp: #0284c7` (sky)
- `--stop-profile: #d97706` (amber)

Each STOPS entry in DialNav carries its `accentVar`. In page mode:
the ACTIVE stop's circle (background + border) wears its hue with a
soft glow `0 0 16px color-mix(in srgb, <hue> 48%, transparent)`
layered over the skin's activeGlow when one exists; the active
stop's label and the top notch triangle wear the hue; the centre
hub readout (the resting stop's name) is tinted with the hue.
Inactive stops are exactly as before, except the label tone may
come from the skin's new `label` token (gold skins only). In
interface mode the notch, dots and hub keep the previewed
interface's accent — unchanged. The unread badge bubble keeps the
accent (unchanged everywhere).

## 3. Creative colour on pages (globals.css + 5 pages + PageIntro)

- `--section-accent` (new var; `:root` default #737373). Each of
  the five section pages stamps `data-section="<section>"` on its
  primary <main> (app/servers, app/swipe, app/friends, app/chirp,
  app/profile page.tsx), and globals.css binds --section-accent to
  the matching --stop-* inside that main. Inbox/search have no
  stamp and keep the neutral default.
- (a) PageIntro: the dot now uses --section-accent (nested fallback
  → --accent → #737373), gains a soft halo in the same hue, and a
  short 16px gradient bar under the dot fading to transparent.
- (b) Header chip: the five pages had NO icon chip — the header's
  right-side element is the section label. It now carries the
  `section-header-chip` class (all five pages): globals.css renders
  it as a pill — section-hue text on a 14% hue wash, 38% hue border,
  with a 6px hue dot before the label.
- (c) Card tint: `main[data-section] .bg-neutral-950/.bg-neutral-900`
  gain a background-IMAGE only (surface colour never overridden):
  `linear-gradient(180deg, color-mix(<section hue> 8%), transparent
  56px)` — a subtle top-edge wash on cards/panels in the section.
- (d) Semantic colours untouched: the Chirp news LIVE dot stays red
  (NewsSection not modified), online dots stay emerald, viewed
  ticks stay amber, errors stay red. No body text recoloured; the
  login page was not touched at all.

## Variables added — summary

CSS (app/globals.css, all with :root defaults): --stop-servers,
--stop-swipe, --stop-friends, --stop-chirp, --stop-profile,
--section-accent. JS skin tokens (lib/themes.ts DialSkinTokens,
optional, fallback = previous behaviour): cap, capRing,
activeGlow, label.

## Verification (local only)

- Bun transpiler parse: PASS for lib/themes.ts, lib/dial-badges.ts,
  components/DialNav.tsx, components/PageIntro.tsx and all five
  touched page.tsx files.
- CSS audit: every var() reference in the new code resolves to a
  definition with a default (the five --stop-* + --section-accent
  in :root; PageIntro's --accent fallback is the pre-existing :root
  token). data-section stamps: 5; chip classes: 5.
- NOT verified (needs parent's single post-deploy live pass):
  the gold face rendering at 264/360/190px, hue label contrast on
  the gold face at a glance, and the chip/tint under a light
  interface (Sakura/Paper) — all are style-only, fail-soft by
  construction (undefined tokens/vars degrade to today's look).

NOTE for the parent: the gold Default Midnight skin shows when the
midnight interface is APPLIED (user pick, admin default, or dial
interface-mode preview). In seasonal-auto with no interface applied
the dial still renders the classic black palette (DialNav
constants) — but the per-stop hues and section colours DO show in
every mode, since they come from globals.css :root defaults. If the
owner expects gold for everyone immediately, the admin default
(Admin → Appearance) needs to be set to Default Midnight.

# Addendum 2026-11-10 (night) — Metal-matched components, five wheel skins, first-login dial tip

Owner direction: the gold dial is good; (1) restyle the other
components — Profile, Servers, and the rest — to match the dial's
look; (2) make 5 different DIAL THEMES switchable by HOLDING the
dial (pirate ship wheel, BMW-style wheel, Mercedes-style wheel,
other car wheels); (3) after a user's first-ever login, tell them
once that they can change the dial's interface this way.

## Part A — Components cut from the dial's metal

New component-metal tokens, resolved exactly like the dial tokens:
optional `metal {accent, ring, sheen}` on ThemeTokens (lib/themes.ts),
emitted by themeCssVars as --metal-accent / --metal-ring /
--metal-sheen (also added to THEME_VAR_NAMES). Explicit cuts:
midnight = polished gold (#d4af37 / #8a6414 / warm sheen), diwali =
festive brass (#e8a91c / #92580a). The other 16 interfaces define no
metal and DERIVE one (accent → --metal-accent, border → --metal-ring,
shared default sheen), so every interface's furniture matches its own
family with zero per-theme authoring. globals.css :root carries the
same gold as the no-stamp (seasonal/classic) default.

Applications (all in app/globals.css unless noted; only
background-images, inset shadows and border colours — never a
background-color, never body text, semantic colours untouched):
- Section header chips (all sections): inset metal rim + the sheen
  sweep over the existing section tint — an enamelled metal badge.
- Primary buttons (.bg-white.text-black, app-wide): sheen sweep +
  inset metal rim + top highlight over their existing colour.
- Cards in sections (.bg-neutral-950/.bg-neutral-900): the existing
  section top-tint GAINS a top layer — a 1px metal rule line fading
  in/out across the card's top edge (background-size/position set
  per layer; surface colour still never overridden).
- PageIntro marker (components/PageIntro.tsx): the dot is now a
  metal stud — radial highlight over --metal-accent, 1px --metal-ring
  rim, soft metal halo; the stem below keeps the section hue.
- .metal-frame utility (globals.css): sheen + inset metal rim for
  feature panels. Applied to: components/InterfacePicker section,
  components/DialSkinPicker section, components/DialTipCard, and the
  Servers create-server form (app/servers/CreateServerForm.tsx).
- Profile photo (app/profile/ProfileEditor.tsx): the DP (and its
  initial-tile fallback) wears a 2px metal ring + soft metal glow —
  the hub-cap echo. Profile + Servers were the owner-named pages;
  Friends/Chirp/Swipe/Inbox get the same classes (chips, cards,
  buttons, intro dot) by construction.

## Part B — Five wheel skins (lib/dial-skins.ts, NEW)

A dial SKIN is now independent of the interface. Catalogue (single
source of truth, pure data, client+server safe): DIAL_SKINS with a
full DialSkinTokens each + a furniture `kind`; helpers getDialSkin /
isDialSkinId / parseDialSkin / dialSkinItems ('auto' first = the
applied interface's own skin, incl. the polished gold).

Persistence: profiles.dial_skin via supabase/migration-0010.sql
(idempotent add-column; NOT applied here). Reads mirror theme_id:
getProfileDialSkin (lib/server/theme-settings.ts, cache()-shared,
fail-soft → 'auto'). Writes: setMyDialSkinAction +
setMyDialSkinFormAction (app/profile/theme-actions.ts). lib/dial-badges
resolves the saved skin into badges.dialSkin (DialSkinPalette: tokens
+ kind) and themePicker.skinId; DialNav layers it over the interface
palette — surface/text tones always stay the interface's.

The five skins (all artwork CSS in DialSkinDecor inside the rotating
face layer; pointer-events-none + aria-hidden; NO logos/badges —
generic geometry only):
1. Pirate Helm — timber conic/radial face, brass ring + hub; decor:
   8 timber spokes, brass rim band, 8 protruding spoke handles
   OUTSIDE the rim (rotated layer, top:-30*s).
2. Munich Sport (BMW-style evocation) — black leather radial face,
   silver-ringed dark hub; decor: thick-grip shadow ring, 3 chunky
   leather spokes (bottom + two upper). Centre is a plain dark hub
   with a silver ring — NO quartered roundel (trademark).
3. Stuttgart Luxe (Mercedes-style evocation) — piano-black/dark-wood
   conic face, chrome ring; decor: wood inlay band + chrome hairline,
   3 slim chrome spokes.
4. Racing GT — carbon-dark face, yellow ticks; decor: dashed yellow
   stitching ring, flat-bottom carbon chord, two chunky lower grips,
   red centre stripe at the rim top (turns with the wheel).
5. Vintage Classic — cream/ivory face, chrome ring, sepia ticks and
   dark-sepia labels; decor: thin chrome inner ring, one slim
   two-spoke chrome bar.

GESTURE CHANGE (owner-specified): the ~500ms hold now cycles the
WHEEL SKINS (6 entries: Auto + 5) instead of full interfaces. Same
interaction skeleton as the retired interface mode — drag rotates
with live preview (palette state only; the app is never re-stamped),
landing ticks, tap centre confirms → optimistic local state +
setMyDialSkinAction + router.refresh; ✕ / route change cancels;
keyboard arrows/Enter/Escape mirror it; the 900ms nav cap, sounds,
physics, badges and the route-follow snap are untouched. Full
interfaces remain fully available in Profile settings
(components/InterfacePicker, copy updated to say so) and the dial's
hint line now reads "…Hold the dial to restyle it — pirate helm,
car wheels and more." NEW list picker beside it:
components/DialSkinPicker.tsx (Auto + 5 rows with mini-wheel
previews, setMyDialSkinFormAction), wired in app/profile/page.tsx.

### Skin × size rendering matrix (by construction; sizes are the
### existing home 264/360, md 200, shell 190 — furniture scales by
### s = size/264, hub stays 74*s, stops 76*s at radius size/2 − 44*s)

| skin      | home 264/360 | docked 190 (shell) |
|-----------|--------------|--------------------|
| pirate    | 8 spokes + brass band inside rim; 8 handles protrude ~30*s px beyond the rim (page space, pointer-events-none); stops sit between handles at 72° spacing vs handles at 22.5° offsets — no overlap with stop circles | same, scaled (handles ~21px out); shell column is roomy on lg+, no clipping ancestor (wrap has no overflow rule) |
| munich    | 3 thick spokes (26–30*s wide) pass UNDER stops/hub (face layer z-order); grip ring inset 3*s | spokes ~19–22px wide — proportion holds |
| stuttgart | chrome spokes 8*s, wood band at inset 16*s, hairline 11*s — all inside the stop ring | same, scaled; hairline may read faint at 190 — decorative only |
| racing    | stripe 11*s×30*s at rim top (under the notch marker z-10); stitch ring inset 8*s; flat chord at bottom 13*s, grips at ±140° | same, scaled |
| vintage   | chrome bar across centre under hub; cream face + skin label token (#4a3520) keeps stop labels readable | same, scaled |
| auto      | interface skin exactly as before (gold on midnight/diwali) | identical |

Stop legibility: every skin defines `label` (cream on pirate,
#e4e4e7 munich, #f5f0e6 stuttgart, #fef9c3 racing, sepia on
vintage); active stops keep their per-stop hue chips from the gold
build. Unread badges ride the accent exactly as before.

## Part C — First-login-ever tip (migration 0010, dial_tip_seen)

app/page.tsx reads getProfileDialTipSeen (fail-CLOSED tri-state:
true = seen, false = show, null = read failed → do NOT show, so a
pre-migration deploy can never produce an undismissable card). On a
clean false it mounts components/DialTipCard — a metal-frame card
above the dial: gold hub-stud + "New here? Hold the dial to change
its style — pirate helm, car wheels, gold and more live there." +
"Got it" (bg-white primary, which now carries the metal sheen).
Got it hides instantly (local state) and fires
markDialTipSeenAction (theme-actions.ts) — first-ever landing only,
never per-login.

## Files

NEW: lib/dial-skins.ts, components/DialSkinPicker.tsx,
components/DialTipCard.tsx, supabase/migration-0010.sql.
EDITED: lib/themes.ts (metal tokens + vars), app/globals.css
(metal defaults, chip/card/button treatments, .metal-frame),
components/DialNav.tsx (wheel-style mode replaces interface mode;
DialSkinDecor; hint copy), lib/dial-badges.ts (skin resolution),
lib/server/theme-settings.ts (getProfileDialSkin,
getProfileDialTipSeen), app/profile/theme-actions.ts (skin save +
tip dismiss), app/profile/page.tsx (DialSkinPicker wiring),
components/InterfacePicker.tsx (copy + metal-frame),
components/PageIntro.tsx (metal dot), app/page.tsx (tip wiring),
app/profile/ProfileEditor.tsx (DP metal ring),
app/servers/CreateServerForm.tsx (metal-frame).

PARENT NOTES: apply migration-0010 before/with this deploy (code is
fail-soft without it: skins read 'auto', writes return false, tip
never shows). lib/themes' applyThemeToRoot/interfaceItems helpers
are now unused by the dial (kept as library API). Users who learned
"hold = interfaces" get the new hint line + the tip card explains
the gesture once; interfaces moved to Profile settings only.

## Verification (local only)

- Bun transpiler parse: PASS for all 14 touched TS/TSX files
  (lib/dial-skins, lib/themes, lib/server/theme-settings,
  lib/dial-badges, app/profile/theme-actions, components/DialNav,
  components/DialSkinPicker, components/DialTipCard,
  components/InterfacePicker, components/PageIntro, app/page,
  app/profile/page, app/profile/ProfileEditor,
  app/servers/CreateServerForm).
- CSS var audit: --metal-accent/--metal-ring/--metal-sheen are
  defined in globals.css :root AND emitted per-interface by
  themeCssVars; every component reference (PageIntro, ProfileEditor,
  DialTipCard) additionally carries an inline gold fallback. All
  other var() references in new code are the pre-existing --stop-* /
  --section-accent / --accent set, unchanged.
- Type cross-checks: DialThemePicker is constructed only in
  lib/dial-badges (now with skinId) and passed through page/shell;
  setMyDialSkinAction/isDialSkinId names match across actions,
  picker and DialNav.
- NOT verified (needs parent's single post-deploy live pass): the
  five wheels' drawn furniture at real sizes, pirate handles against
  the home page's neighbouring elements, skin-mode preview/confirm
  on a device, and the tip card's once-ever behaviour across two
  logins. All fail-soft by construction.

---

## Addendum 2026-11-10 (late) — Admin speed pass ("the admin is very slow")

Full audit of every admin surface's cold-render data path, then
plumbing-only fixes. Rendered output, row order and numbers are
IDENTICAL everywhere — only the waiting changed. Parent action:
apply supabase/migration-0011.sql, then push as usual.

### What every admin render paid BEFORE (shared frame)

Counted in Supabase round trips (RT) on a cold render:

| Layer | Before | Notes |
|---|---|---|
| Middleware | 1 RT (accounts) | getSessionUser is local-claims (0 RT); the accounts lookup is unavoidable here — middleware and the page render are separate execution contexts with no shared cache. Unchanged. |
| Root layout | 2 RT (+0–2 cached) | getMyAccount (accounts) + getProfileThemeId (profiles) via React cache(); theme/diwali settings are unstable_cache(30s), 0 RT warm. Unchanged. |
| Dial shell (DialShellServer → getDialData) | ~10 RT / 3 serial stages | profile (1) ∥ DM unread (~2); server unread (2) ∥ inbox unread (3 counts); theme_id (1) ∥ dial_skin (1). Request-cached, and IDENTICAL on every signed-in page — not admin-specific. See "not query-shaped" below. |
| Page gate (requireAdminPage or admin home's inline copy) | 1 Auth-server NETWORK call + 1 RT (accounts) | supabase.auth.getUser() re-validated against the Auth server and getAccountByAuthUserId re-ran the accounts query the layout had JUST resolved for the same render. Paid by every admin page, twice over on admin home (layout + inline gate). |

### Fixes

1. **lib/server/admin-page.ts (requireAdminPage)** — session/account
   now resolve through lib/auth/my-account (getMySessionUser /
   getMyAccount, React cache()). The layout already computed both for
   this render, so the guard costs **0 extra round trips** (was 1
   Auth-server call + 1 duplicate accounts query on every admin
   subpage). Redirect outcomes identical: no session → /admin/login;
   no row / gate fail → /auth/admin-denied. Admin server ACTIONS were
   deliberately NOT touched: they keep their own auth.getUser() gate,
   per the codebase's session doctrine that mutation paths re-validate
   against the Auth server (lib/auth/session.ts header).
2. **app/admin/page.tsx (admin home)** — same cached gate swap for its
   inline copy (its null-account warning render is preserved:
   getMyAccount returns null in exactly the cases the old lookup did);
   loadStats() no longer counts total accounts twice (its
   countRows(accounts) was byte-identical to the total getOnlineCounts
   already returns — presenceCounts.total now feeds the card);
   stats ∥ getDiwaliMode() in one Promise.all instead of serial.
3. **app/admin/requests/page.tsx** — the pending-reveals query (which
   depends on nothing on the page) now starts immediately and is
   awaited after the flagged chain instead of parked behind it; server
   names ∥ author profiles in one Promise.all. 5 serial stages → 3.
4. **app/admin/reports/page.tsx** — reporter profiles now run in the
   same Promise.all as the message/chirp lookups (all three depend
   only on the reports list). Post-reports stages 2 → 1.
5. **supabase/migration-0011.sql (NOT applied)** — six idempotent
   indexes, each justified in-file by its named query:
   reports (status, created_at desc) [table had NO index],
   reveal_requests (status, created_at desc),
   developer_requests (status, created_at desc) [no index existed],
   server_messages (flair_id, created_at desc),
   college_codes (status, created_at),
   accounts (status).

### Per-page table (page-level only; shared frame above excluded)

Queries = Supabase round trips in the page's own code; Stages = serial
await rounds. Gate cost is listed separately because fix 1 removed it
for every subpage at once.

| Admin page | Queries before → after | Serial stages before → after | Gate before → after |
|---|---|---|---|
| /admin (home) | 10 → 9 (8 count RTs in 1 parallel round + getUser + acct lookup → 7 count RTs in 1 round; diwali cached 0–1, now parallel) | 3 → 2 | inline getUser + lookup → 0 extra (cached) |
| /admin/accounts | 3 → 3 (accounts list, then profiles ∥ presence — already batched, no N+1) | 2 → 2 | getUser + lookup → 0 extra |
| /admin/appearance | 0–1 → 0–1 (theme setting is unstable_cache 30s) | 1 → 1 | getUser + lookup → 0 extra |
| /admin/requests | 5 → 5 | 5 → 3 | getUser + lookup → 0 extra |
| /admin/reports | 4 → 4 | 3 → 2 | getUser + lookup → 0 extra |
| /admin/colleges | 2 → 2 (adder profiles genuinely depend on the list) | 2 → 2 | getUser + lookup → 0 extra |
| /admin/developer-requests | 2 → 2 (author profiles depend on the list) | 2 → 2 | getUser + lookup → 0 extra |
| /admin/flairs | 2 → 2 (already one Promise.all) | 1 → 1 | getUser + lookup → 0 extra |
| /admin/check | unchanged — one-time post-sign-in checkpoint (getUser + account lookup + rare bootstrap writes), not a browsing surface | — | — |
| /admin/login, /admin/forgot-password | 0 queries on render (static forms; cost lives in their submit actions, incl. the throttled admin-login path, untouched) | — | — |

Net effect per admin subpage render: **−1 Auth-server network call,
−1 duplicate accounts query, and 0–2 fewer serial stages**; admin home
additionally drops a duplicate full-table count. With the shared frame
included, a queue page's cold render went from ~19–20 round trips /
~8–9 serial stages to ~16–17 / ~6–7, of which the dial shell's ~10
(see below) is now the dominant block.

### Not query-shaped (named, not "fixed")

- **The dial shell is the biggest remaining cost on admin pages** —
  getDialData (~10 RT / 3 stages: unread counts, profile, theme,
  skin) runs for EVERY signed-in page because the dial renders beside
  admin pages on desktop too. It is request-cached and identical
  across the whole app, so it is not admin slowness per se; skipping
  it under /admin would change the admin pages' rendered shell (no
  dial / no badges there), which is a product decision for the owner,
  outside this output-identical pass.
- **Cold serverless starts** (Vercel bom1) stack on top of every
  figure above; the keep-warm cron covers /login + /api/warm, not
  /admin, so the owner's first admin click of a session can still pay
  a cold start. No code fix exists for that in this pass.
- Middleware's per-request accounts query cannot be deduped into the
  page render (separate execution context in Next.js).

### Verification (local only)

Bun transpiler parse PASS on all 4 touched TS/TSX files
(lib/server/admin-page.ts, app/admin/page.tsx, app/admin/requests/
page.tsx, app/admin/reports/page.tsx). No other files changed except
the new supabase/migration-0011.sql. Behaviour-neutral by
construction: every changed await produces the same rows in the same
order; the only removed query was a byte-identical duplicate count.


---

## Addendum 2026-11-10 (late) — Renames (Tea / Fling / Homies), four new dial icons, admin dial-strip, animated dropdowns, PC dial fixes

Owner-directed batch, display strings and presentation only unless
noted. NO route, identifier, table/column, CSS-var or action name
changed anywhere in this batch; no migration. Dial stop hrefs are
unchanged (/servers, /swipe, /friends, /chirp, /profile) and the hue
vars (--stop-servers / --stop-swipe / --stop-friends / --stop-chirp)
are untouched — every stop icon still draws in currentColor.

### 1. Servers → "Tea" (+ spilled-tea-cup icon)

Dial stop label "Servers" → "Tea". User-visible strings changed:

- components/DialNav.tsx: stop label "Tea"; route-map comment.
- lib/page-intros.ts (servers line): "Your teas — campus hangouts
  for every gang and fandom. Sip, chat, stay anonymous in Maya
  Jwalam."
- app/layout.tsx metadata description: "Fling matches, Tea
  hangouts, Chirp, …".
- app/servers/page.tsx: h1 "Tea"; section chip "Tea"; "your teas
  show up here"; "Tea isn't fully configured yet"; "No teas yet —
  brew the first one below."
- app/servers/CreateServerForm.tsx: "Create a Tea"; "Tea name";
  "Create Tea"; "+ Create a Tea"; "Couldn't create the Tea."
- app/servers/actions.ts (user-facing errors): "Give your Tea a
  name"; "Pick who the Tea is for"; "That Tea doesn't exist" (×5);
  "This Tea is private"; "Join this Tea before posting"; flair
  error "…this Tea"; inbox body "Open Tea to jump in."
- app/servers/[serverId]/page.tsx: Shell title "Tea" (×3); "That
  Tea doesn't exist."; "Back to Tea" (×2); "This Tea is private…";
  "Public Tea".
- app/servers/[serverId]/ServerChat.tsx: placeholder "Message this
  Tea…"; non-member line "Join this Tea to post."
- app/servers/join/[code]/page.tsx: "That Tea doesn't exist
  anymore."; "Open Tea"; "All teas".
- app/servers/join/[code]/JoinInviteButton.tsx: "Join Tea".
- app/inbox/page.tsx: notice fallback "a Tea".
- app/help/page.tsx: FAQ "What is Tea?" + answer; rules line "in
  chats, teas, Chirps…".
- app/admin/page.tsx: tool bodies "inside teas", "per-Tea flairs".
- app/admin/AdminQueueBits.tsx: option "Global (all teas)".
- app/admin/reports/page.tsx: label "Tea message:".

Icon: the chat-bubble path was replaced by a SPILLED TEA CUP
(multi-path, stroke set language — 24×24, currentColor, 1.8 width):
cup tipped to the right with handle, a wavy spill stream leaving
the rim, one airborne droplet (closed teardrop), and a puddle wave
beneath. DialIcon was extended minimally for this: DialStopDef
gained optional `iconPaths?: string[]` (iconPath now optional) and
DialIcon renders one <path> per entry when paths are given; the
other stops' rendering is byte-identical.

### 2. Swipe Deck → "Fling" (+ couple icon)

Dial stop label "Swipe Deck" → "Fling". Strings changed:

- app/swipe/page.tsx: h1 "Fling"; section chip "Fling"; "Fling
  opens up here"; header comment.
- lib/page-intros.ts (swipe line): "Fling a follow at someone —
  swipe right to fling, left to pass. Your details unlock only
  when they accept."
- app/friends/page.tsx: empty state "…like each other in Fling…",
  "Open Fling".
- app/help/page.tsx: FAQ "How does Fling work?".

Icon: the heart was replaced (Addition 3) by a GIRL + BOY FACING
EACH OTHER HOLDING HANDS (multi-path): two circle heads, her hair
arc + triangle dress, his straight torso + trouser lines, arms
meeting at centre with a small ring (r≈0.9) marking the clasped
hands at (12, 12.8).

### 3. Friends → "Homies" (+ walking-student icon)

Dial stop label "Friends" → "Homies". Strings changed:

- app/friends/page.tsx: h1 "Homies"; section chip "Homies"; empty
  state (see Fling list above).
- lib/page-intros.ts (friends line): "Your homies — chats, online
  status and typing live here. Yellow double-ticks mean they've
  seen your message."
- app/inbox/InboxActions.tsx: accept result "Homies now ✓".
- components/FollowButton.tsx: matched state "Homies ✓".
- app/help/page.tsx: FAQ "…a chat opens in Homies."

Note: no "Friend requests" UI string exists in the tree (follow
requests live in the Inbox under their own wording), so there was
no "Homie requests" string to create; no grammar was forced.

Icon: the two-people outline was replaced by a single WALKING
STUDENT character (multi-path): bucket hat (brim + crown), a
sunglasses band across the face, a takeaway cup with lid in the
right hand, a phone rectangle in the left, mid-stride legs.
Legibility priority at 25px was hat + glasses + cup; the legs
survived the render check (see Verification) and were kept.

### 4. Chirp icon → bird singing into a microphone

Name unchanged ("Chirp"); only the icon changed. The old bird path
was replaced (multi-path): side-profile bird — round body, head
with an OPEN beak (two lines), tail flicks, wing arc, legs — facing
a capsule microphone on a short stand at beak height, with one
small music note floating above-left of the mic.

All four new icons live only in DialNav's STOPS (`iconPaths`); the
old icon paths (chat bubble, heart, two-people, old bird) were
grep-confirmed absent from the rest of the tree — the dial is the
only place section icons render.

### 5. Admin: dial data stripped under /admin (Addition 2)

- Gate: middleware.ts stamps an `x-pathname` request header;
  components/DialShellServer.tsx returns bare children for any
  /admin path BEFORE any fetching, so getDialData never runs for
  admin renders — saving its ~10 round trips (unread counts,
  profile, theme, skin reads) per admin render, the dominant block
  named in the admin speed pass above. components/DialShell.tsx
  HIDDEN_PREFIXES now lists "/admin" (replacing the two auth-only
  entries) as the client-side half of the gate for soft
  navigations.
- What admin renders instead: its own existing chrome only —
  subpage "← /admin" links and the admin home's "View site" + Log
  out. No replacement bar was needed; the admin area was never
  dependent on the shell for a way back.
- Non-admin pages (home + five sections) are untouched: the gate
  matches the /admin prefix only.

### 6. Animated dropdowns (Addition 6)

- New shared client wrapper: components/AnimatedDropdown.tsx.
  Header row = title + current selection's name in the existing
  pill + a chevron; closed by default; expands/collapses with the
  CSS grid-template-rows 0fr→1fr technique + opacity, 300ms
  ease-out; chevron rotates over the same 300ms. Disclosure
  semantics: the header is a <button> with aria-expanded /
  aria-controls (the title stays an <h2> around it), the region is
  aria-hidden + pointer-events-none while closed, Escape closes,
  and choosing an option collapses the dropdown via a capture-phase
  click check (the option's form submission proceeds untouched).
- components/InterfacePicker.tsx and components/DialSkinPicker.tsx
  now render inside it (identical rows, forms and server actions;
  the metal-frame section shell moved into the wrapper). Current
  selection is still marked in the list ("· on now", highlighted
  row) and in the closed header pill.
- Chirp LIVE NEWS panel (components/NewsSection.tsx): the panel
  body no longer mounts/unmounts. It now sits in the same
  grid-rows 0fr→1fr + opacity animation (300ms ease-out) and the
  bar chevron's rotation was harmonised to 300ms. The body mounts
  on first open (new `everOpened` state) and stays mounted
  afterwards (aria-hidden + pointer-events-none while closed) so
  closing animates too; a -mt-3 while closed cancels the section's
  flex gap so a closed panel still costs zero space. The category
  control REMAINS the native styled <select>. Data behaviour is
  byte-identical: every effect still keys off `open`, so lazy-load,
  prefetch and refresh fire on the open intent, in parallel with
  the animation — nothing waits for the motion. (One cosmetic
  casualty: the regional line's -mt-1 was dropped — inside the
  clipping wrapper a negative top margin would shave the text.)

### 7. PC dial fixes (Addition 7) — decor overflow, height cap, rhythm

From the owner's laptop screenshot (Pirate Helm applied): the
helm's protruding handles covered the intro line above the home
dial and the hint below it.

- Reserved overflow: DialSkinDecor's pirate handles protrude
  30 * (size / 264) px past the rim — the maximum of any skin.
  DialNav now computes
  `decorReserve = Math.ceil(30 * (size / 264)) + 4` px and applies
  it as the dial box's marginTop/marginBottom, so the dial's true
  footprint includes its furniture and text above/below can never
  be overlapped. Values: 45px at 360px home, 34px at 264px, 27px
  at 200px, 26px at the 190px docked size. Unconditional (not
  pirate-only): the layout never shifts when skins change and any
  future protruding skin inherits the guarantee. Top/bottom only —
  nothing sits beside the dial horizontally (home column is
  dial-width; in the shell the handles' ~22px reach at 190px fits
  inside the existing 24px column gap).
- Height-aware home dial: on lg the size is now
  `min(360, Math.round(window.innerHeight * 0.52))` — i.e.
  min(360px, ~52dvh) — computed in the existing homeDialSize
  effect, which now also listens to window resize. Phone (264px)
  and md (200px) behaviour unchanged; the shell dial is unchanged
  (fixed 190px, no height cap, its render path and size logic
  untouched apart from inheriting the shared decor reserve above).
- PC rhythm (app/page.tsx, lg only): main vertical padding
  py-6 → lg:py-10; search form mt-5 → lg:mt-8; dial container
  py-8 → lg:py-10; footer pb-2 → lg:pb-4. Everything stays
  centred; no rail/sidebar (previously rejected, not revived).

### Judgement calls (renames)

- "Maya Jwalam" — the main community's proper name — unchanged.
- Create-form audience options "Private among friends/strangers"
  left as-is: relationship descriptors, not section naming.
- ServerSettings' panel is titled "Members & invites" (no
  server/friends naming); its "Add your matches directly" helper
  left as-is.
- Generic technical "server" (server-side, Server Actions,
  "use server", component/type names like ServerChat,
  CreateServerForm, addableFriends) untouched — identifiers and
  comments are not display strings.
- Dial hint copy under the home dial still says "Swipe to browse
  wheel styles…" in wheel-style mode — that's the verb (the
  gesture), not the section name.

### Verification (local only — no push, no live-site checks)

- Bun transpiler parse PASS on all 27 touched TS/TSX files
  (DialNav, DialShell, DialShellServer, AnimatedDropdown,
  InterfacePicker, DialSkinPicker, NewsSection, FollowButton,
  AdminQueueBits, middleware.ts, page-intros.ts, layout.tsx,
  page.tsx, the servers tree incl. ServerChat/ServerSettings
  neighbours, swipe, friends, inbox, help, admin pages).
- Icons rendered locally with cairosvg at large size and at a true
  25px, eyeballed: Tea (tilted cup + stream + droplet + puddle)
  reads; Fling (two figures, clasped-hands ring) reads; Homies
  (hat + glasses + cup + phone + stride) reads; Chirp (bird + open
  beak + mic) reads. Three refinements came out of the render
  check: the Chirp note was shrunk and moved up-left so it no
  longer merges with the mic capsule; the Homies brim was narrowed
  (13 → 11.6 wide) and its cup lengthened; the Tea handle was
  enlarged slightly.
- Grep audits: no user-visible "Servers" / "Swipe Deck" /
  "Friends" section naming remains anywhere in app/, components/
  or lib/. Every remaining hit is a code comment (e.g. "Friends —
  the dial's chat stop" in app/friends/page.tsx) or an identifier
  (FriendsPage, addableFriends, AddableFriendData) — intentional,
  per the display-strings-only rule. The one late catch,
  ServerChat's "Join this server to post.", was renamed to "Join
  this Tea to post." and the final sweep for "this server / the
  server" phrasing in JSX returns nothing.

## Addendum — Dial icon redo: bigger, bolder, interface-matched rings (2026-11-10, code only)

Owner verdict on the f1fed38 icon set, seen live: "the icons are not
good, change them, make them big, and the outline should match
according to the dial interface; set different round structure
differently for each thing." Concepts kept (he chose them minutes
earlier — the complaint was execution, size and style). All changes
in components/DialNav.tsx; nothing outside stop rendering changed
(physics, sounds, nav timing, hrefs, labels, hue vars, wheel skins
untouched).

### 1. All five icons redrawn big, bold, simple
New DialIcon: strokeWidth 1.8 → 2.4 on the 24-grid, and a new
`iconFills` channel (DialStopDef.iconFills) for solid accents that
carry the read where a stroke would vanish. Profile also moved from
the old iconPath/iconCircle pair onto iconPaths, so all five stops
share one shape. The glyphs (fewer, larger shapes than the rejected
set): Tea = big cup, tea sloshing over the left rim (pour wave, one
fat FILLED drop, puddle wave); Fling = two round heads, her triangle
dress, his straight legs, arms meeting at a FILLED clasped-hands dot;
Homies = bucket hat (crown + one thick brim line), SOLID sunglasses
band, plain takeaway cup, stride legs; Chirp = one big round body +
head, open beak (two bold lines) aimed at a SOLID mic capsule on a
stand, one tail flick, one music note; Profile = big head + one
shoulder arc, redrawn in the same hand.

### 2. Icons bigger on the stops
DialIcon no longer renders at a fixed 25px: it takes `px` =
Math.round(52 × (size/264) × 0.6) — ~0.60 of the badge diameter, up
from the fixed 25px (~0.35–0.48 depending on dial size). Rendered:
~43px on the 360 home dial, ~31px at 264, ~22px on the 190 docked
dial. Badge diameter, stop geometry and the label under the icon are
unchanged, so label fit is exactly as before at home and docked
sizes (checked in the badge-mock renders below).

### 3. Badge outline now matches the active interface
The stop span's themed `border-2` is gone. The ring is drawn by the
new DialBadgeRing (SVG over the badge, pointer-events-none) in the
metal tokens the active interface resolves — var(--metal-ring) for
the ring, var(--metal-accent) for the secondary marks — so the
circles belong to the current interface on every theme, idle and
active alike; the active stop keeps its per-stop hue as the badge
FILL behind the ring (plus its existing hue glow).
Contrast check from the token values (lib/themes.ts themeCssVars):
the ring sits on the badge fill, never on the dial face. Midnight —
ring #8a6414 / accent #d4af37 over idle surface #0a0a0a (bronze and
gold both clearly read on near-black) and over the active hue fills
(#7c3aed/#e11d48/#059669/#0284c7/#d97706 — dark bronze reads on all
five, darkest-on-amber included, confirmed in the active renders).
Ocean Deep (no metal block → derived: accent = its accent #38bdf8,
ring = its border #155e75) over idle surface #06283d: the ring is the
theme's own border tone on its own surface — the same pairing the
theme already uses app-wide — and the #38bdf8 accent marks are
bright on it. Icon ink logic unchanged (theme text tone idle, white
on the hue fill active) and re-verified in the same renders.

### 4. A different round structure per stop (DialBadgeRing, 60-grid)
Tea = DOUBLE concentric ring (ring + accent inner ring). Fling =
ring with two accent BEADS riding it at the top. Homies = DASHED
ring. Chirp = ring with eight short accent TICK notches inside it.
Profile = one single THICK ring. Same family/weight (2.6-unit main
stroke; Profile's 4.6 is its variant), identical idle/active,
scaling with the badge.

### Render test (cairosvg, paths extracted from the shipped file)
Icons alone at 36px and 22px (idle ink on dark, white on each stop
hue) + full badge mocks at 71px (home) and 37px (docked), idle and
active. Round 1 findings → simplifications made → re-rendered:
- Homies was muddy below the shades (cup lid line + phone + two arm
  lines merged into a scribble): phone fill DELETED, cup lid line
  deleted, free arm simplified to one plain line.
- Chirp's centre was clutter (wing arc + note flag + two tail
  flicks + legs overlapping the body/head circles): wing arc
  deleted, one tail flick deleted, legs deleted, note redrawn as a
  plain stem + filled head, beak lengthened so it reaches the mic.
- Tea's spill was cramped against the cup and clipped by the double
  ring: cup shifted right 1 unit, pour wave bowed further out, the
  filled drop moved out and down so it hangs clear of the cup.
- Fling and Profile passed round 1 unchanged.
Round 2 renders: all five read at 22px and on the 37px docked badge;
rings distinct and metal-toned at both badge sizes, on dark and on
every hue fill.

### Verification (local only — no push, no live-site checks)
- Bun transpiler parse PASS on components/DialNav.tsx (the only
  file touched besides this note).
- Grep re-confirmed: no component outside DialNav references
  DialIcon/iconPaths — the dial remains the only place section
  icons render.

---

## Addendum 2026-11-10 (late evening): Chirp glyph — the bird is now a swift

Owner, in three short messages: "make chirp icon a humming bird",
"just" (i.e. the bird alone — no mic, no music note, no stand),
then "or a swift". Both birds were drawn in the current bold hand
and render-tested head-to-head; **the swift shipped**.

### What changed (components/DialNav.tsx only)
The Chirp stop's glyph — previously a bird singing into a mic on a
stand with a music note — is replaced by a swift in a glide, and
nothing else: two long scythe wings drawn as closed crescent leaves
swept back from the centre, one solid teardrop body (iconFills),
and a short forked tail (two bold strokes). Same iconPaths/
iconFills system, same stroke 2.4, same glyph size (~60% of the
badge), same tick-notched badge ring and metal-token ring colours.
All other stops, dial physics, skins and labels untouched. The
iconFills doc comment was updated to match (it name-checked the
mic head / bird's eye, which no longer exist).

### Render test (cairosvg, true-size rasters, nearest-upscaled to eyeball)
Both candidates rendered at 36px and 22px, idle ink on the dark
surface and white on the Chirp hue (#0284c7):
- Hummingbird, round 1 (stroked outline body + closed wing leaf +
  motion arc + 3-stroke tail fan + eye dot): at 36px the beak read
  but head/wing/body fused into one scribble; at 22px it was an
  abstract squiggle — tail and wing gone.
- Hummingbird, round 2 (simplified per protocol: solid filled
  body, one wing arc, 2 tail strokes, eye and spare detail cut):
  cleaner mass, but the wing arc vanished into the solid body and
  the tail merged with its bottom edge — at 22px a tadpole-like
  blob with a beak bar; still not a bird.
- Swift (passed round 1 unchanged): at 36px and at 22px, idle and
  active, the crescent wings + centre body + fork read instantly
  as a swift in flight — the crispest of the five glyphs at 22px.
Decision rule was "cleaner at 22px wins, tie goes to the
hummingbird" — no tie: the swift won outright after the
hummingbird's one allowed simplification round.
Final in-situ check: the shipped file was re-rendered through the
icon harness (all five stops, 36/22 icons + 71/37 badge mocks);
the swift sits cleanly inside the tick-notched ring at docked
size and the set is otherwise byte-identical to 45da0f1.

### Verification (local only — no push, no live-site checks)
- Bun transpiler parse PASS on components/DialNav.tsx (the only
  file touched besides this note).

---

## Addendum 2026-11-10 (late evening): Fling profiles + clickable stranger view + settings in five sections

Owner, in his words: "in fling make the stranger profile clickable to
view his profile like his things — likes dislikes — and add a separate
profile for fling data that is visible during fling, separate in
settings; and in settings vary: profile personal data / fling data /
display contains the interface options / and queries in one section /
about and faqs in one section — and don't duplicate again the persona
already matched."

### Part A — Fling profile data (NEW table, not yet applied)
- `supabase/migration-0012.sql` (written, NOT applied — the parent
  applies it): `public.fling_profiles (account_id uuid PK → accounts,
  bio text, likes text, dislikes text, updated_at timestamptz default
  now())`, idempotent throughout (create-if-not-exists, drop-policy-
  if-exists, drop-trigger-if-exists). RLS in the codebase idiom:
  `fling_profiles_select_members` — SELECT `to authenticated using
  (true)` (any signed-in member; NO anon policy at all);
  `fling_profiles_insert_own` / `fling_profiles_update_own` scoped to
  `account_id = public.current_account_id()`; the shared
  `set_updated_at()` trigger. The same table + trigger + RLS-enable +
  policies were also added to `supabase/schema.sql` (ground truth).
- Separate BY DESIGN: the personal profile (profiles) mixes
  deck-visible basics with friends-only detail; fling data has one
  audience (the deck) and holds NO private fields — college/grad year
  are never copied in.
- `lib/fling.ts`: `getFlingProfile()` FAILS SOFT — any error (table
  missing pre-migration included) or missing row returns the empty
  fling profile, so every surface renders empty states and nothing
  breaks before 0012 lands. Likes/dislikes are the student's own free
  text; no categories were invented.
- Save path: `saveFlingProfileAction` in app/profile/actions.ts —
  session-client upsert on the account PK (RLS enforces own-row),
  empty fields stored as NULL, caps bio 300 / likes 500 / dislikes 500.
  Pre-migration the save answers "Fling data isn't available yet".

### Part B — Clickable stranger view in Fling
- Deck card (`app/swipe/SwipeDeck.tsx`): the TOP card gains a centred
  top pill, "View Fling profile" → `/swipe/<username>`. Its
  `onPointerDown` stopPropagation means the tap never starts the
  card's drag (the parent handler is the only drag starter), so the
  swipe physics are untouched; the backing preview card gets no link.
- New page `app/swipe/[username]/page.tsx` (own page redirects to
  /profile; unknown handles 404): shows EXACTLY what the card shows —
  hero photo in the deck's own order (gallery first photo, else DP;
  the gallery GRID is not shown), display name, @handle, branch +
  intention chips, public bio — PLUS the Fling data blocks (Fling
  bio / Likes / Dislikes, whitespace-preserving, with plain empty
  states). NOT read: portfolio, gallery grid, college, grad year.
- Actions: `app/swipe/[username]/FlingActions.tsx` calls the deck's
  own `recordSwipeAction` — Fling (♥) / Pass (✕); a match renders the
  match moment with a Message link; otherwise it returns to /swipe,
  which re-deals without that person.
- Developer anonymity: resolved via getDeveloperAccountId as the deck
  does; the developer's page renders the masked identity, no Fling
  data, no actions.
- Already-matched pairs (follow state friends/accepted) get "You're
  already matched" + a Message link to the existing match instead of
  Fling/Pass — consistent with Part C: they are not deck strangers.
  (Viewing a public Fling profile is not block-gated, matching the
  personal profile page's posture; recordSwipeAction still refuses
  blocked pairs server-side.)

### Part C — Deck exclusion: matched people never reappear
AUDIT of `listDeckCandidates` (lib/social.ts) as it stood: excluded
self, the developer (caller-passed), blocked pairs, and ANYONE with a
swipe row from me. GAP: an accepted FOLLOW creates a `matches` row
with NO swipe row (lib/follows.ts), so a followed-and-accepted friend
— a persona already matched — could be re-dealt as a fresh stranger
card. FIX: the deck's parallel fetch now also reads my `matches`
rows (session client) and my ACCEPTED follow rows in either direction
(service role — follow_requests has no client policies), and both sets
are excluded in the deal loop. Swipe-decided people (liked/passed)
were and remain excluded by the swipes filter; "Start again" still
only resurrects passes, never matches.

### Part D — Settings reorganised into FIVE sections (app/profile/page.tsx)
1. **Profile** — ProfileEditor + PrivacySettings, unchanged inside.
2. **Fling data** — NEW `app/profile/FlingProfileEditor.tsx` (bio /
   likes / dislikes + the line "This is your Fling profile — it's
   what people see when they open your card in Fling").
3. **Display** — InterfacePicker + DialSkinPicker, moved under the
   heading; the AnimatedDropdown pickers themselves are untouched
   (one tidy-up: the page now reads the saved theme id ONCE and
   passes it to both pickers instead of reading it twice).
4. **Queries** — the EXISTING `DeveloperRequestForm` component and
   `listMyDeveloperRequestsAction` imported from app/help — the same
   developer_requests table, status flow and admin queue; no parallel
   system was created. (The component also still serves /help; it is
   one shared form, not two copies.)
5. **About & FAQs** — ABOUT line + FAQs + community rules from the
   NEW `lib/help-content.ts`: FAQS/RULES were MOVED verbatim out of
   app/help/page.tsx (which now imports them) so both surfaces render
   one source and cannot drift. The strings were not rewritten — one
   consequence kept deliberately: the FAQ answer "Use the Req to
   Developer form below…" still says "below"; on this page the form
   sits in Queries, one section above About & FAQs.
   Also removed: the Help and Req to Developer link rows inside
   ProfileEditor's bottom list (renamed "Shortcuts & account") —
   they duplicated sections 4/5 on the same page. Its Portfolio ↑ /
   App colour rows remain as in-section jump links to fields above.

#### Settings audit — every field, its ONE home
| Field / control | Section |
|---|---|
| DP (photo upload/replace) | 1 · Profile |
| Gallery photos (add/remove) | 1 · Profile |
| Name, Bio, Branch | 1 · Profile |
| Portfolio links (GitHub/LinkedIn/Website/Other) | 1 · Profile |
| Intention ("I'm here for") | 1 · Profile |
| Preferences (per-intention: interested in, year, languages, college, age, branch, focus) | 1 · Profile |
| App colour (accent) | 1 · Profile |
| Privacy toggles (show online, read receipts) | 1 · Profile |
| Log out | 1 · Profile (Shortcuts & account) |
| Fling bio | 2 · Fling data |
| Likes | 2 · Fling data |
| Dislikes | 2 · Fling data |
| Interface picker | 3 · Display |
| Dial style (wheel skin) picker | 3 · Display |
| Req to Developer form + own-request tracking | 4 · Queries |
| About OneUco, FAQs, community rules | 5 · About & FAQs |
Nothing appears in two sections; the personal profile's fields are
NOT repeated in Fling data (separate table, separate fields).

### Verification (local only — no push, no live-site checks)
- Bun transpiler parse PASS on all 11 touched TS/TSX files:
  lib/fling.ts, lib/social.ts, lib/help-content.ts, app/help/page.tsx,
  app/profile/{actions,page,ProfileEditor,FlingProfileEditor},
  app/swipe/SwipeDeck.tsx, app/swipe/[username]/{page,FlingActions}.tsx.
- Grep confirms FAQS/RULES are defined ONLY in lib/help-content.ts and
  consumed by both pages; no other module imported them from the help
  page.
- Migration 0012 is written but NOT applied, and no deployment was
  made — the parent applies the migration, then pushes.


---

## Addendum 2026-11-10 (late evening) — Chirp photo upload failure: diagnosis + fix

Owner's phone screenshot (21:16 IST): in the Chirp composer he typed
"Launched OneUco on Diwali 2026", attached the AI launch-poster image
(preview rendered, ✕ present), tapped Chirp, and got the red line
"Photo upload failed — check your connection and try again." The post
text was fine; only the photo upload failed.

### Diagnosis — the exact call chain (BEFORE the fix)

`ChirpFeed.pickImage` → `validateImageFile` (lib/validation.ts: rejects
non-`image/*`, >5 MB, empty) → preview via `URL.createObjectURL` →
`ChirpFeed.onPost` (app/chirp/ChirpFeed.tsx):

```
createClient()  (browser anon-key client, lib/supabase/client.ts)
supabase.storage.from("chirp-images").upload(
  `${myAccountId}/chirp-${Date.now()}.${imageExtension(chosen)}`,
  chosen,                                   // ← the RAW original File
  { contentType: chosen.type, upsert: false })
```

- Bucket `chirp-images`, path `<accounts.id>/chirp-<ts>.<ext>`.
  `myAccountId` is `getMyAccount().id` = `public.accounts.id` — exactly
  the folder the storage policy scopes writes to
  (`(storage.foldername(name))[1] = public.current_account_id()::text`,
  supabase/storage-policies.sql).
- NO compression/preparation existed anywhere in the app (grep:
  zero canvas/createImageBitmap/toBlob hits before this fix). Every
  upload sent the original bytes, whatever their size.
- The ONLY failure handling: `if (uploadError) setError("Photo upload
  failed — check your connection and try again.")` — the StorageError
  object was discarded, not even console-logged. That generic string
  lives/lived in four files: ChirpFeed, ChatView (DM), ServerChat,
  JwalamChat — all the same copy-pasted block.
- The screenshot proves the failure happened at the storage POST, not
  at pick-time validation: on a validation failure `pickImage` clears
  the preview and shows the specific validation line; here the preview
  is still attached and the error is the onPost generic string. So the
  file passed validation (image, ≤5 MB) and the upload request itself
  failed.

### Comparison with the WORKING uploads (profile DP / gallery)

ProfileEditor.uploadAvatar is the same pattern byte-for-byte: same
browser client, same `${accountId}/<slot>-<ts>.<ext>` folder, same raw
File, same `contentType: file.type, upsert: false` — only the bucket
differs (`avatars`), and storage-policies.sql defines IDENTICAL
public-read + owner-folder insert/update/delete policies for `avatars`
and `chirp-images`. There is NO code-level bucket-name, path or policy
mismatch for Chirp: the repo cannot tell the two paths apart except
by bucket name.

### Root-cause assessment (confidence + what would confirm)

Two live candidates, in order:

1. **Raw multi-MB upload over a weak connection (most likely, and the
   one this fix removes).** The composer's single non-resumable POST
   of an unprepared file is the most fragile request in the app; the
   screenshot's status bar showed ~3.58 KB/s throughput. Avatar
   uploads "working" historically does not contradict this — different
   files, moments and connections.
2. **Dashboard-side `chirp-images` bucket configuration (cannot be
   confirmed or excluded from code — PARENT: check the dashboards).**
   Buckets and per-bucket settings live in the Supabase dashboard,
   not the repo (schema.sql documents bucket creation only in
   comments). If `chirp-images` carries a lower `file_size_limit` or
   an `allowed_mime_types` list that rejects the poster's type — or if
   its storage.objects INSERT policy was never created in the live DB —
   the identical code that succeeds into `avatars` fails here.
   CHECK: Storage → chirp-images → settings (file size limit, allowed
   MIME types) vs avatars; and confirm the three chirp-images policies
   from supabase/storage-policies.sql exist in the live DB.

Confirming evidence going forward: after this fix, every failed upload
`console.error`s the RAW StorageError (message + status) under a
`[chirp]`/`[dm]`/`[server-chat]`/`[jwalam]` tag, and the user-facing
line names the class (size / type / missing bucket / policy / network).
One reproduced failure with that log open settles (1) vs (2) outright.

### Fix (this addendum's code)

1. **`prepareImageForUpload(file)` — new, lib/images.ts** (the shared
   image lib; no compressor existed to reuse). Canvas-based:
   longest side ≤1600px; small files (≤1.5 MB and within the cap) pass
   through untouched; PNG keeps PNG when the downscaled encode is
   ≤2 MB (posters stay crisp, transparency survives), else the JPEG
   ladder (0.85, then 0.8× at 0.80); photos go straight to the JPEG
   ladder; GIF/SVG pass through (animation/vector); undecodable files
   (e.g. HEIC in Chrome) pass through as the original bytes — storage
   stays the judge, so preparation can never break an upload that
   previously worked. Result carries blob + contentType + extension,
   and the call sites build the storage path from the PREPARED
   extension (a PNG→JPEG fall-through correctly lands as `.jpg`).
2. **`describeUploadError(error)` — new, lib/images.ts.** Maps the
   StorageError to an honest one-liner: 413/size → too-large line;
   mime → type line; bucket-not-found/404 → unavailable line;
   RLS/401/403 → refused/sign-in line; TypeError/failed-to-fetch →
   the original connection line (now reserved for real network
   failures); anything else → neutral retry line. Smoke-tested in Bun
   against all six shapes — mappings verified.
3. **Wired into all four composers that shared the block** (identical
   before/after shape; UX otherwise unchanged — attach → preview → ✕
   → post):
   - app/chirp/ChirpFeed.tsx → `chirp-images`, prefix `chirp-` (the bug)
   - app/friends/[matchId]/ChatView.tsx → `chirp-images`, prefix `dm-<matchId>-` (same bucket — would have hit the same failure next)
   - app/servers/[serverId]/ServerChat.tsx → `server-images`, prefix `msg-<serverId>-`
   - app/servers/[serverId]/JwalamChat.tsx → `server-images`, prefix `msg-<serverId>-`
   Each now: `prepareImageForUpload` → upload prepared blob → on
   error `console.error(tag, uploadError)` + `describeUploadError`.
   `imageExtension` imports removed from all four (path extension now
   comes from the prepared image).
   NOT touched (different buckets, different error strings, working
   historically — noted as follow-ups if wanted): ProfileEditor avatar
   upload ("Upload failed — …", avatars bucket) and CreateServerForm
   icon upload (server-images).

### Verification (local only)

- Bun transpiler parse PASS: lib/images.ts, ChirpFeed.tsx,
  ChatView.tsx, ServerChat.tsx, JwalamChat.tsx.
- Grep: no `imageExtension` left in the four components; the generic
  string survives ONLY inside `describeUploadError`'s network branch.
- Bun smoke test of `describeUploadError` over six synthetic
  StorageError shapes — all mapped as designed.
- Code only: no push, no deploy, no live-site usage.

## Addendum 2026-11-10 (late evening) — Chirp becomes a hub (Live News + Campus Tweets pages) and Settings sections become dropdowns

Owner's asks: (1) "add a component down live news as a campus tweets
component, and don't keep in there — if we click those components
the pages will open in any other page: the live news and campus
tweets" — /chirp turns into a hub of doorway components that OPEN
dedicated pages; (2) "in settings I said to add components like
dropdowns" — the five Settings sections become animated dropdown
components. Built while the Chirp photo-upload fix was in flight in
the same tree: `app/chirp/ChirpFeed.tsx`, its upload path and
`lib/images.ts` were NOT touched; this build composes around them.

### Part A — Chirp hub + two pages

Route map (after this build):

| Route | What lives there |
|---|---|
| `/chirp` | Header + PageIntro ("chirp") + the COMPOSER (composer-only mount, see below) + LIVE NEWS doorway card + CAMPUS TWEETS doorway card. No stories list, no timeline. |
| `/chirp/news` | Header (← Chirp) + `NewsSection` — the full news experience: header bar (LIVE dot, weather chip, Updated stamp, native category select), weather header card, animated stories block, all 12 stories per category. |
| `/chirp/campus` | Header (← Chirp) + PageIntro ("chirp-campus", new line in lib/page-intros.ts) + `ChirpFeed` mounted WHOLE — the full feed, composer included, exactly as /chirp used to render it. |

- LIVE NEWS card (in app/chirp/page.tsx): the old collapsible bar
  restyled as a teaser — LIVE dot, "Live News", region/weather chip
  and the top headline as a one-line preview, taken from the SAME
  cached fetches the news page renders (resolveRegionForAccount +
  getNewsCached("top") + getWeatherCached — no extra upstream cost),
  plus the bar's circled chevron rotated into a doorway arrow. The
  whole card is one Link to /chirp/news.
- CAMPUS TWEETS card: title + the latest 3 chirps as compact preview
  rows (Avatar + author name + first non-empty body line, truncated;
  photo-only chirps show "📷 Photo"; developer authors arrive
  pre-masked from listChirps), whole card a Link to /chirp/campus.
- The composer problem, stated plainly: the owner wanted the
  composer to STAY on /chirp while the feed moved out, but composer
  and timeline are ONE component (ChirpFeed) whose file is
  off-limits during the upload fix. The hub therefore mounts
  ChirpFeed with an empty timeline inside a `.composer-only` scope
  (new rule in app/globals.css): every direct child of the feed root
  except the form and its role="alert" error line is display:none.
  Posting from the hub works exactly as before (the scoped mount
  still runs the untouched upload code); the posted chirp appears
  on /chirp/campus and in the hub's preview card on next load. When
  the upload fix lands and ChirpFeed can be edited again, splitting
  it into Composer + Feed components is the clean-up that removes
  the need for this scope.
- View counting MOVED with the feed: /chirp/campus records views
  for its 50 rendered chirps with the same batched
  increment_chirp_views RPC + per-row fallback the old /chirp page
  used. The hub records NO views — its 3 preview chirps are teasers,
  and counting them would inflate counts for chirps nobody opened.
- NewsSection (components/NewsSection.tsx) was rewritten as the
  always-open page component: the collapse state, the bar toggle
  buttons, everOpened/hasOpened gating are gone. The DATA layer is
  unchanged — same chirp actions (getNewsAction/getWeatherAction),
  same per-mount fetched-once set, same lazy-load on first view of a
  category, same idle-scheduled background prefetch (now starting on
  page mount: landing on the page IS the open intent), same 5-minute
  auto-refresh of the active category + weather and 1-minute
  time-ago tick, same fail-soft empty states and photo fallback
  tiles. The stories block animates in with the grid-rows 0fr→1fr +
  opacity technique (AnimatedStories), keyed by category so every
  switch replays the reveal; the category control stays the native
  styled <select>.
- Both new pages: same members-only gate as /chirp (getMyAccount,
  with the same "finish sign-up" fallback), data-section="chirp" on
  <main> so the chirp section accent applies, and the established
  sub-page header (← Chirp + CHIRP section chip). The dial shell
  treats /chirp/* like other section sub-pages (unchanged).

SINGLE-HOME audit (nothing duplicated):
- Stories list: rendered ONLY by components/NewsSection, mounted
  ONLY by app/chirp/news/page.tsx (grep: no other importer).
- Chirp timeline: rendered ONLY by app/chirp/ChirpFeed.tsx, mounted
  whole ONLY by app/chirp/campus/page.tsx (the hub mount is the
  composer-only scope above — the component file exists once).
- News data: lib/news cached fetches + app/chirp/actions, unchanged,
  shared by hub teaser and news page (cache-shared, not forked).

### Part B — Settings sections as animated dropdowns

- components/AnimatedDropdown.tsx extended with two OPTIONAL props;
  the pickers pass neither and behave byte-identically:
  `defaultOpen` (start expanded) and `collapseOnSubmit={false}`
  (a section's own save buttons must not fold the section away —
  the pickers' collapse-on-option-choice remains the default).
- app/profile/page.tsx: the five <section> blocks became five
  AnimatedDropdowns inside one wrapper (the wrapper's -mt-6 cancels
  the main gap so each dropdown's built-in mt-6 gives one uniform
  rhythm). Closed bars show title + one-line summary pill:
  1. Profile — "Personal data & privacy" — starts OPEN.
  2. Fling data — "Bio, likes & dislikes".
  3. Display — the effective interface's name (my pick → admin
     default → "Seasonal look", via getTheme).
  4. Queries — "Ask the developer".
  5. About & FAQs — "About, FAQs & rules".
  Section bodies keep their previous internal spacing (mt-4 wrapper,
  gap-4); Display's body is the two picker dropdowns themselves,
  untouched (dropdowns nested in the Display dropdown, as the
  pickers already were dropdowns in the section).

Settings audit — fields unchanged, one home each (same homes as the
five-section build; presentation only):

| Field / control | Section (dropdown) |
|---|---|
| DP, gallery, name/bio/branch, portfolio, intention, preferences, app colour, privacy toggles, log out | 1 · Profile |
| Fling bio / likes / dislikes | 2 · Fling data |
| Interface picker, Dial style picker | 3 · Display |
| Req to Developer form + own-request tracking | 4 · Queries |
| About OneUco, FAQs, community rules | 5 · About & FAQs |

No form, action or field moved; ProfileEditor, FlingProfileEditor,
DeveloperRequestForm and both pickers are unmodified.

### Verification (local only — no push, no live-site checks)
- Bun transpiler parse PASS on all 7 touched TS/TSX files:
  components/AnimatedDropdown.tsx, components/NewsSection.tsx,
  app/chirp/page.tsx, app/chirp/news/page.tsx,
  app/chirp/campus/page.tsx, app/profile/page.tsx,
  lib/page-intros.ts. (app/globals.css gained one plain CSS rule.)
- Grep audits: NewsSection imported only by app/chirp/news/page.tsx;
  ChirpFeed referenced only by the hub (composer-only mount) and
  app/chirp/campus/page.tsx (full mount).
- NOT touched (in-flight upload fix): app/chirp/ChirpFeed.tsx,
  lib/images.ts, the storage upload path.

---

## Re-engagement batch — PWA + Web Push (2026-11-11)

Owner direction: fix the #1 limitation from the engagement review —
no way back into a student's day (no app install, no push). Research
page "OneUco Engagement Features Research" recommendation #3.

### What shipped
- **PWA**: app/manifest.ts (standalone, black theme, gold-dial icons —
  public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
  generated dial art; app/icon.png + app/apple-icon.png by file
  convention). Layout gains appleWebApp metadata + a themeColor
  viewport export.
- **Service worker** (public/sw.js): push + notificationclick ONLY.
  No fetch handler, no caching — it can never serve a stale app.
  Registered for signed-in students by components/ServiceWorkerRegister
  (root layout, next to PresenceHeartbeat); the same component stashes
  the beforeinstallprompt event on window.__oneucoInstallPrompt and
  broadcasts 'oneuco-install-ready' for the Settings install button.
- **Push backend** (migration 0013): push_subscriptions table —
  service-role access only (RLS on, NO client policies; endpoints are
  capability URLs). lib/push.ts sends via web-push (new dependency):
  notifyAccount (prunes 404/410 dead subs), getNotifyDisplayName,
  isRecentlyActive (presence window, 3 min). Everything fails soft —
  push can never break the triggering action.
- **Hooks** (awaited, best-effort):
  - recordSwipeAction: a created match pings the other student.
  - follow actions: follow_request + follow_accepted ping alongside
    the existing Inbox items (declines deliberately do NOT push).
  - sendMessageAction: DM ping only for the first message of a burst
    (≤1 of my messages in this chat in 15 min) and never to someone
    seen within 3 minutes; tag dm-<matchId> collapses repeats.
- **Settings section 6 · "Notifications & app"** (the five-section
  layout becomes six; the new section holds only NEW device state —
  no existing field moved): components/NotificationSettings.tsx —
  push state machine (checking / unsupported / iPhone needs-install /
  denied / on / off) via app/push/actions.ts (subscribe/unsubscribe,
  upsert on endpoint), plus install (captured prompt, else Android /
  iOS manual steps; iOS copy explains Home-Screen-first).
- **Config**: Vercel Production env NEXT_PUBLIC_VAPID_PUBLIC_KEY +
  VAPID_PRIVATE_KEY + VAPID_SUBJECT (mailto owner). Keys generated
  2026-11-11; the private key lives ONLY in Vercel env (never in the
  repo). .env.example documents the three names.

### Verification
- Local: tsc --noEmit PASS; next build PASS (routes include
  /manifest.webmanifest and /icon.png; /profile 9.8 kB).
- Migration 0013 applied via Supabase dashboard; VAPID env set via
  Vercel dashboard (both verified by the dashboard task report).

---

## Scheduled chirps (2026-11-11)

Owner's ask: in Chirp, schedule a message and it chirps itself at
that date/time.

### What shipped
- **Migration 0014**: scheduled_chirps table (own-row RLS —
  select/insert/update, no delete; cancel is a status update) +
  post_due_scheduled_chirps() (security definer, per-row exception
  swallow, 100/run cap) + pg_cron job 'post-due-scheduled-chirps'
  every minute. The poster runs INSIDE Postgres — no app server,
  external cron or signed-in user needs to be awake. Schema mirrored
  in supabase/schema.sql (function included; the cron.schedule call
  stays in the migration as a one-shot registration).
- **Actions** (app/chirp/actions.ts, session client): schedule
  (same 500-char/text-or-photo rules as posting; time must be >1 min
  ahead, <1 year out), list my pending (soonest first), cancel
  (pending only).
- **Composer** (ChirpFeed): image upload extracted to
  uploadDraftImage() shared by Post and Schedule — a scheduled
  chirp's photo uploads at write time and is referenced when it
  lands. New "Schedule" toggle in the composer button row opens a
  datetime-local panel ("Post this chirp at" + "Schedule chirp");
  confirmation line states the exact local landing time; my pending
  queue renders under the composer with per-row Cancel. Everything
  lives INSIDE the <form>, so the /chirp hub's composer-only mount
  shows it too (globals.css scope hides only non-form children).

### Verification
- Local: tsc --noEmit PASS; next build PASS (/chirp + /chirp/campus
  rebuilt with the composer changes).
- Migration 0014 applied via Supabase dashboard, verified there:
  scheduled_chirps exists (0 rows); cron.job shows
  'post-due-scheduled-chirps' on '* * * * *', active = true; a test
  call of post_due_scheduled_chirps() on the empty queue returned 0.
- Pushed as commit 4d8504d; Vercel production deployment Ready.

---

## Bottom tab bar — dial demoted to home centrepiece (2026-11-11)

Owner's call, verbatim logic: "who uses the dial… people need
faster access to the app." Three cosmetic redesign directions were
shown and rejected ("this sucks") before he named the real problem:
the dial as NAVIGATION. Decision (his tap): bottom bar for speed,
dial stays as the home centrepiece.

### What shipped
- **components/BottomBar.tsx (new)**: fixed bottom tab bar, five
  stops (Tea/Fling/Homies/Chirp/Profile), one tap from every
  signed-in screen. Reuses the dial's own glyphs and per-stop hues
  (STOPS + DialStopDef now exported from DialNav) and the same
  unread badges (counts keyed by href — Tea = server unread,
  Homies = DM unread). Active tab takes its stop's hue; /inbox
  lights Homies. Safe-area inset padding; max-w-lg centred.
- **DialShell rewritten**: the lg+ docked-dial column is GONE (and
  mobile sections previously had no persistent nav at all).
  Sections render full-width (pages keep their own max-w-md
  columns) inside a pb-24 wrapper so content clears the bar. The
  bar renders on the home route too; the home <main> pads itself
  (pt-6 pb-24) since its dial layout is viewport-height. Hidden
  prefixes unchanged (auth/legal/admin — admin keeps its own nav).
- **DialShellServer**: passes only badges now; themePicker is
  consumed solely by the home page's own getDialData call.
- The dial itself is untouched: big dial on home, wheel skins,
  interface picker, DialSkinPicker, badges — all as before.

---

## The app opens on Fling (2026-11-11)

Owner's direction (main chat, same evening as the bottom bar): when
a signed-in user opens OneUco, the first page is Fling — not the
dial home.

### What shipped
- **Dial home moved**: app/page.tsx → app/home/page.tsx, unchanged
  inside. The dial is reached by the "← OneUco" header links (now
  pointed at /home on swipe, profile, other-profiles, servers,
  friends, chirp, inbox, search) — fittingly, the landing page
  itself carries the most prominent one.
- **Root is a doorway**: new app/page.tsx redirects signed-in →
  /swipe, signed-out → /login; the middleware applies the same
  landing rule first for verified users (pathname "/" → /swipe,
  after the verification gate), so the redirector is a backstop.
- **Every entrance now lands on the deck**: middleware sends
  verified users from /login|/signup|/forgot-password and from a
  blocked /admin attempt to /swipe; login action default next →
  /swipe; OAuth callback safeNext defaults → /swipe; both
  post-verification redirects → /swipe; PWA manifest start_url →
  /swipe (installed app opens on Fling with no redirect hop).
  Explicit `next` deep links are untouched — a user heading
  somewhere specific still lands there.
- **DialShell**: bottom-padding exemption moved from "/" to
  "/home" (the dial page pads its own viewport-height main);
  /home lights no bottom-bar tab, correctly.

---

## Pirate helm page-transition loader (2026-11-11)

Owner's call: the loading symbol is a pirate ship's helm rocking
left-right like steering, shown whenever the user switches pages.
(There was no navigation loading UI at all before — no loading.tsx,
no spinners anywhere; pages just hung on the old screen.)

### What shipped
- **components/PirateHelmLoader.tsx**: the dial's own Pirate Helm
  wheel skin redrawn as one self-contained SVG — timber rim, brass
  band, eight spokes, eight protruding handles with brass tips,
  brass hub cap — in the skin's exact palette.
- **globals.css**: @keyframes helm-rock (0 → +17° → 0 → −17° → 0,
  2.4s ease-in-out infinite, slight translateY settle) on a
  .helm-rock class; prefers-reduced-motion slows it to 6s instead
  of freezing it.
- **app/loading.tsx**: Next's route-transition fallback — renders
  inside the shell (bottom bar stays mounted) on every navigation
  that makes the next page fetch; helm + a small "Steering…"
  caption. Covers all routes (no segment has its own loading file).

### Clarification same evening — a PIRATE at the helm
Owner clarified: not a wheel rocking alone — a pirate gripping the
wheel and turning it. PirateHelmLoader redrawn accordingly: the
figure stands behind the wheel (bandana + tails, beard, eye patch,
coat), arms and hands IN the wheel's animation group so his grip
never leaves the rim; the wheel swings ±19°
(.helm-wheel-rock) while the body leans ±6° a beat behind it
(.helm-body-sway, −0.18s delay). Handles offset 22.5° like the
skin, so none crosses his face; hands land on the rim at 10 and 2.
The wheel-only first version (commit 0d54aa4) shipped minutes
earlier and is superseded by this batch.

### Refinement later that night — real artefact, small, centred
Owner's design notes: loading symbol only (not a control); the
vector version was TOO BIG — make it small and align it correctly
in the centre; and the look must be an old, real, sea-worn wheel —
a piece broken, a pirate photo in it, algae on it, dust on it.
- The SVG pirate/wheel was replaced by a photograph-style artefact
  image (generated to spec, hand-checked): pirate captain's face
  and bandana above the wheel, both hands gripping, a chunk of the
  rim broken and splintered, green algae on the lower rim, salt
  dust in the grooves, tarnished verdigris hub. Processed to
  480×480 WebP, 39 KB, at public/images/pirate-helm-loader.webp.
- PirateHelmLoader now renders that photo in a brass-ringed round
  medallion at 84px, rocking ±10° (.helm-photo-rock, 2.2s) — the
  two-group SVG animation and its keyframes are gone.
- app/loading.tsx: min-height now calc(100dvh − 6rem) so the
  medallion centres in the free screen above the bottom bar,
  netting out the shell's bottom padding.

---

## The dial is retired (2026-11-11, late)

Owner's decision change, superseding the same evening's "dial
stays as the home centrepiece": "I think we don't need that dial
anymore." The rotary dial is removed entirely; the bottom tab bar
is the only navigation; the app still opens on Fling. (The pirate
helm LOADER is a separate thing and stays exactly as specified.)

### What shipped
- **app/home/page.tsx rebuilt without the dial**: wordmark header
  + LiveClock + student search + a plain centred brand block +
  the same footer doors (Inbox with real unread count, Admin,
  Settings). DialNav and DialTipCard are no longer rendered
  anywhere.
- **Contracts moved, not deleted**: STOPS, DialStopDef, DialBadges
  and the palette/picker types moved verbatim from DialNav into
  lib/nav-stops.ts; BottomBar, DialShell and lib/dial-badges now
  import from there.
- **components/DialNav.tsx is an inert stub** (snapshot pushes
  cannot delete remote files) with a retirement note, re-exporting
  lib/nav-stops so any stale import path still resolves.

### Flagged, deliberately untouched (owner's call needed)
- **Wheel skins**: lib/dial-skins, the profiles.dial_skin column
  and Settings' DialSkinPicker (Profile page) styled only the
  dial; they are now orphaned but left in place.
- **DialTipCard** component and the dial_tip_seen flag: unmounted,
  left in the tree.
- **getDialData's themePicker / badges.theme / dialSkin fields**
  are computed but unconsumed now; badges.counts + accentHex are
  still live (bottom bar). Slimming this is a cleanup candidate.
- **InterfacePicker in Profile settings is NOT orphaned**: the 18
  interfaces theme the whole app, and picking them lives there —
  only the dial's long-press shortcut to the same picker is gone.
  The dial-metal CSS tokens in lib/themes + globals.css are inert.

---

## Quote of the day on the loading screen (2026-11-11)

Owner's ask: while loading, show a day quote — love, relationships,
college, friendship. lib/loading-quotes.ts holds 30 original lines
across the four themes (no borrowed quotes, no attributions); the
pick is deterministic by IST day number, so the whole app sees one
quote per day, turning over at India midnight, with no database
or fetch. app/loading.tsx renders it under the helm medallion,
labelled "Quote of the day", above the "Steering…" caption.

---

## Fling "Start again" wait: 2 minutes → 30 seconds (2026-11-11)

Owner's call ("make the fling time to 30 sec"): RESET_WAIT_MS in
SwipeDeck 120_000 → 30_000. The visible countdown after deck
exhaustion now runs 0:30; comments in SwipeDeck and
app/swipe/actions.ts updated to match. Nothing else about the
reset changed — passes only, likes/matches never undone.

### Follow-up the same night — the /home PAGE is removed too
Owner confirmed: "yes — the dial page." Not just the dial widget:
the page goes. app/home/page.tsx is now a redirector to /swipe
(snapshot pushes can't delete files, so the route remains as a
doorway). The eight "← OneUco" header links (swipe, profile,
profile/[username], servers, friends, chirp, inbox, search) now
point straight at /swipe, and DialShell's old /home bottom-padding
exemption is gone (every shelled page takes pb-24). Anything still
landing on /home — bookmarks, an installed PWA, stale links —
ends up on the deck.

---

## Starting-page features + Fling ratings (2026-11-11, late)

Owner approved the suggested trio for the starting page (Fling)
and added a feature of his own: a 1–10 rating in Fling.

### Quote card + "new today" pulse (Fling page)
- The loader's quote of the day (lib/loading-quotes) also prints
  as a slim line at the top of Fling.
- Pulse line: joins / chirps / new matches since IST midnight
  (lib/daily.istMidnightUtc; IST helpers shared by all daily
  features). Zero segments hide; the line hides if all are zero.

### Poll of the day (migration 0015)
- lib/daily-polls.ts: 14 campus questions, picked by IST day —
  same question for everyone, no admin tooling. Votes only are
  stored: daily_poll_votes (PK poll_date+account, own-row RLS),
  counts via the security-definer daily_poll_counts() RPC
  (aggregates only — nobody can see who voted what). One vote per
  day; voting again changes it. components/DailyPoll.tsx renders
  options, then result bars after voting; optimistic with rollback.

### Fling rating 1–10 (migration 0016)
- RateProfile control under the deck card's buttons AND on the
  Fling profile page: tap 1–10, tap again to change. Independent
  of swipes — rating never likes/passes/matches anyone.
- profile_ratings (PK rater+rated, 1–10 check, no self-rating),
  own-row RLS on the GIVEN side. Received ratings are never shown
  publicly; the owner sees only their own average + count (the
  my_received_rating() RPC) in Profile → Fling data.

### Rating design settled the same night — DERIVED, not manual
The manual tap-to-rate build above was superseded within the
hour by the owner's design rule: "the rating is based on likes
received — the more right swipes a user gets, the higher their
rating." Migration 0016 was WITHDRAWN before ever being applied
(the file is now a comment-only record) and the manual control /
action are inert stubs. What shipped instead: lib/fling-rating.ts
computes the score live from swipes — rating = 1 + 9 × (L+3)/(T+6)
for L likes of T received swipes, one decimal, unrated until the
first swipe lands — shown as a ★ chip on the deck card and the
Fling profile page, and on the owner's own Profile → Fling data
with its like/swipe counts. No ratings table exists.

### Chirp features (2026-11-12, owner's pick: trending + poll)
- Poll of the day also renders on the Chirp hub, through the
  shared lib/daily-poll-data.ts helper (the Fling page was
  refactored onto it too) — one poll, one vote, both places.
- Trending card on the hub: the recent-30 chirp read (the Campus
  Tweets preview slices the same fetch) ranked by likes +
  2×comments, top 3, hidden on a zero-engagement day.

### Polls go plural + Chirp layout cleaned + Admin door restored (2026-11-12)
- Owner: "poll of the day has some issue — ask numerous questions
  not just one." The daily poll is now a SET of 5 questions
  (lib/daily-polls pollsOfTheDay: a rotating window over the 14,
  advancing by 5/day), each independently votable, on Fling AND
  the Chirp hub. Migration 0015 was rewritten BEFORE its first
  application (a probe confirmed the table never landed) with
  poll_index in the PK and daily_poll_counts() grouped by
  question; schema.sql's 0015 block was replaced to match.
- Chirp layout cleanup (owner's other tap): every hub card is
  full-width with one rhythm (rounded-3xl, px-4 py-3) — the poll
  stack no longer renders narrower than the doorway cards.
- Admin door: the /home footer carried the only in-app Admin
  link, so removing /home took it away (owner: "where is the
  admin things went off"). The admin AREA never went anywhere —
  /admin is untouched — and the door now sits on the Profile
  page, owner-email only, same rule as the gate itself.

---

## Polls removed; Fling rating goes weekly; new tab order (2026-11-12)

Owner's morning corrections, all in one batch:
- **"Why questions everywhere — remove the poll of the day."**
  The polls are REMOVED from Fling and Chirp entirely. DailyPoll,
  lib/daily-polls, lib/daily-poll-data and the vote action are
  inert stubs. The daily_poll_votes table (migration 0015) stays
  in the database, unused — dropping it is a separate call.
  Trending on Chirp is untouched and stays.
- **"Add students rating per week in Fling."** The Fling rating
  now runs on a WEEKLY window (last 7 days): the ★ chip on deck
  cards and Fling profiles is the weekly score (the profile page
  falls back to all-time in a swipe-less week), Profile → Fling
  data shows weekly + all-time, and Fling gains a **Top this
  week** board — top 5 real students by likes received in the
  last 7 days (developer and *@oneuco.local seed accounts
  excluded), each with their ♥ count and ★ rating.
- **Tab order**: "default should be fling then it should be at
  first then chirp then tea then homies then profile" — STOPS in
  lib/nav-stops reordered to Fling, Chirp, Tea, Homies, Profile.
  Fling was already the default landing page; it is now also the
  first tab.

---

## Public landing page at / (2026-11-13)

The root no longer bounces strangers to /login. Signed-out
visitors get a public landing page: what OneUco is, the five
sections (in tab order, each in its stop colour), why students
switch (cross-college, no college-email gate, all-in-one,
private by default), three steps in, Join/Log in CTAs, Privacy/
Terms footer. Middleware lets / through signed-out; signed-in
users still land on Fling exactly as before (middleware rule +
page-level redirect). Copy covers only what the app does today;
no screenshots (descriptions instead of faked UI). Agreed order
with the owner on 2026-11-13: landing page first, then Maya
Jwalam auto-moderation.

---

## Maya Jwalam auto-moderation (2026-11-13)

Second of the owner's two picks (after the landing page).
- lib/moderation.ts: server-side tripwire filter — severe abuse
  (EN + Hindi/Telugu transliterations), threat phrases, the scam
  shape (link/phone + money pitch), phone-number and character-
  flood flags. Evasion handling: leetspeak folding, letter-run
  collapse, squashed-copy matching for spaced spellings. Links
  and phone numbers alone stay legal (students share notes).
- Post-time enforcement in sendServerMessageAction, Jwalam only
  (is_main_channel): block verdicts are refused with a generic
  community-rules message (never naming the trigger); a flood
  limit (5 posts/min/account) sits beside it. Edits in Jwalam go
  through the same filter.
- Admin sweep at /admin/moderation: live re-score of the last
  150 Jwalam messages (nothing stored), would-blocks first, each
  flag with reason chips and a one-tap delete (admin action
  re-checks the gate and scopes the delete to the main server).
  Author identity appears on this admin page only — the channel
  itself stays anonymous. Card added on the admin home.

---

## Fling home bar (Reddit/X pattern) + deck timer removed (2026-11-13)

Owner, landing on Fling: "when i land at fling i see the ← …
make the fling as home page … make it like reddit and twitter".
- The Fling header's "← OneUco" link pointed at /swipe itself —
  a back arrow on the home page. Gone, along with the FLING chip.
  In its place, a sticky home top bar in the Reddit/X pattern:
  OneUco wordmark left, search button + the student's own avatar
  (→ Profile) right, blurred black as content scrolls under it.
  Fling is the home page; the bar now says so.
- The deck's 30-second "Start again" countdown is REMOVED
  (owner: "the fling sec remove the timer") — state, interval,
  countdown text and the disabled gate all out; the button is
  ready the moment the deck runs out. Server never enforced the
  wait; its comment now records the removal.

---

## Bottom bar active-tab bug — fixed (2026-11-13)

Owner: "if i choose fling it is showing as chirp". Cause:
BottomBar's activeStopIndex() returned hardcoded positions from
the PRE-reorder tab order (servers 0, swipe 1, friends 2, chirp
3, profile 4); after STOPS moved to Fling, Chirp, Tea, Homies,
Profile, every tab lit its neighbour — only Profile (still last)
was right. The function now finds the index by matching the
pathname against each stop's href (with the /inbox → Homies
alias preserved), so reordering the tabs can never desync the
highlight again.

---

## Fling first screen — Tinder/Bumble warmth (2026-11-13)

Owner: "the first open interface is black, make it like tinder
bumble… make it wonderful… should attract users". The deck was
photo-forward already; what read as "black" was everything around
it — flat black page, grey outline buttons, grey card borders.
- Page: warm ambient glow behind the first screen (Fling rose +
  amber shoulder, blurred, page-scoped).
- Card: taller (68dvh, 440–560px), rounder (28px), soft ring +
  rose-tinted shadow instead of the grey border; sharper photo
  rendition (512); bigger bold name; chips are glass (white/10,
  blur) like the dating apps; profiles without a photo get a
  rose-gradient initial tile instead of flat grey.
- Buttons, the Tinder signature: ✕ is a big white circle with a
  rose ✕, ♥ is a rose→orange gradient circle with a warm glow
  shadow; both grow/press with scale feedback. Shuffle is a
  small glass pill between them.
- LIKE/PASS drag stamps: chunkier, rotated, glass-backed.
- "You're all caught up" card and its Start again button get
  the same gradient treatment. No logic changed anywhere.

---

## Fling never lands on a dead deck (2026-11-13)

Owner: landing on Fling after swiping everyone showed only the
"You're all caught up" card — "we should press start again to
get that [the deck and its buttons], thats not good". With a
small community the deck empties fast, so the home page greeted
him with a dead end. Fix in app/swipe/page.tsx: when the fresh
candidate list is empty, the page silently recycles the user's
passes (the same service-role delete resetPassesAction does)
and deals again. Likes are never recycled. The caught-up card
now shows only when there is genuinely nobody left to deal.

---

## Chirp sidebar — Explore / Popular / Start a community (2026-11-13)

Owner: "in chirp change the interface, keep a side bar in that —
keep explore, popular (in this will have news thing) and start
a community (clicking directs to tea area, then we can make
community)". components/ChirpSidebar.tsx, the Reddit pattern:
- Explore → /chirp/campus (the full all-college feed).
- Popular → /chirp/news (the news lives there, as he mapped it).
- Start a community → /servers (Tea, where communities are made).
Wide screens: the hub widens (lg:max-w-4xl) and the sidebar is
a sticky card in a 250px left column. Phones have no room for a
standing sidebar, so the same list rides in a slide-over drawer
opened by an "Explore, Popular & more" bar under the header —
one list, two shells. The hub's composer/Trending/news/tweets
cards are untouched in the content column.

## Campus communities inside Campus Tweets (2026-11-13)

Same conversation, the owner's follow-on: "in campus tweets
users can create their own campus communities in chirp and chat
there". /chirp/campus now carries a Campus communities section
above the feed: the student communities (Tea servers via
listServersForUser, main channel excluded, up to 6) with member
counts and joined state — each row opens that community's chat;
the ＋ Create button and the "see all" line go to Tea, where
communities are made (the flow the sidebar already promised).
Nothing new was built underneath: discovery + entry live in
Chirp, the communities and their chats stay Tea's.

---

## Quotes change on every page change (2026-11-13)

Owner: "the quote of days change them every change of the page".
quoteOfTheDay (deterministic by IST day) is replaced by
randomQuote() in lib/loading-quotes.ts — a fresh random line on
every render. Both call sites render per navigation (the
loading screen and the Fling page), so every page change now
brings a new quote. The loader's "Quote of the day" eyebrow is
now just "Quote".

## Chirp reshuffle: main page is Explore, news only in Popular (2026-11-13)

Owner, minutes after the sidebar shipped: "remove the news
thing in the main chirp page and keep that in the popular page
inside it and keep main page as explore". Done: the Live News
doorway card is OFF /chirp (and its news/weather fetches with
it — the RSS cost leaves the hub); Live News now lives only
inside Popular (/chirp/news). The main Chirp page IS Explore:
composer + the FULL feed inline (ChirpFeed mounted whole with
the latest 30) + the Trending card; the Campus Tweets doorway
card is gone too — Campus Tweets keeps its own page, now headed
by Campus communities. Sidebar Explore now points at /chirp
(exact-match active state); Popular and Start a community
unchanged.

## Campus Tweets joins the sidebar; comments go YouTube-style (2026-11-13)

Owner: "add a page in the side bar as campus tweets — in this
page we can create a separate campus tweets, posting photo and
chat on them, the form should be like yt comments". Sidebar now
has four entries: Explore, Popular, Campus Tweets, Start a
community. The Campus Tweets page was already its own posting
home (composer with photo upload + the feed, communities on
top) — the missing piece was the comment FORM, now rebuilt in
ChirpFeed YouTube-style everywhere comments appear: count
heading, my avatar + underlined "Add a comment…" box first
(Cancel/Comment appear once typing), then the thread as avatar
+ @handle + relative time + body. ChirpFeed learned optional
myName/myPhotoUrl props (both feed pages pass the profile) for
the composer avatar.

---

## RADIO — a bottom tab, background playback (2026-11-13)

Owner's burst: a Radio feature in Chirp — listen to music in
the app, freely, via the JioSaavn unofficial API (saavn.sumit.co,
verified live); mute while using the app; keep listening with
the phone locked; "add a separate navigation feature down as
radio"; "remove the profile — already profile is in top corner
so no need"; "in place of profile place radio". (His earlier
music project: MusicMitra.)

- STOPS: Profile's tab is now RADIO (/radio, boombox glyph,
  --stop-radio amber). Tabs: Fling · Chirp · Tea · Homies ·
  Radio. /profile lives on — reached by the top-corner avatar
  (Fling home bar) and every avatar/name link in the app.
- Playback lives in the SHELL, not the page: components/
  RadioPlayer.tsx is a context provider mounted by DialShell
  around every shelled screen, owning one <audio> element — so
  music survives navigation across the whole app. Media Session
  metadata + transport handlers give lock-screen controls and
  true background play. MiniPlayer (artwork, prev/play/next,
  mute, close, progress hairline) sits above the bottom bar
  app-wide whenever a track is loaded.
- /radio page: search + mood chips (Trending/Telugu/Hindi/
  English/Punjabi/Tamil) + track list + a Now Playing card with
  seek. Playing a row queues the visible list.
- /api/radio: signed-in-only proxy to the unofficial API —
  normalises tracks, decodes HTML entities, picks the 500px
  artwork and the highest stream quality (320kbps).
- Chirp sidebar gains Radio too (fifth entry, above Start a
  community).

## Dead deck, round 2 — likes recycle too; Start again is GONE (2026-11-14)

The owner screenshotted the caught-up card again minutes after
the pass-recycle shipped: his test account had LIKED nearly
everyone and passed on almost nobody, so recycling passes still
dealt an empty deck. Fix in app/swipe/page.tsx: a second
recycle round — when passes don't refill the deck, the page
also forgets my one-sided LIKE swipes (everyone except matched
partners, whose rows stay). Safe by construction: a match lives
in the matches table, the deal query excludes matched pairs
regardless, swipes are unique per pair, and a re-like simply
re-runs the normal match check. SwipeDeck's "Start again"
button is REMOVED — the caught-up card (new copy) now appears
only when there is genuinely nobody dealable left (everyone
matched/blocked/the developer/no other students), and it
promises nothing a button must deliver.

## Mini player fades into a movable bubble (2026-11-14)

Owner: "make the music bar fade to a movable pop up button at
down so it wont disturb when we open other app". The mini
player now has two shapes: the full bar appears when a song
starts (or on bubble tap) and fades after 5s into a floating
BUBBLE — artwork in a progress ring, chat-head style, draggable
anywhere on screen (pointer capture, viewport-clamped). The
bubble's corner badge play/pauses without opening the bar; the
bar also gained a ⌄ minimise button. Playback state is
untouched — only the chrome changed.

---

## MUSIC MITRA — the big merge (2026-11-14)

The owner merged his MusicMitra app into OneUco wholesale: the
Radio feature is renamed Music Mitra (tab wears the short
"Mitra"; the page, sidebar, mini player and lock screen carry
the full name) and rebuilt as a complete music app.

Search honesty work first (owner: "i cant find every song"):
live tests showed JioSaavn HAS the songs (tens of thousands per
query) but ranks remixes/covers above originals and lacks some
western originals entirely (Imagine Dragons' Believer exists
only as covers — a licensing gap no free full-song API fills).
Mitigations shipped: the proxy RE-RANKS every page by play
count; Albums/Playlists tabs surface songs search buries; an
Audius shelf (independent artists, full streams, free API)
appears when a search runs thin; Load more walks the whole
catalogue (the old 24-song cap is gone).

Features: Songs/Albums/Playlists search, collection pages with
Play All, ♥ Liked songs + Recently played (localStorage),
KARAOKE with LRCLIB synced lyrics (active line lit, auto-
scrolling), Post to Chirp (song + artwork into the feed),
Download, system Share — and PROFILE COVERS: students record
(mic, over the playing song) or upload their own singing onto
their profile, where any visitor can play it and ♥ it
(components/ProfileCovers, lib/covers.ts, migration 0017 —
profile_covers + cover_likes + the public `covers` bucket;
fail-soft everywhere until 0017 is applied in the SQL editor).

## Karaoke service — Demucs + Whisper (2026-11-14)

Owner's call: real karaoke, not lyrics-only. karaoke-service/ is
a standalone FastAPI service (extends his MusicMitra
demucs_server.py): POST a song → Demucs htdemucs splits stems →
instrumental (no vocals) for singing over, vocals stem →
faster-whisper large-v3-turbo → synced lyric lines. Job-based
(client polls), results cached on disk per song id forever —
first run is slow on CPU, every later play is instant. Plumbing
verified locally in KARAOKE_STUB mode end to end (health, job,
poll, instrumental file serve); the model path follows his own
working Demucs code. Ships with a Spaces-ready Dockerfile +
README.deploy.md. OneUco side: /api/radio?type=karaoke proxies
start/status via KARAOKE_SERVICE_URL (Vercel env — unset =
graceful "unavailable", LRCLIB karaoke keeps working); the
karaoke panel gains "Sing with the instrumental" + an in-panel
recorder that posts the cover straight to the profile. Poster:
~/workspace/your_files/oneuco-karaoke-poster.png.
