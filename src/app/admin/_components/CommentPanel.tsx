"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send } from "lucide-react";

interface CommentMessage {
  id: string;
  text: string;
  createdAt: string;
  userName: string;
  userRole: string;
  isOwn: boolean;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(initialComments?.length ?? 0);

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
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

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
          {messages.map((msg) => (
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
              <div
                className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-sm leading-relaxed ${
                  msg.isOwn
                    ? "bg-gold text-white rounded-br-md"
                    : "bg-gray-100 text-gray-900 rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-gray-400 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
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
