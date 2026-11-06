# OneUco — One University Community

A students-only social app for JNTUH: swipe & match, servers (including the
anonymous, Telegram-style main channel **Maya Jwalam**), a Chirp feed,
friend DMs, profile-reveal requests and an Inbox — gated by real student
verification (ID-card parse + hall-ticket structure check + review queue).

**Stack:** Next.js (TypeScript, App Router) · Supabase (Postgres / Auth /
Storage) · Vercel.

> This repo is the **production scaffold**. It contains the route structure,
> the full database schema and the setup wiring — the app features are
> ported into these routes in the next phase. See `STATUS.md`.

---

## 1. Create the Supabase project (database + auth + storage)

1. Go to [supabase.com](https://supabase.com) → **New project**.
   - Name: `oneuco`
   - Region: **South Asia (Mumbai) — ap-south-1** (closest to JNTUH users)
   - Set a strong database password and save it in your password manager.
2. **Run the schema:** Dashboard → **SQL Editor** → New query → paste the
   entire contents of `supabase/schema.sql` → **Run**. This creates all
   tables, indexes, triggers, the public-profile view and the RLS policies.
3. **Load the college codes:** insert JNTUH's *officially published*
   college-code list into `college_codes (code, college_name)`. Do not
   invent entries — verification validates the college code inside each
   hall-ticket number against this table.
4. **Create the storage buckets** (Dashboard → Storage → New bucket):

   | Bucket          | Public? | Contents                                  |
   | --------------- | ------- | ----------------------------------------- |
   | `avatars`       | Public  | Profile photos                            |
   | `chirp-images`  | Public  | Chirp and DM images                       |
   | `server-images` | Public  | Server icons and server message images    |
   | `id-cards`      | **Private** | ID-card photos for verification review |

   Then add `storage.objects` policies: public buckets — public read,
   writes scoped to a folder named by the uploader's account id;
   `id-cards` — owner upload only, reads restricted to admin/service-role.
5. **Copy your keys** (Dashboard → Settings → API) into `.env.local`
   (see `.env.example`): Project URL, anon key, and the **service_role**
   key (server-only — never ship it to the browser).

## 2. Google sign-in ("Continue with Google")

1. [Google Cloud Console](https://console.cloud.google.com) → create a
   project named **OneUco**.
2. **APIs & Services → OAuth consent screen** → External → app name
   `OneUco`, your support email → Save (publish it when you go live).
3. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `OneUco Web`
   - **Authorised redirect URI** (exactly this, with your project ref):
     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```
   - Create → copy the **Client ID** and **Client Secret**.
4. In Supabase: **Authentication → Providers → Google** → enable → paste
   the Client ID + Client Secret → Save.
5. Never commit the client secret; keep it only in Supabase and in your
   (git-ignored) `.env.local` / Vercel env vars.

> Login design (fixed): password (OneUco ID / username / email + password)
> **or** direct Continue with Google. There is **no OTP login** — the only
> OTP in OneUco is the forgot-password email OTP (next step). The owner's
> admin entry checks the owner email **server-side only**; it is never
> displayed anywhere in the app.

## 3. Email sender (forgot-password OTP)

1. Create an account with an email provider, e.g. [Resend](https://resend.com)
   (free tier is enough for a beta), verify your sending domain/address.
2. Create an API key → put it in `.env.local` as `RESEND_API_KEY` and set
   `EMAIL_FROM`.
3. The forgot-password flow sends a one-time code to the account's email;
   codes expire in ~5 minutes with attempt limits.

## 4. Run locally

```bash
cp .env.example .env.local   # fill in your values
npm install
npm run dev                  # http://localhost:3000
```

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "OneUco production scaffold"
git branch -M main
git remote add origin https://github.com/<your-username>/oneuco.git
git push -u origin main
```

(Confirm `.env.local` is **not** in the commit — `.gitignore` covers it.)

## 6. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → Import the
   GitHub repo. If the repo doesn't appear, grant **Vercel's GitHub app**
   access to it (GitHub → Settings → Applications → Vercel → repository
   access).
2. Framework preset: **Next.js** (auto-detected). Root directory: `./`.
3. **Environment Variables** — add every variable from `.env.example`
   (Supabase URL + anon key, service_role key, Google client ID/secret,
   email key/from) for the Production environment.
4. **Deploy.** Production branch is **`main`** — every push to `main`
   redeploys; other branches get preview URLs.
5. After the first deploy, add your Vercel domain to:
   - Supabase → Authentication → URL Configuration (Site URL + redirect URLs)
   - Google Cloud OAuth client (Authorised JavaScript origins), if you add
     direct Google integrations later.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_CLIENT_SECRET` are server-only.
- All tables have RLS enabled; review `supabase/schema.sql` policies before
  public launch and tighten the starter policies (e.g. move count
  increments and match creation fully into audited server functions).
- `id-cards` must stay private: ID photos are verification evidence, shown
  only in the admin review queue.
- Maya Jwalam anonymity is enforced in server code (author fields are
  stripped from member-facing responses) — RLS alone cannot hide a column.
