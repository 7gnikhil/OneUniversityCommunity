import Link from "next/link";
import AdminLoginForm from "./AdminLoginForm";

// Admin entry — separate from student login, and mail + password only
// (owner decision 2026-11-07: no Google on the admin door). Signing in is
// not enough: the action verifies (server-side) that the sign-in is the
// owner's own mail — the only address the Admin Pass accepts — and signs
// anyone else straight back out. No email address is ever shown here.
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
          That account doesn&apos;t have an admin role, so it was signed
          back out. This entry is only for the OneUCo Developer and
          appointed admins.
        </p>
      ) : null}
      {params.error === "session" ? (
        <p className="w-full rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          Your admin sign-in session expired. Please sign in again.
        </p>
      ) : null}

      <AdminLoginForm />

      <p className="text-center text-xs leading-relaxed text-neutral-600">
        Owner access only — restricted to the owner&apos;s mail. Forgot
        the password?{" "}
        <Link href="/admin/forgot-password" className="text-neutral-400 underline underline-offset-2 transition hover:text-white">
          Admin password recovery
        </Link>{" "}
        emails a reset link only if the address can recover the admin
        account. The Admin Pass skips student profile completion, never
        sign-in.
      </p>

      <Link href="/login" className="text-sm text-neutral-400 transition hover:text-white">
        ← Student sign-in
      </Link>
    </main>
  );
}
