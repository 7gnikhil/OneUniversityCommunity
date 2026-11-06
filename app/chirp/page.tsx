// Chirp — the X-style public feed.
//
// Feature port TODO:
// - "For you" / "Following" tabs; @handles derive from the unique username.
// - Chirp cards: like / reply / re-chirp / view counts (views are real,
//   counted server-side — see chirps.view_count, chirp_likes, chirp_comments).
// - Floating compose button; compose supports text, stickers and gallery
//   image uploads (images in the `chirp-images` storage bucket).
// - Chirp detail page with comments.
// - Identities are NORMAL here (unlike anonymous Maya Jwalam).
export default function ChirpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Chirp</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — the Chirp feed is ported here in the feature phase.
      </p>
    </main>
  );
}
