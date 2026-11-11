import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getDialData } from "@/lib/dial-badges";
import DialShell from "@/components/DialShell";

// Server wrapper for the desktop dial shell (components/DialShell):
// resolves the signed-in account and the dial's unread badges, then
// hands both to the client shell. Session + account resolution is
// request-cached (lib/auth/my-account), and the root layout already
// resolved the session for the presence heartbeat — so this adds no
// extra Auth round trip, and badges are server-rendered per navigation
// exactly like the dial home (no client polling). Signed-out visitors
// (login, signup, …) get their page bare; the middleware owns their
// redirects.
//
// ADMIN GATE (admin speed pass): under /admin the dial data must not
// be computed at all — getDialData costs ~10 round trips (profile,
// DM + server + inbox unread counts, theme pick, admin theme, wheel
// skin) that an admin render never displays, because Admin carries
// its own header/nav (each subpage links back to /admin; the admin
// home links "View site"). So for /admin routes this wrapper returns
// the page bare BEFORE any fetching — the same bare shape mobile
// already renders — and components/DialShell hides the dial chrome
// under /admin on soft navigations too. The route comes from the
// x-pathname request header the middleware stamps; if it is absent
// the wrapper falls back to the full shell exactly as before.
export default async function DialShellServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <>{children}</>;
  }

  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  if (!account) return <>{children}</>;

  const { badges } = await getDialData(supabase, account.id);
  return <DialShell badges={badges}>{children}</DialShell>;
}
