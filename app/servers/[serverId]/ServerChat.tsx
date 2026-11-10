"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { FlairRow, ServerMessageView } from "@/lib/servers";
import { imageExtension, validateImageFile } from "@/lib/validation";
import {
  deleteServerMessageAction,
  editServerMessageAction,
  fetchServerMessagesAction,
  markServerReadAction,
  sendServerMessageAction,
  setMessageFlairAction,
  togglePinMessageAction,
} from "../actions";
import { clearTypingAction, setTypingAction } from "@/app/presence/actions";

// Standard (Discord-style) server chat: coloured sender names, flair
// chips, staff flair assignment. Polls every 5 seconds like the DM chat
// (no realtime publication in the schema). Images upload to the public
// server-images bucket under my account folder.
//
// The poll also carries the channel's typing names ("X is typing…"
// above the composer) — same request, no extra traffic. My own typing
// is reported through the presence actions, throttled like the DM
// composer's, and members who hid their online status never appear in
// the typing line (server-shaped in the fetch action).

const POLL_MS = 5_000;
const TYPING_THROTTLE_MS = 3_000;

function formatTyping(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are typing…`;
}

function mergeMessages(
  prev: ServerMessageView[],
  incoming: ServerMessageView[],
): ServerMessageView[] {
  const byId = new Map<string, ServerMessageView>();
  prev.forEach((row) => byId.set(row.id, row));
  incoming.forEach((row) => byId.set(row.id, row));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ServerChat({
  serverId,
  channelId,
  initialMessages,
  flairs,
  reqToAdminFlairId,
  myAccountId,
  accentHex: accent,
  canPost,
  isStaff,
  isAppAdmin,
}: {
  serverId: string;
  channelId: string | null;
  initialMessages: ServerMessageView[];
  flairs: FlairRow[];
  reqToAdminFlairId: string | null;
  myAccountId: string;
  accentHex: string;
  canPost: boolean;
  isStaff: boolean;
  isAppAdmin: boolean;
}) {
  const [messages, setMessages] = useState<ServerMessageView[]>(initialMessages);
  const [filterFlairId, setFilterFlairId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [typingNames, setTypingNames] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastCountRef = useRef<number>(initialMessages.length);
  const lastTypingSentRef = useRef<number>(0);
  const typingActiveRef = useRef<boolean>(false);

  const flairById = new Map<string, FlairRow>();
  flairs.forEach((flair) => flairById.set(flair.id, flair));

  const refresh = useCallback(async (): Promise<void> => {
    const result = await fetchServerMessagesAction(serverId, channelId);
    if (result.messages.length > 0) {
      setMessages((prev) => mergeMessages(prev, result.messages));
    }
    setTypingNames(result.typingNames);
    void markServerReadAction(serverId);
  }, [serverId, channelId]);

  // Typing emit — same contract as the DM composer: throttled sets
  // while the draft is non-empty, an explicit clear when it empties,
  // and a 4s server-side expiry as the safety net.
  const emitTyping = useCallback(
    (value: string): void => {
      if (!channelId || !canPost) return;
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
      void setTypingAction("server", channelId).catch(() => undefined);
    },
    [channelId, canPost],
  );

  useEffect(() => {
    return () => {
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void clearTypingAction().catch(() => undefined);
      }
    };
  }, []);

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
    if (sending || !canPost) return;
    const body = draft.trim();
    if (!body && !imageFile) return;
    setSending(true);
    setError(null);

    let imageUrl: string | null = null;
    if (imageFile) {
      const chosen: File = imageFile;
      const supabase = createClient();
      const path = `${myAccountId}/msg-${serverId}-${Date.now()}.${imageExtension(chosen)}`;
      const { error: uploadError } = await supabase.storage
        .from("server-images")
        .upload(path, chosen, { contentType: chosen.type, upsert: false });
      if (uploadError) {
        setSending(false);
        setError("Photo upload failed — check your connection and try again.");
        return;
      }
      imageUrl = supabase.storage.from("server-images").getPublicUrl(path).data.publicUrl;
    }

    const result = await sendServerMessageAction(serverId, channelId, body, imageUrl);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    typingActiveRef.current = false;
    void clearTypingAction().catch(() => undefined);
    pickImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void refresh();
  }

  async function onSaveEdit(messageId: string): Promise<void> {
    const result = await editServerMessageAction(messageId, editDraft);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
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

  async function onFlair(messageId: string, flairId: string | null): Promise<void> {
    const result = await setMessageFlairAction(messageId, flairId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void refresh();
  }

  async function onPin(messageId: string): Promise<void> {
    const result = await togglePinMessageAction(messageId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void refresh();
  }

  const visible = filterFlairId
    ? messages.filter((row) => row.flairId === filterFlairId)
    : messages;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {flairs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pb-2">
          <FilterChip
            label="All"
            active={filterFlairId === null}
            onClick={() => setFilterFlairId(null)}
          />
          {flairs.map((flair) => (
            <FilterChip
              key={flair.id}
              label={flair.name}
              color={flair.color}
              active={filterFlairId === flair.id}
              onClick={() => setFilterFlairId(flair.id)}
            />
          ))}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            {filterFlairId ? "No messages with that flair yet." : "No messages yet — start the conversation."}
          </p>
        ) : (
          visible.map((row) => (
            <MessageItem
              key={row.id}
              row={row}
              flair={row.flairId ? (flairById.get(row.flairId) ?? null) : null}
              flairs={flairs}
              accent={accent}
              isStaff={isStaff}
              isAppAdmin={isAppAdmin}
              reqToAdminFlairId={reqToAdminFlairId}
              editing={editingId === row.id}
              editDraft={editDraft}
              onEditDraftChange={setEditDraft}
              onStartEdit={() => {
                setEditingId(row.id);
                setEditDraft(row.body ?? "");
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => void onSaveEdit(row.id)}
              onDelete={() => void onDelete(row.id)}
              onFlair={(flairId) => void onFlair(row.id, flairId)}
              onPin={() => void onPin(row.id)}
            />
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

      {formatTyping(typingNames) ? (
        <p className="pb-1.5 text-xs text-neutral-400" role="status">
          {formatTyping(typingNames)}
        </p>
      ) : null}

      {canPost ? (
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
            placeholder="Message this server…"
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
      ) : (
        <p className="pb-2 text-center text-sm text-neutral-500">
          Join this server to post.
        </p>
      )}
    </div>
  );
}

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-white bg-white text-black"
          : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
      }`}
    >
      {color ? (
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {label}
    </button>
  );
}

