// Sized renditions for stored photos (speed batch, 2026-11-10).
//
// Every photo URL stored in the database was produced by Supabase
// Storage's getPublicUrl, so it has the shape
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
// (buckets: avatars, server-images, chirp-images — see the upload
// call sites). Supabase serves resized renditions of the same object
// from the render path:
//   https://<project>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=W&quality=Q
// sizedPhotoUrl performs exactly that rewrite, and ONLY that: a URL
// that doesn't match the public-object pattern (external URL, already
// a render URL, unparseable) comes back untouched.
//
// Callers must tolerate the rendition failing (e.g. a project plan
// without image transformation): components/Avatar falls back to the
// original URL on error, then to the initial tile — never a broken
// image.

const PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/";
const RENDER_IMAGE_MARKER = "/storage/v1/render/image/public/";

export function sizedPhotoUrl(
  url: string | null | undefined,
  width: number,
  quality = 70,
): string | null {
  if (!url) return null;
  const at = url.indexOf(PUBLIC_OBJECT_MARKER);
  if (at === -1) return url;
  const base = url.slice(0, at) + RENDER_IMAGE_MARKER + url.slice(at + PUBLIC_OBJECT_MARKER.length);
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}width=${width}&quality=${quality}`;
}
