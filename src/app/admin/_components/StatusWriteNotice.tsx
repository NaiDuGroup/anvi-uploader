"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Short notice after an order-level status write that met «Нужен макет»
 * lines (`orderStatusWriteNotice`): kept lines (info) or a refusal (error).
 */
export interface StatusWriteNoticeValue {
  tone: "info" | "error";
  text: string;
}

/** Notice state that hides itself after `ms`. */
export function useStatusWriteNotice(ms = 7000) {
  const [notice, setNotice] = useState<StatusWriteNoticeValue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (next: StatusWriteNoticeValue | null) => {
      if (timer.current) clearTimeout(timer.current);
      setNotice(next);
      if (next) timer.current = setTimeout(() => setNotice(null), ms);
    },
    [ms],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { notice, show, hide: useCallback(() => show(null), [show]) };
}

export function StatusWriteNotice({
  notice,
  onClose,
}: {
  notice: StatusWriteNoticeValue | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  const tone =
    notice.tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      data-testid="status-write-notice"
      className={`fixed bottom-20 left-4 right-4 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg sm:bottom-6 ${tone}`}
    >
      <span className="min-w-0 flex-1">⚠ {notice.text}</span>
      <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="×">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
