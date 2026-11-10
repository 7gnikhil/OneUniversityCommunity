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
  type MessageTickState,
} from "../actions";
import { clearTypingAction, setTypingAction } from "@/app/presence/actions";

// One DM conversation. Messages arrive from the server page; after that
// this view POLLS the fetch action every 5 seconds — the schema does
// not add messages to a realtime publication, so there is no realtime
// wiring here.
//
// The poll is INCREMENTAL and carries everything the view needs, so the
// request count never grows: only messages at/after the newest one
// already on screen come back, plus a compact tick-state array for my
// own messages (sent → delivered → viewed, WhatsApp-style, in yellow
// when viewed), plus the other party's presence (online / last seen /
// typing) — all of it already privacy-shaped server-side: if they hid
// their online status or read receipts, those fields simply read as
// "nothing to show" here.
//
// Read state: opening the chat (and every poll that surfaces new
// incoming messages) calls markMatchReadAction, which sets read_at on
// the other party's unread messages under the messages_mark_read RLS
// policy. That marking is unconditional — the peer's read-receipts
// switch only shapes what *I* get shown about my own messages.
//
// DM images upload to the PUBLIC chirp-images bucket under my own
// account folder (owner-folder storage policy already allows it; the
// schema lists chirp-images as a DM image bucket). Trade-off, honestly
// noted: a public bucket means DM photos are reachable by anyone who
// has the URL — unguessable path, but not access-controlled. A private
// DM bucket is a post-v1 hardening step.

const POLL_MS = 5_000;
const TYPING_THROTTLE_MS = 3_000;

