"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LAYOUT_ISSUE_NOTE_MAX, LAYOUT_ISSUE_REASONS, type LayoutIssueReason } from "@/lib/layoutIssue";

/**
 * «Нужен макет» on one order line: reason (required) + optional comment.
 * Used on the workshop board and on the studio orders page; the caller does
 * the POST (`flagLineLayoutIssue`) and the refresh.
 */
export default function LayoutIssueModal({
  lineCode,
  isSubmitting = false,
  error,
  onConfirm,
  onClose,
}: {
  lineCode: string;
  isSubmitting?: boolean;
  /** Shown under the form (e.g. `t.layoutIssue.flagFailed`). */
  error?: string | null;
  onConfirm: (reason: LayoutIssueReason, note: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useLanguageStore();
  const li = t.layoutIssue;
  const [selected, setSelected] = useState<LayoutIssueReason | null>(null);
  const [note, setNote] = useState("");

  const close = () => {
    if (!isSubmitting) onClose();
  };
  const submit = () => {
    if (!selected || isSubmitting) return;
    const trimmed = note.trim();
    onConfirm(selected, trimmed.length > 0 ? trimmed : null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="layout-issue-modal">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-xl sm:p-6"
      >
        <button
          type="button"
          onClick={close}
          disabled={isSubmitting}
          aria-label={li.cancel}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-2 flex items-center gap-2 pr-8">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
          <h2 className="text-base font-bold sm:text-lg">{li.modalTitle(lineCode)}</h2>
        </div>
        <p className="mb-4 text-xs text-gray-500">{li.modalHint}</p>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-semibold text-gray-700">{li.reasonLabel}</legend>
          <div className="space-y-1.5">
            {LAYOUT_ISSUE_REASONS.map((key) => (
              <label
                key={key}
                data-testid={`layout-issue-reason-${key}`}
                className={cn(
                  "flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                  selected === key
                    ? "border-rose-400 bg-rose-50 font-medium text-rose-800"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                  isSubmitting && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="layout-issue-reason"
                  value={key}
                  checked={selected === key}
                  disabled={isSubmitting}
                  onChange={() => setSelected(key)}
                  className="h-4 w-4 accent-rose-600"
                />
                {li.reasons[key]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="layout-issue-note">
          {li.noteLabel}
        </label>
        <textarea
          id="layout-issue-note"
          data-testid="layout-issue-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, LAYOUT_ISSUE_NOTE_MAX))}
          placeholder={li.notePlaceholder}
          maxLength={LAYOUT_ISSUE_NOTE_MAX}
          rows={3}
          disabled={isSubmitting}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="mb-3 text-right text-[11px] tabular-nums text-gray-400">
          {note.length}/{LAYOUT_ISSUE_NOTE_MAX}
        </p>

        {error ? (
          <p className="mb-3 text-sm text-red-600" data-testid="layout-issue-error">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {li.cancel}
          </button>
          <button
            type="button"
            data-testid="layout-issue-confirm"
            disabled={!selected || isSubmitting}
            onClick={submit}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden />
            )}
            {li.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
