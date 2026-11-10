"use client";

import { useState } from "react";
import { sizedPhotoUrl } from "@/lib/images";

// The one avatar renderer for lists/chats (friends rows, chirp and
// server-chat authors, member lists, search rows, inbox, DM header).
// It requests a small Supabase rendition of the stored photo
// (lib/images.sizedPhotoUrl — width 96, quality 70 by default: 2x for
// the 40–48px circles it renders) with loading="lazy" and explicit
// width/height so rows never shift as photos arrive.
//
// Failure ladder, so a rendition can never break a face: sized URL
// errors → retry once with the original stored URL → initial tile.
// The tile matches the hand-rolled spans this component replaced
// (neutral-800 circle, muted initial, "D" for the masked developer).

export default function Avatar({
  name,
  photoUrl,
  developer,
  letter,
  sizeClass = "h-10 w-10",
  textClass = "text-sm",
  transformWidth = 96,
  alt = "",
}: {
  /** Used for the tile initial when `letter` isn't given. */
  name: string;
  photoUrl: string | null;
  /** Masked developer projection: tile shows "D", never a photo/name. */
  developer?: boolean;
  /** Explicit tile initial (e.g. the friends list's @-stripped name). */
  letter?: string;
  /** Tailwind size classes shared by the img and the tile. */
  sizeClass?: string;
  /** Tailwind text-size class for the tile initial. */
  textClass?: string;
  /** Rendition width requested from Storage (256 for large photos). */
  transformWidth?: number;
  alt?: string;
}) {
  // The src that most recently errored; drives the fallback ladder
  // and self-resets when photoUrl changes (it keys off URL values).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const sized = photoUrl ? sizedPhotoUrl(photoUrl, transformWidth) : null;
  let src: string | null = null;
  if (photoUrl && sized) {
    if (failedSrc === sized && sized !== photoUrl) src = photoUrl;
    else if (failedSrc !== sized && failedSrc !== photoUrl) src = sized;
  }

  if (!src) {
    return (
      <span
        className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-neutral-800 ${textClass} font-semibold text-neutral-400`}
      >
        {developer
          ? "D"
          : (letter ?? name.charAt(0).toUpperCase() ?? "?") || "?"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={transformWidth}
      height={transformWidth}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`${sizeClass} shrink-0 rounded-full object-cover`}
    />
  );
}