function mergeMessages(prev: MessageRow[], incoming: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  prev.forEach((row) => byId.set(row.id, row));
  incoming.forEach((row) => byId.set(row.id, row));
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function applyTicks(prev: MessageRow[], ticks: MessageTickState[]): MessageRow[] {
  if (ticks.length === 0) return prev;
  const byId = new Map<string, MessageTickState>();
  ticks.forEach((tick) => byId.set(tick.id, tick));
  let changed = false;
  const next = prev.map((row) => {
    const tick = byId.get(row.id);
    if (!tick) return row;
    if (tick.delivered_at === row.delivered_at && tick.read_at === row.read_at) {
      return row;
    }
    changed = true;
    return { ...row, delivered_at: tick.delivered_at, read_at: tick.read_at };
  });
  return changed ? next : prev;
}

function formatLastSeen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "last seen just now";
  if (minutes < 60) return `last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "last seen yesterday";
  if (days < 7) return `last seen ${days}d ago`;
  return `last seen ${new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  })}`;
}

export default function ChatView({
  matchId,
  myAccountId,
  otherName,
  accentHex: accent,
  initialMessages,
  initialPeerOnline,
  initialPeerLastSeen,
}: {
  matchId: string;
  myAccountId: string;
  otherName: string;
  accentHex: string;
  initialMessages: MessageRow[];
  initialPeerOnline: boolean | null;
  initialPeerLastSeen: string | null;
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState<boolean | null>(initialPeerOnline);
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(initialPeerLastSeen);
  const [peerTyping, setPeerTyping] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastCountRef = useRef<number>(initialMessages.length);
  // Newest message timestamp on screen — the incremental poll's cursor.
  const newestRef = useRef<string | null>(
    initialMessages.length > 0
      ? initialMessages[initialMessages.length - 1].created_at
      : null,
  );
  const messagesRef = useRef<MessageRow[]>(initialMessages);
  const lastTypingSentRef = useRef<number>(0);
  const typingActiveRef = useRef<boolean>(false);

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

  // Keep the refs the poll loop reads in step with the rendered state.
  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length > 0) {
      newestRef.current = messages[messages.length - 1].created_at;
    }
  }, [messages]);

  // Poll: incremental messages + tick states + peer presence, one call.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async (): Promise<void> => {
        const result = await fetchMessagesAction(matchId, newestRef.current);
        setPeerOnline(result.peerOnline);
        setPeerLastSeen(result.peerLastSeen);
        setPeerTyping(result.peerTyping);
        if (result.ticks.length > 0) {
          setMessages((prev) => applyTicks(prev, result.ticks));
        }
        if (result.messages.length === 0) return;
        const known = new Set(messagesRef.current.map((row) => row.id));
        const hasNewIncoming = result.messages.some(
          (row) =>
            row.sender_id !== myAccountId &&
            row.read_at === null &&
            !known.has(row.id),
        );
        setMessages((prev) => mergeMessages(prev, result.messages));
        if (hasNewIncoming) void markRead();
      })();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [matchId, myAccountId, markRead]);

  // Keep the view pinned to the newest message as the list grows, and
  // when the typing bubble appears.
  useEffect(() => {
    if (messages.length > lastCountRef.current) scrollToBottom();
    lastCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (peerTyping) scrollToBottom();
  }, [peerTyping, scrollToBottom]);

  // Typing emit: throttled to one server call per 3s while the draft is
  // non-empty; cleared when the draft empties or the view unmounts. The
  // server stamps a 4s expiry on each call, so a missed clear can never
  // leave a stale "typing…" behind.
  const emitTyping = useCallback(
    (value: string): void => {
      if (!value.trim()) {
        if (typingActiveRef.current) {
          typingActiveRef.current = false;
          void clearTypingAction().catch(() => undefined);
        }
        return;
      }
      const now = Date.now();
      if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
      lastTypingSentRef.current = now;
      typingActiveRef.current = true;
      void setTypingAction("dm", matchId).catch(() => undefined);
    },
    [matchId],
  );

  useEffect(() => {
    return () => {
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void clearTypingAction().catch(() => undefined);
      }
    };
  }, []);

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
    typingActiveRef.current = false;
    void clearTypingAction().catch(() => undefined);
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const statusLine =
    peerOnline === true ? (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        online
      </span>
    ) : peerOnline === false && peerLastSeen ? (
      <span className="text-neutral-500">{formatLastSeen(peerLastSeen)}</span>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {statusLine ? (
        <p className="flex items-center gap-1.5 pt-2 text-xs">{statusLine}</p>
      ) : null}

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">
        {messages.length === 0 && !peerTyping ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            No messages yet — be the first to message {otherName}.
          </p>
        ) : (
          <>
            {messages.map((row) => (
              <Bubble key={row.id} row={row} mine={row.sender_id === myAccountId} accent={accent} />
            ))}
            {peerTyping ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-3xl bg-neutral-900 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
                  <span className="sr-only">{otherName} is typing…</span>
                </div>
              </div>
            ) : null}
          </>
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
          onChange={(event) => {
            setDraft(event.target.value);
            emitTyping(event.target.value);
          }}
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
        <p className="mt-1 flex items-center justify-end gap-1 text-right text-[10px] leading-none">
          <span className={mine ? "text-white/70" : "text-neutral-500"}>{time}</span>
          {mine ? <Ticks row={row} /> : null}
        </p>
      </div>
    </div>
  );
}

// WhatsApp-style ticks for my own messages, OneUco colours:
//   one grey tick  — sent (only created_at so far)
//   two grey ticks — delivered (their client has the message)
//   two YELLOW ticks — viewed (they opened the chat)
// If the other party turned read receipts off, the server strips
// read_at from what I receive, so the ticks simply never turn yellow.
function Ticks({ row }: { row: MessageRow }) {
  if (row.read_at) {
    return (
      <span className="font-semibold tracking-[-0.2em] text-amber-400" aria-label="Viewed">
        ✓✓
      </span>
    );
  }
  if (row.delivered_at) {
    return (
      <span className="font-semibold tracking-[-0.2em] text-white/70" aria-label="Delivered">
        ✓✓
      </span>
    );
  }
  return (
    <span className="font-semibold text-white/70" aria-label="Sent">
      ✓
    </span>
  );
}
