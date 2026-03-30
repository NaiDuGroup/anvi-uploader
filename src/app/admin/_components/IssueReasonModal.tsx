"use client";

import { useState } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import type { IssueReasonKey } from "../_lib/constants";
import { ISSUE_REASON_KEYS } from "../_lib/constants";

export default function IssueReasonModal({
  t,
  isSubmitting = false,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isSubmitting?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<IssueReasonKey | null>(null);
  const [customText, setCustomText] = useState("");

  const handleSubmit = () => {
    if (!selected || isSubmitting) return;
    const reason =
      selected === "other"
        ? customText.trim() || t.admin.issueReasons.other
        : t.admin.issueReasons[selected];
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isSubmitting && onClose()}
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          type="button"
          onClick={() => !isSubmitting && onClose()}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold">{t.admin.issueModalTitle}</h2>
        </div>

        <div className="space-y-2 mb-4">
          {ISSUE_REASON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => !isSubmitting && setSelected(key)}
              disabled={isSubmitting}
              className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                selected === key
                  ? "border-red-400 bg-red-50 text-red-700 font-medium"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t.admin.issueReasons[key]}
            </button>
          ))}
        </div>

        {selected === "other" && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={t.admin.issueReasonPlaceholder}
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        )}

        <Button
          className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-80"
          disabled={
            !selected ||
            (selected === "other" && !customText.trim()) ||
            isSubmitting
          }
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {t.admin.issueConfirm}
        </Button>
      </div>
    </div>
  );
}
