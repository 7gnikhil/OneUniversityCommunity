import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import {
  getInviteByCode,
  getMembership,
  getServerById,
} from "@/lib/servers";
import JoinInviteButton from "./JoinInviteButton";

// Invite link landing (/servers/join/[code]). Signed-in + verified is
// enforced by middleware; this page resolves the code, shows what server
// it opens, and joins on the visitor's tap. Direct invites (made for one
// specific student) only work for that student.
export default async function JoinInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  let body: React.ReactNode;
  try {
    const admin = createAdminClient();
    const invite = await getInviteByCode(admin, code.trim().toUpperCase());
    if (!invite) {
      body = <p className="text-sm text-neutral-400">That invite link doesn&apos;t look right — it may have been regenerated.</p>;
    } else if (invite.expires_at && invite.expires_at < new Date().toISOString()) {
      body = <p className="text-sm text-neutral-400">That invite has expired — ask for a fresh one.</p>;
    } else if (
      invite.invitee_account_id &&
      account &&
      invite.invitee_account_id !== account.id
    ) {
      body = <p className="text-sm text-neutral-400">That invite was made for someone else.</p>;
    } else {
      const server = await getServerById(admin, invite.server_id);
      if (!server) {
        body = <p className="text-sm text-neutral-400">That server doesn&apos;t exist anymore.</p>;
      } else if (account) {
        const membership = await getMembership(admin, server.id, account.id);
        body = (
          <>
            {server.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={server.icon_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-xl font-semibold text-neutral-300">
                {server.name.charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <h1 className="text-xl font-semibold">{server.name}</h1>
            {server.description ? (
              <p className="max-w-sm text-sm leading-relaxed text-neutral-400">{server.description}</p>
            ) : null}
            {membership ? (
              <>
                <p className="text-sm text-neutral-400">You&apos;re already a member.</p>
                <Link
                  href={`/servers/${server.id}`}
                  className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
                >
                  Open server
                </Link>
              </>
            ) : (
              <JoinInviteButton code={invite.invite_code} />
            )}
          </>
        );
      } else {
        body = <p className="text-sm text-neutral-400">Finish signing up first, then open this link again.</p>;
      }
    }
  } catch {
    body = <p className="text-sm text-amber-200">Invites aren&apos;t fully configured yet — please try again shortly.</p>;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {body}
      <Link href="/servers" className="text-sm text-neutral-500 transition hover:text-white">
        All servers
      </Link>
    </main>
  );
}
