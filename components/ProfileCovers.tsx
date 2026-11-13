"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRadio } from "@/components/RadioPlayer";
import {
  createCoverAction,
  deleteCoverAction,
  toggleCoverLikeAction,
} from "@/app/profile/covers-actions";
import { createChirpAction } from "@/app/chirp/actions";
import type { CoverView } from "@/lib/covers";

// Profile covers (2026-11-14, Music Mitra merge): the owner's
// vocal/karaoke recordings on their profile. Visitors get the
// list + an inline player + ♥ likes; the owner additionally gets
// the studio panel — record straight from the mic (sing over the
// song playing in Music Mitra) or upload an audio file. Audio
// goes browser → `covers` storage bucket (own folder); rows are
// written by app/profile/covers-actions. Covers arrive as
// initialCovers=null until migration 0017 is applied — the owner
// then sees a "nearly ready" note and visitors see nothing, so
// profiles never break before setup.

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ProfileCovers({
  initialCovers,
  canManage,
  myAccountId,
  profileName,
}: {
  initialCovers: CoverView[] | null;
  canManage: boolean;
  myAccountId: string | null;
  profileName: string;
}) {
  const [covers, setCovers] = useState<CoverView[]>(initialCovers ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ t: number; dur: number }>({
    t: 0,
    dur: 0,
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function flash(message: string): void {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 2800);
  }

  function togglePlay(cover: CoverView): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeId === cover.id) {
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
      return;
    }
    setActiveId(cover.id);
    audio.src = cover.audioUrl;
    void audio.play().catch(() => undefined);
  }

  async function toggleLike(cover: CoverView): Promise<void> {
    const result = await toggleCoverLikeAction(cover.id);
    if (result.error) {
      flash(result.error);
      return;
    }
    setCovers((prev) =>
      prev.map((item) =>
        item.id === cover.id
          ? { ...item, likedByMe: result.liked, likeCount: result.count }
          : item,
      ),
    );
  }

  async function removeCover(cover: CoverView): Promise<void> {
    const result = await deleteCoverAction(cover.id);
    if (result.error) {
      flash(result.error);
      return;
    }
    setCovers((prev) => prev.filter((item) => item.id !== cover.id));
    if (activeId === cover.id) {
      audioRef.current?.pause();
      setActiveId(null);
    }
    flash("Cover deleted");
  }

  async function chirpCover(cover: CoverView): Promise<void> {
    const songBit = cover.songTitle
      ? ` of "${cover.songTitle}"${cover.songArtist ? ` by ${cover.songArtist}` : ""}`
      : "";
    const body = cover.mine
      ? `🎤 I just sang a cover${songBit} — "${cover.title}"\nListen on my profile and tell me how it sounds 🎧`
      : `🎤 ${profileName} sang a cover${songBit} — "${cover.title}"\nListen on their profile 🎧`;
    const result = await createChirpAction(body, null);
    flash(result.error ? result.error : "Posted to Chirp ✔");
  }

  if (initialCovers === null) {
    if (!canManage) return null;
    return (
      <section className="flex flex-col gap-2 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          🎤 My covers
        </h2>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your stage is almost ready — covers switch on as soon as
          the one-time setup finishes. Then you can record your
          karaoke right here and the whole campus can listen.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          🎤 {canManage ? "My covers" : "Covers"}
        </h2>
        <span className="text-xs text-neutral-500">
          {covers.length} {covers.length === 1 ? "song" : "songs"}
        </span>
      </div>

      {feedback ? (
        <p className="text-xs font-medium text-emerald-400" role="status">
          {feedback}
        </p>
      ) : null}

      {covers.length === 0 ? (
        <p className="rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-relaxed text-neutral-400">
          {canManage
            ? "No covers yet. Sing a karaoke in Music Mitra, then record it here — anyone visiting your profile can listen and ♥ it."
            : `${profileName} hasn't posted a cover yet.`}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-900 rounded-3xl border border-neutral-800 bg-neutral-950 px-4">
          {covers.map((cover) => {
            const isActive = activeId === cover.id;
            return (
              <li key={cover.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => togglePlay(cover)}
                  aria-label={`${isActive && isPlaying ? "Pause" : "Play"} ${cover.title}`}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm transition ${
                    isActive
                      ? "bg-amber-500 text-black"
                      : "bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {isActive && isPlaying ? "❚❚" : "▶"}
                </button>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {cover.title}
                  </span>
                  <span className="truncate text-xs text-neutral-500">
                    {cover.songTitle
                      ? `Cover of ${cover.songTitle}${cover.songArtist ? ` · ${cover.songArtist}` : ""}`
                      : "Original recording"}
                    {isActive
                      ? ` · ${formatTime(progress.t)} / ${formatTime(progress.dur || cover.durationSeconds || 0)}`
                      : cover.durationSeconds
                        ? ` · ${formatTime(cover.durationSeconds)}`
                        : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void toggleLike(cover)}
                  aria-label={cover.likedByMe ? "Unlike cover" : "Like cover"}
                  className={`shrink-0 px-1 text-sm transition ${
                    cover.likedByMe
                      ? "text-rose-500"
                      : "text-neutral-500 hover:text-rose-400"
                  }`}
                >
                  {cover.likedByMe ? "♥" : "♡"} {cover.likeCount}
                </button>
                <button
                  type="button"
                  onClick={() => void chirpCover(cover)}
                  aria-label="Post this cover to Chirp"
                  className="shrink-0 p-1 text-sm text-neutral-400 transition hover:text-white"
                >
                  🐦
                </button>
                {cover.mine ? (
                  <button
                    type="button"
                    onClick={() => void removeCover(cover)}
                    aria-label="Delete cover"
                    className="shrink-0 p-1 text-sm text-neutral-500 transition hover:text-red-400"
                  >
                    ✕
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) =>
          setProgress({
            t: event.currentTarget.currentTime,
            dur: event.currentTarget.duration || 0,
          })
        }
      />

      {canManage && myAccountId ? (
        <CoverStudio
          myAccountId={myAccountId}
          onPublished={(cover) => {
            setCovers((prev) => [cover, ...prev]);
            flash("Your cover is live on your profile 🎉");
          }}
          onError={flash}
        />
      ) : null}
    </section>
  );
}

// The owner's studio: record from the mic or upload a file, name
// it, publish. While recording, the Music Mitra player keeps
// playing the backing song (best with earphones — the mic hears
// your voice, not the speakers).
function CoverStudio({
  myAccountId,
  onPublished,
  onError,
}: {
  myAccountId: string;
  onPublished: (cover: CoverView) => void;
  onError: (message: string) => void;
}) {
  const radio = useRadio();
  const [open, setOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [songTitle, setSongTitle] = useState<string>("");
  const [songArtist, setSongArtist] = useState<string>("");
  const [recording, setRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prefillFromPlayer(): void {
    if (radio.current) {
      setSongTitle(radio.current.title);
      setSongArtist(radio.current.artists);
      if (!title) setTitle(`${radio.current.title} — my cover`);
    }
  }

  async function startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setPendingBlob(blob);
        setPendingFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      prefillFromPlayer();
      recorder.start();
      startedAtRef.current = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setRecordSeconds(
          Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
      }, 500);
    } catch {
      onError("Mic access was blocked — allow the microphone to record.");
    }
  }

  function stopRecording(): void {
    recorderRef.current?.stop();
  }

  function pickFile(file: File | null): void {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      onError("That isn't an audio file.");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      onError("That file is over 12 MB — trim it and try again.");
      return;
    }
    setPendingFile(file);
    setPendingBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function publish(): Promise<void> {
    const blob = pendingFile ?? pendingBlob;
    if (!blob) {
      onError("Record or upload your singing first.");
      return;
    }
    if (!title.trim()) {
      onError("Give your cover a title first.");
      return;
    }
    setPublishing(true);
    try {
      const supabase = createClient();
      const ext = pendingFile
        ? (pendingFile.name.split(".").pop() ?? "mp3").toLowerCase()
        : pendingBlob?.type.includes("mp4")
          ? "m4a"
          : pendingBlob?.type.includes("ogg")
            ? "ogg"
            : "webm";
      const path = `${myAccountId}/cover-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(path, blob, {
          contentType: pendingFile?.type ?? pendingBlob?.type ?? "audio/webm",
        });
      if (uploadError) throw uploadError;
      const audioUrl = supabase.storage
        .from("covers")
        .getPublicUrl(path).data.publicUrl;
      const durationSeconds =
        pendingBlob && !pendingFile
          ? recordSeconds || null
          : null;
      const result = await createCoverAction({
        title,
        songTitle: songTitle || null,
        songArtist: songArtist || null,
        audioUrl,
        durationSeconds,
      });
      if (result.error) throw new Error(result.error);
      onPublished({
        id: `local-${Date.now()}`,
        title: title.trim(),
        songTitle: songTitle || null,
        songArtist: songArtist || null,
        audioUrl,
        durationSeconds,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        likedByMe: false,
        mine: true,
      });
      setPendingBlob(null);
      setPendingFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setTitle("");
      setSongTitle("");
      setSongArtist("");
      setOpen(false);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Couldn't publish that — try again.",
      );
    } finally {
      setPublishing(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          prefillFromPlayer();
        }}
        className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400"
      >
        🎤 Add a cover
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-amber-500/25 bg-neutral-950 p-4">
      <p className="text-sm font-semibold text-white">Record your cover</p>
      <p className="text-xs leading-relaxed text-neutral-400">
        Tip: play the song in Music Mitra, wear earphones, and sing —
        the mic records your voice. Or upload a recording you already
        have.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
          >
            ⏹ Stop · {formatTime(recordSeconds)}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200"
          >
            🎙 Record
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
        >
          ⬆ Upload audio
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        {pendingFile ? (
          <span className="text-xs text-neutral-400">{pendingFile.name}</span>
        ) : null}
      </div>

      {previewUrl ? (
        <audio src={previewUrl} controls className="w-full" preload="metadata" />
      ) : null}

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Cover title — e.g. Tum Hi Ho (my version)"
        maxLength={120}
        className="rounded-2xl border border-neutral-800 bg-black px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none"
      />
      <div className="flex gap-2">
        <input
          value={songTitle}
          onChange={(event) => setSongTitle(event.target.value)}
          placeholder="Original song (optional)"
          maxLength={160}
          className="min-w-0 flex-1 rounded-2xl border border-neutral-800 bg-black px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none"
        />
        <input
          value={songArtist}
          onChange={(event) => setSongArtist(event.target.value)}
          placeholder="Artist (optional)"
          maxLength={160}
          className="min-w-0 flex-1 rounded-2xl border border-neutral-800 bg-black px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={publishing || recording}
          onClick={() => void publish()}
          className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          {publishing ? "Publishing…" : "Publish cover"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-4 py-2 text-sm text-neutral-400 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
