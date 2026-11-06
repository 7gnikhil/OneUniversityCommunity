# STATUS — what this scaffold is, and is not

**Is:**
- A clean, standalone **production starting point** for OneUco:
  Next.js (TypeScript, App Router) project skeleton with the agreed route
  structure — dial home, login, forgot-password, verification, swipe,
  servers, Chirp, friends, inbox, profile, admin.
- A **complete, runnable database schema** (`supabase/schema.sql`) mirroring
  the app's data model, with Row Level Security starter policies, the
  one-account-per-roll-number constraint, and the public/private data split
  (public profiles vs private verification records).
- Wiring templates: `.env.example`, Supabase browser/server/admin client
  helpers, session middleware stub, and a README with the full
  Supabase → Google OAuth → email OTP → GitHub → Vercel setup sequence.
- Honest placeholders: each route page names its feature and lists what the
  port must implement (TODO comments), following the design decisions made
  for the hosted prototype — Telegram-style anonymous Maya Jwalam, dial
  navigation, intention-based deck filters, privacy stripping server-side,
  Admin Pass with password, OTP only in forgot-password.

**Is not:**
- Not the full app. No feature is implemented yet — there is no working
  swipe deck, chat, Chirp feed or verification pipeline in this repo.
  The live prototype remains the Muse-hosted artifact; its code is not
  exportable, which is why this scaffold exists.
- Not connected to anything: no Supabase project, Google OAuth client,
  GitHub repo or Vercel project has been created or touched by this
  scaffold. No real secrets are present anywhere in it.
- Not launch-ready security-wise: RLS policies are *starter* policies and
  the server-side anonymity stripping for Maya Jwalam must be implemented
  and tested during the port.

**Next phase:** port the features route by route from the prototype —
auth + verification first (the gate everything else sits behind), then
profiles/deck/matching, servers + Maya Jwalam, Chirp, friends/DMs, inbox
and reveal requests, admin queues — then run the README setup end-to-end
and deploy.