function MessageItem({
  row,
  flair,
  flairs,
  accent,
  isStaff,
  isAppAdmin,
  reqToAdminFlairId,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onFlair,
  onPin,
}: {
  row: ServerMessageView;
  flair: FlairRow | null;
  flairs: FlairRow[];
  accent: string;
  isStaff: boolean;
  isAppAdmin: boolean;
  reqToAdminFlairId: string | null;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onFlair: (flairId: string | null) => void;
  onPin: () => void;
}) {
  const time = new Date(row.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const canEdit = row.mine || isAppAdmin;
  const canDelete = row.mine || isAppAdmin;
  return (
    <div className="flex gap-3">
      {row.author?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.author.photoUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-400">
          {row.author?.developer
            ? "D"
            : (row.author?.name ?? "?").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {row.author?.developer ? (
            // Masked developer projection: plain name, no profile link
            // (developer anonymity rule).
            <span
              className="text-sm font-medium"
              style={{ color: accent === "#171717" ? "#fff" : accent }}
            >
              {row.author.name}
            </span>
          ) : row.author ? (
            <Link
              href={`/profile/${row.author.username}`}
              className="text-sm font-medium transition hover:underline"
              style={{ color: accent === "#171717" ? "#fff" : accent }}
            >
              {row.author.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-neutral-400">A student</span>
          )}
          <span className="text-[11px] text-neutral-600">{time}</span>
          {flair ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: flair.color }}
            >
              {flair.name}
            </span>
          ) : null}
          {row.isPinned ? <span className="text-[11px] text-amber-300">📌 Pinned</span> : null}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <textarea
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
            />
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={onSaveEdit}
                className="rounded-full bg-white px-3 py-1.5 font-medium text-black"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt="Shared photo"
                className="mt-1 max-h-64 rounded-2xl object-cover"
              />
            ) : null}
            {row.body ? (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">
                {row.body}
              </p>
            ) : null}
          </>
        )}

        {!editing ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
            {canEdit ? (
              <button type="button" onClick={onStartEdit} className="transition hover:text-white">
                Edit
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" onClick={onDelete} className="transition hover:text-red-300">
                Delete
              </button>
            ) : null}
            {isStaff ? (
              <button type="button" onClick={onPin} className="transition hover:text-white">
                {row.isPinned ? "Unpin" : "Pin"}
              </button>
            ) : null}
            {row.mine && reqToAdminFlairId && row.flairId !== reqToAdminFlairId ? (
              <button
                type="button"
                onClick={() => onFlair(reqToAdminFlairId)}
                className="transition hover:text-white"
              >
                Flag for admin
              </button>
            ) : null}
            {isStaff ? (
              <select
                value={row.flairId ?? ""}
                onChange={(event) =>
                  onFlair(event.target.value === "" ? null : event.target.value)
                }
                className="rounded-full border border-neutral-800 bg-black px-2 py-0.5 text-[11px] text-neutral-400 focus:outline-none"
                aria-label="Set flair"
              >
                <option value="">No flair</option>
                {flairs.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
