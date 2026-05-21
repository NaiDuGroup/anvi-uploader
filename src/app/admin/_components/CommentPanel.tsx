"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, Pencil, Trash2, Check } from "lucide-react";

interface CommentMessage {
  id: string;
  text: string;
  createdAt: string;
  /** ISO string set by PATCH; `null` for never-edited messages. */
  editedAt: string | null;
  userName: string;
  userRole: string;
  isOwn: boolean;
}

/**
 * Tiny inline edit/delete action stack shown next to every comment bubble.
 * Always visible (no hover-only state) so it works on touch devices like
 * the workshop tablet, where `:hover` never fires.
 */
function CommentActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onEdit}
        title={editLabel}
        aria-label={editLabel}
        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
        className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function CommentPanel({
  orderId,
  orderNumber,
  t,
  onClose,
  initialComments,
}: {
  orderId: string;
  orderNumber: number;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  initialComments?: CommentMessage[];
}) {
  const [messages, setMessages] = useState<CommentMessage[]>(initialComments ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Inline edit/delete state. Only one message can be in either mode at a
  // time, so a single id pair plus per-action busy flag is enough.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(initialComments?.length ?? 0);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/comments`);
      if (res.ok) {
        const data: CommentMessage[] = await res.json();
        setMessages(data);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [orderId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    // Pause refresh while the user is mid-edit so we don't clobber their
    // unsaved draft with a server snapshot. Same goes for the destructive
    // confirm prompt — the row is about to disappear either way.
    if (editingId || confirmDeleteId) return;
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [fetchComments, editingId, confirmDeleteId]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      const el = editInputRef.current;
      el.focus();
      // Caret to end so editing feels like continuing the original message.
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const msg: CommentMessage = await res.json();
        setMessages((prev) => [...prev, msg]);
        setText("");
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const beginEdit = (msg: CommentMessage) => {
    setConfirmDeleteId(null);
    setEditingId(msg.id);
    setEditText(msg.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed || savingEdit) return;
    const original = messages.find((m) => m.id === editingId);
    if (original && original.text === trimmed) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/comments/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const updated: CommentMessage = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        cancelEdit();
      }
    } catch {
      /* ignore */
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/comments/${confirmDeleteId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== confirmDeleteId));
        setConfirmDeleteId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const roleLabel = (role: string) =>
    role === "workshop"
      ? t.admin.roleWorkshop
      : role === "superadmin"
        ? t.admin.roleSuperAdmin
        : t.admin.roleAdmin;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">
              {t.admin.comments} — #{String(orderNumber).padStart(4, "0")}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">{t.admin.noComments}</p>
          )}
          {messages.map((msg) => {
            const isEditing = editingId === msg.id;
            const isConfirmingDelete = confirmDeleteId === msg.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.isOwn ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-medium text-gray-600">{msg.userName}</span>
                  <Badge
                    variant={msg.userRole === "workshop" ? "warning" : "secondary"}
                    className="text-[9px] px-1 py-0"
                  >
                    {roleLabel(msg.userRole)}
                  </Badge>
                </div>

                {isEditing ? (
                  <div className="w-[85%] flex flex-col gap-1.5">
                    <textarea
                      ref={editInputRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      maxLength={1000}
                      rows={2}
                      className="rounded-2xl border border-gold/40 bg-white px-3.5 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-gold resize-y min-h-[44px]"
                    />
                    <div className={`flex gap-2 ${msg.isOwn ? "justify-end" : "justify-start"}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="h-7 text-xs px-2"
                      >
                        {t.admin.commentCancel}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={!editText.trim() || savingEdit}
                        className="h-7 text-xs px-2 gap-1"
                      >
                        <Check className="w-3 h-3" />
                        {t.admin.commentSave}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end gap-1">
                    {msg.isOwn && !isConfirmingDelete && (
                      <CommentActions
                        editLabel={t.admin.commentEdit}
                        deleteLabel={t.admin.commentDelete}
                        onEdit={() => beginEdit(msg)}
                        onDelete={() => {
                          setEditingId(null);
                          setConfirmDeleteId(msg.id);
                        }}
                      />
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        msg.isOwn
                          ? "bg-gold text-white rounded-br-md"
                          : "bg-gray-100 text-gray-900 rounded-bl-md"
                      }`}
                    >
                      {msg.text}
                    </div>
                    {!msg.isOwn && !isConfirmingDelete && (
                      <CommentActions
                        editLabel={t.admin.commentEdit}
                        deleteLabel={t.admin.commentDelete}
                        onEdit={() => beginEdit(msg)}
                        onDelete={() => {
                          setEditingId(null);
                          setConfirmDeleteId(msg.id);
                        }}
                      />
                    )}
                  </div>
                )}

                {isConfirmingDelete && (
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">
                    <span className="text-xs text-red-700">
                      {t.admin.commentDeleteConfirm}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                      className="h-6 text-[11px] px-2"
                    >
                      {t.admin.commentCancel}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="h-6 text-[11px] px-2"
                    >
                      {t.admin.commentDelete}
                    </Button>
                  </div>
                )}

                {!isEditing && (
                  <span className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {msg.editedAt && (
                      <span className="ml-1 italic" title={new Date(msg.editedAt).toLocaleString()}>
                        ({t.admin.commentEdited})
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t px-4 py-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.admin.commentPlaceholder}
            maxLength={1000}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <Button size="sm" onClick={handleSend} disabled={!text.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
