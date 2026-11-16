"use client";

import Link from "next/link";
import { useState } from "react";
import {
  deleteChirpAction,
  toggleChirpLikeAction,
} from "@/app/chirp/actions";
import type { ChirpView } from "@/lib/chirp";

// Profile Posts (2026-11-17, Instagram pattern from the owner's
// reference screenshot): a 3-column grid of the student's chirps —
// photo tiles for image chirps, text tiles for words-only ones.
// Tapping a tile opens the full post above the grid with like /
// delete (own posts) — comments stay in Chirp, one tap away.

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export default function ProfilePosts({
  initialChirps,
  emptyText,
}: {
  initialChirps: ChirpView[];
  emptyText: string;
}) {
  const [chirps, setChirps] = useState<ChirpView[]>(initialChirps);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = chirps.find((chirp) => chirp.id === openId) ?? null;

  async function toggleLike(chirp: ChirpView): Promise<void> {
    const result = await toggleChirpLikeAction(chirp.id);
    if (result.error) return;
    setChirps((prev) =>
      prev.map((item) =>
        item.id === chirp.id
          ? {
              ...item,
              likedByMe: result.liked,
              likeCount: item.likeCount + (result.liked ? 1 : -1),
            }
          : item,
      ),
    );
  }

  async function remove(chirp: ChirpView): Promise<void> {
    const result = await deleteChirpAction(chirp.id);
    if (result.error) return;
    setChirps((prev) => prev.filter((item) => item.id !== chirp.id));
    setOpenId(null);
  }

  if (chirps.length === 0) {
    return (
      <p className="rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-6 text-center text-sm leading-relaxed text-neutral-400">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {open ? (
        <article className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-neutral-500">
              {timeAgo(open.createdAt)} · 👁 {open.viewCount}
            </p>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close post"
              className="text-neutral-500 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          {open.body ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
              {open.body}
            </p>
          ) : null}
          {open.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={open.imageUrl}
              alt="Post photo"
              className="w-full rounded-2xl object-cover"
            />
          ) : null}
          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => void toggleLike(open)}
              className={`transition ${
                open.likedByMe ? "text-rose-500" : "text-neutral-400 hover:text-rose-400"
              }`}
              aria-label={open.likedByMe ? "Unlike" : "Like"}
            >
              {open.likedByMe ? "♥" : "♡"} {open.likeCount}
            </button>
            <Link href="/chirp" className="text-neutral-400 transition hover:text-white">
              💬 {open.commentCount} · Open in Chirp
            </Link>
            {open.mine ? (
              <button
                type="button"
                onClick={() => void remove(open)}
                className="ml-auto text-xs text-neutral-500 transition hover:text-red-400"
              >
                Delete
              </button>
            ) : null}
          </div>
        </article>
      ) : null}

      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl">
        {chirps.map((chirp) => (
          <button
            key={chirp.id}
            type="button"
            onClick={() => setOpenId(chirp.id)}
            className="relative aspect-square w-full overflow-hidden bg-neutral-900 text-left transition hover:opacity-90"
            aria-label="Open post"
          >
            {chirp.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={chirp.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center p-2">
                <span className="line-clamp-5 text-center text-[11px] leading-snug text-neutral-300">
                  {chirp.body ?? "♪"}
                </span>
              </span>
            )}
            {chirp.likeCount > 0 ? (
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                ♥ {chirp.likeCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
