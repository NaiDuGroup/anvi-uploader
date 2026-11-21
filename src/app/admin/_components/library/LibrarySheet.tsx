"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/**
 * Modal for the library dialogs: a bottom sheet on phones, a centred card on
 * desktop (same look as the other admin dialogs). Escape / backdrop close it
 * unless `busy`. Portaled to `<body>`: the triggers sit inside table cells and
 * the phone card list, which may be hidden or transformed.
 */
export function LibrarySheet({
  title,
  icon,
  onClose,
  busy = false,
  wide = false,
  children,
  footer,
  testId,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  useBodyScrollLock();
  const closeLabel = useLanguageStore((s) => s.t.library.close);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={cn(
          "flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-white text-gray-900 shadow-xl sm:rounded-2xl",
          wide ? "max-w-3xl" : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold sm:text-lg">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label={closeLabel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Footer buttons of the sheet dialogs: exactly the shared Button classes (outline / primary). */
export const sheetCancelClass = buttonVariants({ variant: "outline" });
export const sheetPrimaryClass = buttonVariants();
export const sheetInputClass =
  "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200";
