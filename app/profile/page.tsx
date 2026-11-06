// Profile + Settings.
//
// Feature port TODO:
// - Public profile shows ONLY: photo(s), name, bio, branch (+ username /
//   OneUco ID on the owner's own view). Year, college and hall-ticket
//   number are never public.
// - Nothing is mandatory: every field is optional, "Skip for now" always
//   works; name/college/branch pre-fill from the ID verification.
// - Profile photo: upload the original photo from the device gallery
//   (`avatars` bucket) at profile setup and later in Edit Profile.
// - Portfolio links live in Settings -> Portfolio (NOT in sign-up).
// - Settings sections: intention + preference filters (per intention:
//   dating / friendship / study partner / networking; all default "Any"),
//   App colour (Black default, Teal, Coral, Violet, Blue, Amber), sound,
//   Help (FAQ + rules), Req to Developer form (lands in
//   `developer_requests`; statuses Received/Planned/Done/Declined — the
//   developer contact shows NO email address anywhere), Account
//   (password, sessions), and a standalone red "Log out" row at the very
//   bottom of Settings (also inside Account). Delete account in the
//   danger zone.
export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Profile</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — profile and settings are ported here in the feature
        phase.
      </p>
    </main>
  );
}
