import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";

// Root — a doorway, not a page (owner's call, 2026-11-11: the app
// opens on Fling). Signed-in users landing here go straight to the
// deck at /swipe; the middleware applies the same rule before this
// renders, and sends everyone else to /login or the /verify shell —
// this page is the belt to its suspenders. The dial home lives at
// /home now: the centrepiece, not the entrance.
export default async function RootPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  redirect(account ? "/swipe" : "/login");
}
