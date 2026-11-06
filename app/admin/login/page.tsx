import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// Admin entry — separate from student login. Sign-in is Google-only here,
// and signing in is not enough: after authentication, /admin/check verifies
// (server-side) that the account carries an admin role. Any other account
// is signed straight back out with the rejection explained. No email
// address or other identifier is ever shown on this page.
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          OneUCo Developer
        </p>
      </div>

      {params.error === "not-admin" ? (
        <p className="w-full rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          That Google account doesn&apos;t have an admin role, so it was
          signed back out. This entry is only for the OneUCo Developer and
          appointed admins.
        </p>
      ) : null}
      {params.error === "session" ? (
        <p className="w-full rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          Your admin sign-in session expired. Please sign in again.
        </p>
      ) : null}

      <GoogleSignInButton
        label="Admin — Continue with Google"
        nextPath="/admin/check"
      />

      <p className="text-center text-xs leading-relaxed text-neutral-600">
        Only accounts with an admin role pass this entry. Admins still
        authenticate like everyone else — the Admin Pass skips student
        verification, never sign-in.
      </p>

      <Link href="/login" className="text-sm text-neutral-400 transition hover:text-white">
        ← Student sign-in
      </Link>
    </main>
  );
}
