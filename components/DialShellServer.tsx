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
export default async function DialShellServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  if (!account) return <>{children}</>;

  const { badges, themePicker } = await getDialData(supabase, account.id);
  return (
    <DialShell badges={badges} themePicker={themePicker}>
      {children}
    </DialShell>
  );
}
