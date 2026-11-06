"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/social";
import { imageExtension, validateImageFile } from "@/lib/validation";
import {
  fetchMessagesAction,
  markMatchReadAction,
  sendMessageAction,
} from "../actions";

// One DM conversation. Messages arrive from the server page; after that
// this view POLLS the fetch action every 5 seconds — the schema does not
// add messages to a realtime publication, so there is no realtime wiring
// in this slice (TODO: supabase_realtime publication + channel subscribe
// would replace the poll without changing this component's data flow).
//
// Read state: opening the chat (and every poll that surfaces new incoming
// messages) calls markMatchReadAction, which sets read_at on the other
// party's unread messages under the messages_mark_read RLS policy.
//
// DM images upload to the PUBLIC chirp-images bucket under my own account
// folder (owner-folder storage policy already allows it; the schema lists
// chirp-images as a DM image bucket). Trade-off, honestly noted: a public
// bucket means DM photos are reachable by anyone who has the URL —
// unguessable path, but not access-controlled. A private DM bucket is a
// post-v1 hardening step.

const POLL_MS = 5_000;

function mergeMessages(prev: MessageRow[], incoming: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  prev.forEach((row) => byId.set(row.id, row));
  incoming.forEach((row) => byId.set(row.id, row));
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function ChatView({
  matchId,
  myAccountId,
  otherName,
  accentHex: accent,
  initialMessages,
}: {
  matchId: string;
  myAccountId: string;
  otherName: string;
  accentHex: string;
  initialMessages: MessageRow[];
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastCountRef = useRef<number>(initialMessages.length);

  const scrollToBottom = useCallback((): void => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Mark incoming messages read + reflect it locally.
  const markRead = useCallback(async (): Promise<void> => {
    await markMatchReadAction(matchId);
    setMessages((prev) =>
      prev.map((row) =>
        row.sender_id !== myAccountId && row.read_at === null
          ? { ...row, read_at: new Date().toISOString() }
          : row,
      ),
    );
  }, [matchId, myAccountId]);

  // On open: read everything already here, and land at the latest message.
  useEffect(() => {
    void markRead();
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for new messages.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async (): Promise<void> => {
        const fresh = await fetchMessagesAction(matchId);
        if (fresh.length === 0) return;
        const hasNewIncoming = fresh.some(
          (row) =>
            row.sender_id !== myAccountId &&
            row.read_at === null &&
            !messages.some((existing) => existing.id === row.id),
        );
        setMessages((prev) => mergeMessages(prev, fresh));
        if (hasNewIncoming) void markRead();
      })();
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // `messages` is read inside the poll only to detect new incoming rows;
    // the interval identity stays stable across renders on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, myAccountId]);

  // Keep the view pinned to the newest message as the list grows.
  useEffect(() => {
    if (messages.length > lastCountRef.current) scrollToBottom();
    lastCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

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
      const supabase = createClient();
      const path = `${myAccountId}/dm-${matchId}-${Date.now()}.${imageExtension(chosen)}`;
      const { error: uploadError } = await supabase.storage
        .from("chirp-images")
        .upload(path, chosen, { contentType: chosen.type, upsert: false });
      if (uploadError) {
        setSending(false);
        setError("Photo upload failed — check your connection and try again.");
        return;
      }
      imageUrl = supabase.storage.from("chirp-images").getPublicUrl(path).data.publicUrl;
    }

    const result = await sendMessageAction(matchId, body, imageUrl);
    setSending(false);
    if (result.error || !result.message) {
      setError(result.error ?? "That message didn't send — please try again.");
      return;
    }
    const sent: MessageRow = result.message;
    setMessages((prev) => mergeMessages(prev, [sent]));
    setDraft("");
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            No messages yet — be the first to message {otherName}.
          </p>
        ) : (
          messages.map((row) => (
            <Bubble key={row.id} row={row} mine={row.sender_id === myAccountId} accent={accent} />
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

      <form onSubmit={(event) => void onSend(event)} className="flex items-end gap-2 pb-2">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-lg text-neutral-300 transition hover:bg-neutral-900"
        >
          +
        </button>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={1}
          maxLength={2000}
          placeholder={`Message ${otherName}…`}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && !imageFile)}
          className="h-11 shrink-0 rounded-full px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function Bubble({
  row,
  mine,
  accent,
}: {
  row: MessageRow;
  mine: boolean;
  accent: string;
}) {
  const time = new Date(row.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed ${
          mine ? "text-white" : "bg-neutral-900 text-neutral-100"
        }`}
        style={mine ? { backgroundColor: accent } : undefined}
      >
        {row.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.image_url}
            alt="Shared photo"
            className="mb-1 max-h-64 w-full rounded-2xl object-cover"
          />
        ) : null}
        {row.body ? <p className="whitespace-pre-wrap break-words">{row.body}</p> : null}
        <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/70" : "text-neutral-500"}`}>
          {time}
          {mine && row.read_at ? " · Read" : ""}
        </p>
      </div>
    </div>
  );
}
