"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ChirpCommentView, ChirpView } from "@/lib/chirp";
import Avatar from "@/components/Avatar";
import { validateImageFile } from "@/lib/validation";
import { describeUploadError, prepareImageForUpload } from "@/lib/images";
import {
  addChirpCommentAction,
  cancelScheduledChirpAction,
  createChirpAction,
  deleteChirpAction,
  fetchChirpCommentsAction,
  fetchChirpsAction,
  listMyScheduledChirpsAction,
  scheduleChirpAction,
  toggleChirpLikeAction,
  type ScheduledChirpView,
} from "./actions";

// Chirp feed: compose (text + optional photo) and the global timeline.
// Likes and comments are real rows (chirp_likes / chirp_comments); the
// counts shown are the server's denormalised counters, refreshed here
// after every interaction and on manual refresh.
export default function ChirpFeed({
  initialChirps,
  myAccountId,
  accentHex: accent,
}: {
  initialChirps: ChirpView[];
  myAccountId: string;
  accentHex: string;
}) {
  const [chirps, setChirps] = useState<ChirpView[]>(initialChirps);
  const [draft, setDraft] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scheduled chirps (migration 0014): the schedule panel's state and
  // my pending queue, loaded on mount and refreshed after a schedule.
  const [scheduleOpen, setScheduleOpen] = useState<boolean>(false);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [scheduled, setScheduled] = useState<ScheduledChirpView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMyScheduledChirpsAction().then((rows) => {
      if (!cancelled) setScheduled(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh(): Promise<void> {
    const fresh = await fetchChirpsAction();
    if (fresh.length > 0 || chirps.length === 0) setChirps(fresh);
  }

  function pickImage(file: File | null): void {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  // Uploads the draft's photo (if any) exactly as a post does —
  // shrunk before upload (lib/images): a raw multi-MB photo/poster
  // as one storage POST is the upload most likely to die on a weak
  // connection. Preparation never blocks — undecodable files pass
  // through as the original bytes. Shared by Post and Schedule: a
  // scheduled chirp's photo is stored at write time and simply
  // referenced when the chirp lands.
  async function uploadDraftImage(): Promise<
    { imageUrl: string | null } | { error: string }
  > {
    if (!imageFile) return { imageUrl: null };
    const chosen: File = imageFile;
    const prepared = await prepareImageForUpload(chosen);
    if ("error" in prepared) return { error: prepared.error };
    const supabase = createClient();
    const path = `${myAccountId}/chirp-${Date.now()}.${prepared.image.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("chirp-images")
      .upload(path, prepared.image.blob, {
        contentType: prepared.image.contentType,
        upsert: false,
      });
    if (uploadError) {
      console.error("[chirp] photo upload failed", uploadError);
      return { error: describeUploadError(uploadError) };
    }
    return {
      imageUrl: supabase.storage.from("chirp-images").getPublicUrl(path).data
        .publicUrl,
    };
  }

  async function onPost(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (posting) return;
    const body = draft.trim();
    if (!body && !imageFile) return;
    setPosting(true);
    setError(null);
    setNotice(null);

    const uploaded = await uploadDraftImage();
    if ("error" in uploaded) {
      setPosting(false);
      setError(uploaded.error);
      return;
    }

    const result = await createChirpAction(body, uploaded.imageUrl);
    setPosting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void refresh();
  }

  // Schedule the current draft: same upload path as posting, then
  // the row waits in scheduled_chirps for the database's pg_cron
  // poster. The confirmation line states the exact local time it
  // will land.
  async function onSchedule(): Promise<void> {
    if (scheduling || posting) return;
    const body = draft.trim();
    if (!body && !imageFile) return;
    if (!scheduleAt) {
      setError("Pick a date and time first.");
      return;
    }
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      setError("Pick a time at least a minute from now.");
      return;
    }
    setScheduling(true);
    setError(null);
    setNotice(null);

    const uploaded = await uploadDraftImage();
    if ("error" in uploaded) {
      setScheduling(false);
      setError(uploaded.error);
      return;
    }

    const result = await scheduleChirpAction(
      body,
      uploaded.imageUrl,
      when.toISOString(),
    );
    setScheduling(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setScheduleOpen(false);
    setScheduleAt("");
    setNotice(
      `Scheduled — this chirp will post on ${when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`,
    );
    setScheduled(await listMyScheduledChirpsAction());
  }

  async function onCancelScheduled(id: string): Promise<void> {
    const result = await cancelScheduledChirpAction(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setScheduled((prev) => prev.filter((row) => row.id !== id));
  }

  async function onLike(chirp: ChirpView): Promise<void> {
    const result = await toggleChirpLikeAction(chirp.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setChirps((prev) =>
      prev.map((row) =>
        row.id === chirp.id
          ? {
              ...row,
              likedByMe: result.liked,
              likeCount: Math.max(0, row.likeCount + (result.liked ? 1 : -1)),
            }
          : row,
      ),
    );
  }

  async function onDelete(chirp: ChirpView): Promise<void> {
    const result = await deleteChirpAction(chirp.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setChirps((prev) => prev.filter((row) => row.id !== chirp.id));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => void onPost(event)}
        className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What's happening on campus?"
          className="w-full resize-none rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        {imagePreview ? (
          <div className="relative w-32">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Attachment preview" className="w-32 rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => pickImage(null)}
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs text-white"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => pickImage(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300 transition hover:bg-neutral-900"
          >
            + Photo
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300 transition hover:bg-neutral-900"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setScheduleOpen((open) => !open)}
            className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300 transition hover:bg-neutral-900"
          >
            Schedule
          </button>
          <button
            type="submit"
            disabled={posting || scheduling || (!draft.trim() && !imageFile)}
            className="ml-auto rounded-full px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            {posting ? "Posting…" : "Chirp"}
          </button>
        </div>
        {scheduleOpen ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-black p-3">
            <label className="text-xs text-neutral-400">
              Post this chirp at
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white [color-scheme:dark] focus:border-neutral-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void onSchedule()}
              disabled={
                scheduling || (!draft.trim() && !imageFile) || !scheduleAt
              }
              className="self-start rounded-full px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: accent }}
            >
              {scheduling ? "Scheduling…" : "Schedule chirp"}
            </button>
            <p className="text-xs leading-relaxed text-neutral-500">
              It posts on its own at that time — you don&apos;t need to be
              online.
            </p>
          </div>
        ) : null}
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
        {scheduled.length > 0 ? (
          <ul className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
            {scheduled.map((row) => (
              <li key={row.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-neutral-300">
                  {row.body ?? "Photo chirp"}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(row.scheduledFor).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => void onCancelScheduled(row.id)}
                  className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition hover:bg-neutral-900"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {chirps.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          No chirps yet — post the first one.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {chirps.map((chirp) => (
            <ChirpCard
              key={chirp.id}
              chirp={chirp}
              accent={accent}
              onLike={() => void onLike(chirp)}
              onDelete={() => void onDelete(chirp)}
              onCommentPosted={() => void refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChirpCard({
  chirp,
  accent,
  onLike,
  onDelete,
  onCommentPosted,
}: {
  chirp: ChirpView;
  accent: string;
  onLike: () => void;
  onDelete: () => void;
  onCommentPosted: () => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false);
  const [comments, setComments] = useState<ChirpCommentView[]>([]);
  const [commentDraft, setCommentDraft] = useState<string>("");
  const [commentBusy, setCommentBusy] = useState<boolean>(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const time = new Date(chirp.createdAt).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  async function toggleComments(): Promise<void> {
    if (!commentsOpen) {
      const fresh = await fetchChirpCommentsAction(chirp.id);
      setComments(fresh);
    }
    setCommentsOpen((value) => !value);
  }

  async function onComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (commentBusy || !commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    const result = await addChirpCommentAction(chirp.id, commentDraft);
    setCommentBusy(false);
    if (result.error) {
      setCommentError(result.error);
      return;
    }
    setCommentDraft("");
    const fresh = await fetchChirpCommentsAction(chirp.id);
    setComments(fresh);
    onCommentPosted();
  }

  return (
    <li className="rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex gap-3">
        <Avatar
          name={chirp.author?.name ?? "?"}
          photoUrl={chirp.author?.photoUrl ?? null}
          developer={chirp.author?.developer}
          sizeClass="h-10 w-10"
          textClass="text-sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {chirp.author?.developer ? (
              // Masked developer projection: plain name, no profile
              // link, no @handle (developer anonymity rule).
              <span className="text-sm font-medium">{chirp.author.name}</span>
            ) : chirp.author ? (
              <Link href={`/profile/${chirp.author.username}`} className="text-sm font-medium transition hover:underline">
                {chirp.author.name}
              </Link>
            ) : (
              <span className="text-sm font-medium text-neutral-400">A student</span>
            )}
            {chirp.author && !chirp.author.developer ? (
              <span className="text-xs text-neutral-500">@{chirp.author.username}</span>
            ) : null}
            <span className="text-[11px] text-neutral-600">{time}</span>
          </div>
          {chirp.body ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">
              {chirp.body}
            </p>
          ) : null}
          {chirp.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chirp.imageUrl} alt="Chirp photo" className="mt-2 max-h-72 w-full rounded-2xl object-cover" />
          ) : null}
          <div className="mt-2 flex items-center gap-5 text-xs text-neutral-500">
            <button
              type="button"
              onClick={onLike}
              className={`transition hover:text-white ${chirp.likedByMe ? "font-semibold text-rose-400" : ""}`}
            >
              {chirp.likedByMe ? "♥" : "♡"} {chirp.likeCount}
            </button>
            <button type="button" onClick={() => void toggleComments()} className="transition hover:text-white">
              💬 {chirp.commentCount}
            </button>
            <span aria-label={`${chirp.viewCount} views`}>👁 {chirp.viewCount}</span>
            {chirp.mine ? (
              <button type="button" onClick={onDelete} className="transition hover:text-red-300">
                Delete
              </button>
            ) : null}
          </div>

          {commentsOpen ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-neutral-900 pt-3">
              {comments.length === 0 ? (
                <p className="text-xs text-neutral-500">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-semibold text-neutral-400">
                      {comment.author?.developer
                        ? "D"
                        : (comment.author?.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <p className="min-w-0 text-xs leading-relaxed text-neutral-300">
                      <span className="font-medium text-white">
                        {comment.author?.name ?? "A student"}
                      </span>{" "}
                      <span className="text-neutral-500">
                        {comment.author && !comment.author.developer
                          ? `@${comment.author.username}`
                          : ""}
                      </span>
                      <br />
                      {comment.body}
                    </p>
                  </div>
                ))
              )}
              <form onSubmit={(event) => void onComment(event)} className="flex gap-2">
                <input
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Add a comment…"
                  maxLength={500}
                  className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-black px-3 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={commentBusy || !commentDraft.trim()}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
                  style={{ backgroundColor: accent }}
                >
                  {commentBusy ? "…" : "Reply"}
                </button>
              </form>
              {commentError ? (
                <p className="text-xs text-red-400" role="alert">
                  {commentError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
