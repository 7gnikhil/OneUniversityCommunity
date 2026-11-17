"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { FlairRow, JwalamMessageView } from "@/lib/servers";
import { validateImageFile } from "@/lib/validation";
import { describeUploadError, prepareImageForUpload } from "@/lib/images";
import {
  deleteServerMessageAction,
  fetchJwalamMessagesAction,
  markServerReadAction,
  sendServerMessageAction,
  togglePinMessageAction,
} from "../actions";
// Maya Jwalam — Telegram-style channel view. The messages arriving here
// are ALREADY identity-stripped by the server projection (lib/servers.ts
// listJwalamMessages): anonymous posts carry no name, username, ID, photo
// or branch, and this component could not render them if it wanted to.
// Only two identity shapes exist: "Admin" official posts (badge only),
// and — for the owner/admin moderation view — identified posts marked
// as moderation. (The "show me your profile" reveal flow was removed
// on 2026-11-17: profiles are public anyway; Jwalam stays anonymous.)

const POLL_MS = 5_000;

function mergeMessages(
  prev: JwalamMessageView[],
  incoming: JwalamMessageView[],
): JwalamMessageView[] {
  const byId = new Map<string, JwalamMessageView>();
  prev.forEach((row) => byId.set(row.id, row));
  incoming.forEach((row) => byId.set(row.id, row));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

export default function JwalamChat({
  serverId,
  serverName,
  serverIconUrl,
  memberCount,
  initialMessages,
  pinned,
  flairs,
  myAccountId,
  accentHex: accent,
  isAppAdmin,
}: {
  serverId: string;
  serverName: string;
  serverIconUrl: string | null;
  memberCount: number;
  initialMessages: JwalamMessageView[];
  pinned: JwalamMessageView | null;
  flairs: FlairRow[];
  myAccountId: string;
  accentHex: string;
  isAppAdmin: boolean;
}) {
  const [messages, setMessages] = useState<JwalamMessageView[]>(initialMessages);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastCountRef = useRef<number>(initialMessages.length);

  const flairById = useMemo(() => {
    const map = new Map<string, FlairRow>();
    flairs.forEach((flair) => map.set(flair.id, flair));
    return map;
  }, [flairs]);

  const refresh = useCallback(async (): Promise<void> => {
    const fresh = await fetchJwalamMessagesAction(serverId);
    if (fresh.length > 0) setMessages((prev) => mergeMessages(prev, fresh));
    void markServerReadAction(serverId);
  }, [serverId]);

  useEffect(() => {
    void markServerReadAction(serverId);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [serverId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = messages.length;
  }, [messages]);

  const query = search.trim().toLowerCase();
  const visible = query
    ? messages.filter((row) => (row.body ?? "").toLowerCase().includes(query))
    : messages;

  // Group the visible stream under centred date separators.
  const groups: Array<{ key: string; label: string; rows: JwalamMessageView[] }> = [];
  visible.forEach((row) => {
    const key = dayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: dateLabel(row.createdAt), rows: [row] });
  });

  function scrollToMessage(id: string): void {
    const el = document.getElementById(`jw-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setNotice("That pinned post is older than the loaded history.");
    }
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

  async function onSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sending) return;
    const body = draft.trim();
    if (!body && !imageFile) return;
    setSending(true);
    setError(null);

    let imageUrl: string | null = null;
    if (imageFile) {
      const chosen: File = imageFile;
      // Shrink before upload (lib/images) — same fragile raw-upload
      // pattern as Chirp's; preparation never blocks a send.
      const prepared = await prepareImageForUpload(chosen);
      if ("error" in prepared) {
        setSending(false);
        setError(prepared.error);
        return;
      }
      const supabase = createClient();
      const path = `${myAccountId}/msg-${serverId}-${Date.now()}.${prepared.image.extension}`;
      const { error: uploadError } = await supabase.storage
        .from("server-images")
        .upload(path, prepared.image.blob, {
          contentType: prepared.image.contentType,
          upsert: false,
        });
      if (uploadError) {
        console.error("[jwalam] photo upload failed", uploadError);
        setSending(false);
        setError(describeUploadError(uploadError));
        return;
      }
      imageUrl = supabase.storage.from("server-images").getPublicUrl(path).data.publicUrl;
    }

    const result = await sendServerMessageAction(serverId, null, body, imageUrl);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void refresh();
  }

  async function onDelete(messageId: string): Promise<void> {
    const result = await deleteServerMessageAction(messageId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessages((prev) => prev.filter((row) => row.id !== messageId));
  }

  async function onPin(messageId: string): Promise<void> {
    const result = await togglePinMessageAction(messageId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Telegram-style header */}
      <header className="flex items-center gap-3 border-b border-neutral-900 pb-3">
        <Link href="/servers" className="text-sm text-neutral-400 transition hover:text-white">
          ←
        </Link>
        {serverIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={serverIconUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-base font-semibold text-amber-300">
            {serverName.charAt(0).toUpperCase() || "M"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold">
            {serverName}
            <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
              Main
            </span>
          </p>
          <p className="text-xs text-neutral-500">
            {memberCount} member{memberCount === 1 ? "" : "s"} · anonymous
          </p>
        </div>
        <button
          type="button"
          aria-label="Search messages"
          onClick={() => setSearchOpen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 text-sm text-neutral-300 transition hover:bg-neutral-900"
        >
          🔍
        </button>
      </header>

      {searchOpen ? (
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search loaded messages…"
          className="mt-3 w-full rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
      ) : null}

      <p className="pt-3 text-center text-[11px] text-neutral-500">
        You&apos;re anonymous here — nobody can see your name, @username or profile.
      </p>

      {/* Pinned bar */}
      {pinned ? (
        <button
          type="button"
          onClick={() => scrollToMessage(pinned.id)}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border-l-2 border-amber-400 bg-neutral-950 px-3 py-2 text-left transition hover:bg-neutral-900"
        >
          <span className="text-xs text-amber-300">📌</span>
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-amber-300">Pinned message</span>
            <span className="block truncate text-xs text-neutral-400">
              {pinned.body ?? "Photo"}
            </span>
          </span>
        </button>
      ) : null}

      {notice ? (
        <p className="pt-2 text-center text-xs text-neutral-400">{notice}</p>
      ) : null}

      {/* Message stream */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto py-3">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            {query ? "No loaded messages match that search." : "Nothing here yet — say the first hello, anonymously."}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <div className="flex justify-center py-1">
                <span className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                  {group.label}
                </span>
              </div>
              {group.rows.map((row) => (
                <JwalamBubble
                  key={row.id}
                  row={row}
                  flair={row.flairId ? (flairById.get(row.flairId) ?? null) : null}
                  accent={accent}
                  isAppAdmin={isAppAdmin}
                  onDelete={() => void onDelete(row.id)}
                  onPin={() => void onPin(row.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {imagePreview ? (
        <div className="relative mb-2 w-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="Attachment preview" className="w-28 rounded-xl object-cover" />
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

      {error ? (
        <p className="pb-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* Discord composer (2026-11-17): rounded bar, circled +
          attach, blurple send — same idiom as the Tea channels. */}
      <form
        onSubmit={(event) => void onSend(event)}
        className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-800/70 px-3 py-1.5"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => pickImage(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          aria-label="Attach a photo"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-400 text-base font-bold leading-none text-neutral-900 transition hover:bg-white"
        >
          +
        </button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Message #maya-jwalam anonymously…"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && !imageFile)}
          className="shrink-0 rounded-md bg-[#5865F2] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function JwalamBubble({
  row,
  flair,
  accent,
  isAppAdmin,
  onDelete,
  onPin,
}: {
  row: JwalamMessageView;
  flair: FlairRow | null;
  accent: string;
  isAppAdmin: boolean;
  onDelete: () => void;
  onPin: () => void;
}) {
  const time = new Date(row.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const author = row.author;
  const mine = author.kind === "mine";

  // Telegram-style copy (2026-11-17): any text post can be copied
  // straight from the bubble — quotes, confessions, announcements.
  const [copied, setCopied] = useState<boolean>(false);
  async function onCopy(): Promise<void> {
    if (!row.body) return;
    try {
      await navigator.clipboard.writeText(row.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions) — nothing to show.
    }
  }

  // Discord row layout (2026-11-17): flat full-width rows —
  // avatar left, name + time header, body under. ANONYMITY IS
  // UNCHANGED: no profile links here ever (the tap-to-profile
  // rule's one exception), anonymous stays 👤 "Anonymous", the
  // real photo/name appears ONLY in the admin moderation shape.
  // No grouping either — anonymous neighbours can't be told apart,
  // so every post carries its own header.
  return (
    <div
      id={`jw-${row.id}`}
      className="-mx-2 flex gap-3 rounded px-2 py-0.5 transition hover:bg-white/[0.03]"
    >
      {author.kind === "moderation" ? (
        author.profile?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.profile.photoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-400">
            {(author.profile?.name ?? "?").charAt(0).toUpperCase()}
          </span>
        )
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-base text-neutral-500">
          {author.kind === "admin-post" ? "🛡" : "👤"}
        </span>
      )}

      <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-neutral-100">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {author.kind === "admin-post" ? (
            <span className="text-[15px] font-semibold text-amber-300">Admin</span>
          ) : author.kind === "moderation" ? (
            <span className="text-[15px] font-semibold text-red-300">
              {author.profile ? `${author.profile.name} · @${author.profile.username}` : "Unknown poster"}
              <span className="ml-1 text-xs font-normal text-red-300/70">(moderation view)</span>
            </span>
          ) : mine ? (
            <span className="text-[15px] font-semibold" style={{ color: accent }}>
              You
            </span>
          ) : (
            <span className="text-[15px] font-semibold text-neutral-300">Anonymous</span>
          )}
          <span className="text-[11px] text-neutral-500">{time}</span>
          {row.isPinned ? <span className="text-[11px] text-amber-300">📌 Pinned</span> : null}
          <span className="text-[11px] text-neutral-500" aria-label={`${row.viewCount} views`}>
            👁 {row.viewCount}
          </span>
        </div>

        {flair ? (
          <span
            className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: flair.color }}
          >
            {flair.name}
          </span>
        ) : null}

        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt="Shared photo"
            className="mb-1 mt-1 max-h-64 rounded-2xl object-cover"
          />
        ) : null}
        {row.body ? <p className="whitespace-pre-wrap break-words">{row.body}</p> : null}

        {row.body || mine || isAppAdmin ? (
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
            {row.body ? (
              <button type="button" onClick={() => void onCopy()} className="transition hover:text-white">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            ) : null}
            {mine || isAppAdmin ? (
              <button type="button" onClick={onDelete} className="transition hover:text-red-300">
                Delete
              </button>
            ) : null}
            {isAppAdmin ? (
              <button type="button" onClick={onPin} className="transition hover:text-white">
                {row.isPinned ? "Unpin" : "Pin"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
