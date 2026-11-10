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

import { imageExtension } from "@/lib/validation";

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

// ── Upload preparation (client-side) ─────────────────────────────────────
//
// Until 2026-11-10 every photo upload in the app sent the ORIGINAL file
// bytes: no downscale, no re-encode. A several-MB phone photo or AI
// poster then travelled as one non-resumable storage POST — the exact
// upload most likely to die on a weak mobile connection, and every
// failure surfaced as the same generic "check your connection" line.
// prepareImageForUpload shrinks the file BEFORE upload:
//
//   • longest side capped at 1600px;
//   • PNGs keep PNG when the downscaled encode fits the byte target
//     (posters/graphics stay crisp, transparency survives); otherwise
//     the ladder falls through to JPEG (0.85, then a smaller 0.80 rung);
//   • photos (JPEG/WebP/…) go straight to the JPEG ladder;
//   • small files (≤1.5 MB, within the dimension cap) pass through
//     untouched — no quality loss where none is needed;
//   • GIF/SVG pass through untouched (animation / vector preserved);
//   • anything the browser cannot decode (e.g. HEIC in Chrome) also
//     passes through untouched — storage stays the judge, exactly the
//     pre-fix behaviour, so preparation can never make an upload fail
//     that would previously have succeeded.
//
// CLIENT-SIDE ONLY: uses canvas / createImageBitmap. Safe to import
// from anywhere (nothing browser-specific runs at module scope), but
// only call it from Client Components.

export interface PreparedImage {
  blob: Blob;
  contentType: string;
  extension: string;
}

const UPLOAD_MAX_DIMENSION = 1600;
const UPLOAD_TARGET_BYTES = 2 * 1024 * 1024;
const UPLOAD_PASSTHROUGH_BYTES = Math.floor(1.5 * 1024 * 1024);
const UPLOAD_PASSTHROUGH_TYPES = new Set(["image/gif", "image/svg+xml"]);

interface DecodedImage {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  dispose: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
        dispose: () => bitmap.close(),
      };
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
          dispose: () => bitmap.close(),
        };
      } catch {
        // fall through to the <img> path
      }
    }
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, width, height) => ctx.drawImage(img, 0, 0, width, height),
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch {
    return null;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImageForUpload(
  file: File,
): Promise<{ image: PreparedImage } | { error: string }> {
  if (!file.type.startsWith("image/")) {
    return {
      error: "That file isn't an image — please pick a photo (JPG, PNG or WebP).",
    };
  }
  const passthrough = (): { image: PreparedImage } => ({
    image: { blob: file, contentType: file.type, extension: imageExtension(file) },
  });
  if (UPLOAD_PASSTHROUGH_TYPES.has(file.type) || file.size === 0) {
    return passthrough();
  }

  const decoded = await decodeImage(file);
  if (!decoded) return passthrough();

  try {
    const longest = Math.max(decoded.width, decoded.height);
    const scale = Math.min(1, UPLOAD_MAX_DIMENSION / longest);
    if (scale === 1 && file.size <= UPLOAD_PASSTHROUGH_BYTES) {
      return passthrough();
    }

    const render = (factor: number): HTMLCanvasElement => {
      const width = Math.max(1, Math.round(decoded.width * scale * factor));
      const height = Math.max(1, Math.round(decoded.height * scale * factor));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      decoded.draw(ctx, width, height);
      return canvas;
    };

    const canvas = render(1);

    // Posters/graphics (PNG): keep the format when the downscaled PNG
    // fits the target — text stays crisp and transparency survives.
    if (file.type === "image/png") {
      const png = await canvasToBlob(canvas, "image/png");
      if (png && png.size <= UPLOAD_TARGET_BYTES) {
        return {
          image: { blob: png, contentType: "image/png", extension: "png" },
        };
      }
    }

    // JPEG ladder: full prepared size at 0.85, then 0.8× at 0.80.
    let best: Blob | null = null;
    const rungs: Array<{ factor: number; quality: number }> = [
      { factor: 1, quality: 0.85 },
      { factor: 0.8, quality: 0.8 },
    ];
    for (const rung of rungs) {
      const rungCanvas = rung.factor === 1 ? canvas : render(rung.factor);
      const blob = await canvasToBlob(rungCanvas, "image/jpeg", rung.quality);
      if (blob && (!best || blob.size < best.size)) best = blob;
      if (best && best.size <= UPLOAD_TARGET_BYTES) break;
    }
    if (best && best.size < file.size) {
      return {
        image: { blob: best, contentType: "image/jpeg", extension: "jpg" },
      };
    }
    return passthrough();
  } catch {
    return passthrough();
  } finally {
    decoded.dispose();
  }
}

// Turn a Supabase Storage upload error into the honest one-liner the
// composer should show. The generic "check your connection" line is
// now reserved for actual network failures; size, type, missing-bucket
// and policy/session refusals each say what they are. Callers also
// console.error the raw error — this mapping is for humans, the log
// keeps the evidence.
export function describeUploadError(error: unknown): string {
  const raw = error as {
    message?: string;
    statusCode?: number | string;
    status?: number | string;
  } | null;
  const message = (raw?.message ?? "").toLowerCase();
  const status = Number(raw?.statusCode ?? raw?.status ?? 0);
  if (
    status === 413 ||
    message.includes("maximum allowed size") ||
    message.includes("payload too large") ||
    message.includes("exceeded the maximum")
  ) {
    return "That photo is too large for the server — try a smaller or lower-resolution one.";
  }
  if (message.includes("mime type") || message.includes("invalid_mime")) {
    return "That image type isn't supported — please use a JPG or PNG.";
  }
  if (message.includes("bucket not found") || status === 404) {
    return "Photo uploads are unavailable right now — please let the developer know.";
  }
  if (
    message.includes("row-level security") ||
    message.includes("unauthorized") ||
    status === 401 ||
    status === 403
  ) {
    return "The server refused that upload — sign out and back in, then try again.";
  }
  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "Photo upload failed — check your connection and try again.";
  }
  return "Photo upload failed — please try again.";
}
