"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ShopConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red confirm button (delete). */
  destructive?: boolean;
  busy?: boolean;
  /** Why the last confirm failed; the dialog stays open while it is shown. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Storefront confirmation (instead of the browser's `window.confirm`): a bottom
 * sheet on phones, a centred card on desktop, in the shop's own colours.
 * Rendered on `<body>` so a transformed parent never traps the fixed overlay;
 * the `shop-root contents` wrapper keeps the shop tokens without drawing a box.
 */
export function ShopConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: ShopConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="shop-root contents">
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(20,33,61,0.45)] md:items-center md:p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shop-confirm-title"
        aria-describedby="shop-confirm-desc"
        data-shop-confirm
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="flex w-full max-w-[440px] flex-col gap-3 rounded-t-2xl bg-white p-5 text-(--ink) md:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="shop-confirm-title" className="m-0 text-xl font-extrabold">
            {title}
          </h2>
          <p id="shop-confirm-desc" className="m-0 text-base text-(--muted)">
            {description}
          </p>
          {error ? (
            <p role="alert" className="m-0 rounded-[10px] bg-(--err-soft) px-3 py-2 text-sm font-semibold text-(--err)">
              {error}
            </p>
          ) : null}
          <div className="mt-1 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 rounded-[10px] bg-(--soft) px-4 font-bold text-(--ink) disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              data-shop-confirm-ok
              className={`shop-btn-dark min-h-11 rounded-[10px] px-4 font-bold text-white disabled:opacity-60 ${destructive ? "bg-(--err)" : "bg-(--ink)"}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
