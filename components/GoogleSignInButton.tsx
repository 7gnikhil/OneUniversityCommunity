"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Continue with Google" via Supabase Auth OAuth. On success the browser
// leaves for Google and returns through /auth/callback?next=<nextPath>;
// the middleware gates then route the new session (dial home, the
// verification shell, or — for the admin entry — the role check).
export default function GoogleSignInButton({
  label,
  nextPath,
}: {
  label: string;
  nextPath: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function onClick(): Promise<void> {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (oauthError) {
      setError("Google sign-in couldn't start. Check your connection and try again.");
      setBusy(false);
    }
    // On success the browser navigates away to Google — nothing more to do.
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full rounded-full border border-neutral-700 bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {busy ? "Opening Google…" : label}
      </button>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
