"use client";

import { useEffect, useCallback } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AdminConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** Primary action label (e.g. «Удалить»). */
  confirmLabel: string;
  cancelLabel: string;
  /** `destructive` — red confirm button (delete/danger). */
  confirmVariant?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** `dialog` keeps focus in dialog; `alertdialog` for critical confirmations. */
  role?: "dialog" | "alertdialog";
};

/**
 * In-app confirmation overlay matching admin modals: light card, rounded-2xl, gold/cancel outline, optional destructive confirm.
 */
export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = "destructive",
  busy = false,
  onConfirm,
  onClose,
  role = "alertdialog",
}: AdminConfirmDialogProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !busy) onClose();
    },
    [open, busy, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role={role}
      aria-modal
      aria-labelledby="admin-confirm-title"
      aria-describedby="admin-confirm-desc"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label={cancelLabel}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 ring-1 ring-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="admin-confirm-title" className="text-lg font-semibold leading-snug text-gray-900">
              {title}
            </h2>
            <p id="admin-confirm-desc" className="mt-2 text-sm leading-relaxed text-gray-600">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className={confirmVariant === "default" ? "gap-2" : "min-w-[7rem] gap-2"}
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
