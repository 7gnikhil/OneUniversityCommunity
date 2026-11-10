import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDiwaliMode } from "@/lib/server/diwali-settings";

// Keep-warm endpoint for the external cron pinger.
//
// Every page render opens with the same shared reads — the seasonal
// (Diwali) setting and a service-role Supabase round trip — so a cold
// instance + cold connection pool makes the first real visitor wait
// on all of it. This route performs those same cheap reads and
// nothing else: hitting it every few minutes keeps the function warm
// and the Supabase pool exercised, so real renders start hot.
//
// No auth by design: it reads no user data, returns no data beyond
// { ok: true }, and costs one cached settings read + one head-count
// query per hit. Best-effort — a failed read still answers ok, the
// next ping retries.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDiwaliMode();
  } catch {
    // The settings read fails soft internally; this is belt-and-braces.
  }
  try {
    const admin = createAdminClient();
    await admin
      .from("accounts")
      .select("id", { count: "exact", head: true });
  } catch {
    // Warm is best-effort — never fail the ping over it.
  }
  return NextResponse.json({ ok: true });
}
