import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import LoginForm from "./LoginForm";

// Login — password OR direct Continue with Google. There is NO OTP login
// anywhere in OneUco; the only OTP-style flow is the forgot-password email
// reset. Admins have their own entry (/admin/login): an account with an
// admin role skips student profile completion (Admin Pass) but never skips
// authentication.

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">OneUco</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400">
          One University Community
        </p>
      </div>

      {params.error === "auth" ? (
        <p className="w-full rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          That sign-in didn&apos;t complete. Please try again.
          {params.reason ? (
            <span className="mt-0.5 block text-xs text-red-400/70">({params.reason})</span>
          ) : null}
        </p>
      ) : null}

      <LoginForm next={next} />

      <div className="flex w-full items-center gap-3 text-[11px] uppercase tracking-widest text-neutral-400">
        <span className="h-px flex-1 bg-neutral-800" />
        or
        <span className="h-px flex-1 bg-neutral-800" />
      </div>

      <GoogleSignInButton label="Continue with Google" nextPath={next} />

      <div className="flex w-full items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-neutral-400 transition hover:text-white">
          Forgot password?
        </Link>
        <Link href="/admin/login" className="text-neutral-400 transition hover:text-white">
          Admin sign-in
        </Link>
      </div>

      <p className="text-sm text-neutral-400">
        New to OneUco?{" "}
        <Link href="/signup" className="font-medium text-white transition hover:text-neutral-300">
          Create your account
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-neutral-400">
        OneUco is for students everywhere. New here? Create an account
        with any personal email or continue with Google — no college email
        is needed, and you&apos;ll just add a few study details before you
        get in.
      </p>
    </main>
  );
}
