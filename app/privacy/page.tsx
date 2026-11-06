import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — OneUco",
  description: "How OneUco collects, uses and protects student data.",
};

// Public page (no sign-in required): Google OAuth branding links here, and
// students must be able to read it before they create an account.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-neutral-200">
      <h1 className="text-2xl font-semibold text-white">OneUco — Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-400">
        One University Community. Last updated: 7 November 2026.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-base font-semibold text-white">Who can use OneUco</h2>
        <p>
          OneUco is a community app exclusively for students of JNTUH-affiliated
          colleges. Access is limited to students who complete the in-app
          verification described below.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">What we collect</h2>
        <p>
          <strong className="text-white">Account data:</strong> your email
          address, a username and OneUco ID you choose or are assigned, and a
          password (stored only as a salted hash by our authentication
          provider — we never store or see your plain password). If you sign in
          with Google, we receive your name, email address and profile picture
          from Google.
        </p>
        <p>
          <strong className="text-white">Verification data:</strong> to confirm
          you are a JNTUH student, you may upload a photo of your college ID
          card. We read the printed fields (such as name, hall-ticket number,
          branch and college) to check the card. ID card images are stored in a
          private bucket that other students cannot access; they are visible
          only to you and to the app administrator for review.
        </p>
        <p>
          <strong className="text-white">Profile data:</strong> the name, bio,
          branch, photos and portfolio links you choose to add to your profile.
        </p>
        <p>
          <strong className="text-white">Content you create:</strong> posts
          (Chirps), server messages, direct messages, swipes and matches, and
          requests you send through the in-app forms.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">What other students can see</h2>
        <p>
          Only these profile fields are public to other students: your display
          photo, name, bio and branch. Your year of study, college, hall-ticket
          number and ID card are never shown to other students.
        </p>
        <p>
          Posts in the main channel (Maya Jwalam) are anonymous to members: your
          name, username, OneUco ID and photo are not displayed there. The app
          administrator can see authorship for moderation and safety.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">How we use data</h2>
        <p>
          We use your data only to run the app: verifying student status,
          showing your public profile, matching and messaging, moderation and
          safety (including reports and blocks), and responding to requests you
          send us in the app. We do not sell your data, and we do not use it for
          advertising.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Where data is stored</h2>
        <p>
          Data is stored with Supabase (database and file storage, hosted in the
          Mumbai region) and the app is served by Vercel. Authentication is
          handled by Supabase Auth and, if you choose it, Google sign-in.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Your choices</h2>
        <p>
          You can edit or remove your profile information in the app at any
          time, and you can log out on any device from Settings. To ask about
          your data or request its deletion, use the &ldquo;Req to
          Developer&rdquo; form inside the app (Profile → Settings → Help) — it
          reaches the developer directly. No email address is published in the
          app for this purpose.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Changes</h2>
        <p>
          If this policy changes, the updated version will be posted on this
          page with a new date.
        </p>
      </section>
    </main>
  );
}
