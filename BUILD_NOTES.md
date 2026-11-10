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
