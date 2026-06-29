"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send } from "lucide-react";
import type { ClientMessageDTO } from "@/lib/clientMessages";

/** Slide-over for the client-facing message channel (separate from internal comments). */
type ClientMessage = Omit<ClientMessageDTO, "createdAt" | "editedAt"> & {
  createdAt: string;
  editedAt: string | null;
};

export default function ClientMessagePanel({
  orderId,
  orderNumber,
  t,
  onClose,
}: {
  orderId: string;
  orderNumber: number;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`);
      if (res.ok) {
        setMessages((await res.json()) as ClientMessage[]);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const msg = (await res.json()) as ClientMessage;
        setMessages((prev) => [...prev, msg]);
        setText("");
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">
              {t.admin.clientChat} — #{String(orderNumber).padStart(4, "0")}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              {t.admin.clientChatEmpty}
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isStaff ? "items-end" : "items-start"}`}
            >
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-gray-600">
                  {msg.authorName}
                </span>
                {!msg.isStaff && (
                  <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                    {t.admin.clientChatClientBadge}
                  </Badge>
                )}
              </div>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  msg.isStaff
                    ? "rounded-br-md bg-gold text-white"
                    : "rounded-bl-md bg-gray-100 text-gray-900"
                }`}
              >
                {msg.text}
              </div>
              <span className="mt-0.5 text-[10px] text-gray-400">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {msg.editedAt && (
                  <span className="ml-1 italic">({t.admin.commentEdited})</span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t px-4 py-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.admin.clientChatPlaceholder}
            maxLength={1000}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <Button size="sm" onClick={handleSend} disabled={!text.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
