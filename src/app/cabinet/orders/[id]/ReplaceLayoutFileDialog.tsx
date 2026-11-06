"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { mutate as mutateGlobal } from "swr";
import type { TranslationDictionary } from "@/lib/i18n";
import { CABINET_UNREAD_KEY } from "@/lib/swr";
import { uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import { ArtworkSizeCheckLine } from "@/components/ArtworkSizeCheckLine";
import { checkArtworkSize } from "@/lib/files/artworkSizeCheck";
import type { PrintSizeCm } from "@/lib/files/declaredPrintSize";
import { readLocalFileMetaCached, useLocalFileMeta } from "@/lib/files/useLocalFileMeta";
import { cn } from "@/lib/utils";

/**
 * «Заменить файл» on a «Нужен макет» line (cabinet, dealer or retail client).
 * The customer picks one file; it is read in the browser for the size line
 * (size · dpi · px · weight) and, on a large-format line, checked against the
 * ordered print size — a bigger artwork cannot be saved (the server checks
 * again, 422). Saving uploads it (`POST /api/upload-url`, like the cabinet
 * wizard) and posts it to `…/lines/[lineId]/replace-file`; the line returns to
 * the workshop queue. Bottom sheet on phones, centred dialog from `sm`.
 *
 * `mode="replace"` (step 4): the same dialog on a position that has not
 * started yet — no «нужен новый макет» wording, posts `kind: "replace"`; the
 * line stays in the queue. If the workshop starts it meanwhile, the server
 * answers 409 `line_started`: the message stays in the dialog and the order
 * refreshes (the button disappears).
 *
 * Replaces ONE file of the position (`fileId`, from the per-file «Заменить»
 * button or the position's only file): the new file keeps its copies / colour
 * / paper, the position's other files stay. If that file was replaced meanwhile
 * (404 `file_not_in_line`), the order refreshes and the dialog closes.
 */
export function replaceRequestBody(
  mode: "layout" | "replace",
  fileId: string | null,
  uploaded: { fileName: string; fileUrl: string },
): { fileId?: string; files: { fileName: string; fileUrl: string }[]; kind?: "replace" } {
  return {
    ...(fileId ? { fileId } : {}),
    files: [uploaded],
    ...(mode === "replace" ? { kind: "replace" as const } : {}),
  };
}

export function ReplaceLayoutFileDialog({
  orderId,
  lineId,
  fileId = null,
  fileName = null,
  lineCode,
  mode = "layout",
  declared,
  t,
  onDone,
  onClose,
}: {
  orderId: string;
  lineId: string;
  /** The `File.id` being replaced (null only for a position without files). */
  fileId?: string | null;
  /** Its name, shown under the title. */
  fileName?: string | null;
  /** «#0042.2/3» — shown in the title. */
  lineCode: string;
  /** `layout`: a «Нужен макет» position (default); `replace`: a position not started yet. */
  mode?: "layout" | "replace";
  /** Ordered print size of a large-format line (blocks a bigger artwork); null otherwise. */
  declared: PrintSizeCm | null;
  t: TranslationDictionary;
  /** After a successful save (or when the line turned out not flagged any more): refresh the order. */
  onDone: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const L = t.layoutIssue;
  const isReplace = mode === "replace";
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = phase !== "idle";

  const meta = useLocalFileMeta(file);
  const tooLarge = Boolean(file && declared && checkArtworkSize(meta, declared)?.issues.includes("larger"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const refreshAll = async () => {
    await Promise.all([onDone(), mutateGlobal(CABINET_UNREAD_KEY)]);
  };

  const handleSave = async () => {
    if (!file || busy) return;
    setError(null);
    // The meta may still be reading when the button is pressed: check on the real facts.
    if (declared) {
      const check = checkArtworkSize(await readLocalFileMetaCached(file), declared);
      if (check?.issues.includes("larger")) {
        setError(L.replaceTooLarge);
        return;
      }
    }

    setPhase("uploading");
    let uploaded: { fileName: string; fileUrl: string };
    try {
      uploaded = await uploadFile(file);
    } catch {
      setPhase("idle");
      setError(L.replaceUploadFailed);
      return;
    }

    setPhase("saving");
    try {
      const res = await fetch(`/api/cabinet/orders/${orderId}/lines/${lineId}/replace-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replaceRequestBody(mode, fileId, uploaded)),
      });
      if (res.ok) {
        await refreshAll();
        toast.success(isReplace ? L.ownerReplaceDone : L.replaceDone);
        onClose();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 404 && body.error === "file_not_in_line") {
        // The file was replaced meanwhile (another tab, the studio): show the current files.
        toast.info(L.replaceFileGone);
        await refreshAll();
        onClose();
        return;
      }
      if (res.status === 409 && (body.error === "line_started" || body.error === "order_locked")) {
        // The workshop started the position (or the order moved on) while the dialog was open.
        setError(body.error === "line_started" ? L.ownerReplaceStarted : L.ownerReplaceLocked);
        void refreshAll();
        return;
      }
      if (res.status === 409 && body.error === "line_not_flagged") {
        // Fixed meanwhile (staff, another tab): show the current state.
        toast.info(L.replaceNotFlagged);
        await refreshAll();
        onClose();
        return;
      }
      setError(
        res.status === 422 && body.error === "artwork_larger_than_ordered" ? L.replaceTooLarge : L.replaceFailed,
      );
    } catch {
      setError(L.replaceFailed);
    } finally {
      setPhase("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-layout-title"
        data-testid="replace-file-dialog"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="replace-layout-title" className="text-base font-bold text-gray-900">
            {isReplace ? L.ownerReplaceTitle(lineCode) : L.replaceTitle(lineCode)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-gray-400 hover:text-gray-700"
            aria-label={L.replaceCancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {fileName ? (
          <p
            data-testid="replace-file-target"
            className="mb-2 truncate rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-800"
            title={fileName}
          >
            {L.replaceFileTarget(fileName)}
          </p>
        ) : null}
        <p className="mb-3 text-sm text-gray-600">{isReplace ? L.ownerReplaceHint : L.replaceHint}</p>

        <input
          ref={inputRef}
          type="file"
          data-testid="replace-file-input"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!next) return;
            setFile(next);
            setError(null);
          }}
        />

        {file ? (
          <div
            className={cn(
              "rounded-lg border p-3",
              tooLarge ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50",
            )}
          >
            <p className="truncate text-sm font-medium text-gray-900" title={file.name}>
              {file.name}
            </p>
            <ArtworkSizeCheckLine className="mt-1" file={file} declared={declared} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="mt-2 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
            >
              {L.replaceChange}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-700 transition-colors hover:border-gold hover:bg-amber-50/40"
          >
            <Upload className="h-5 w-5 text-gray-500" aria-hidden />
            {L.replacePick}
          </button>
        )}

        {tooLarge ? (
          <p className="mt-2 text-sm font-semibold text-red-700">{L.replaceTooLarge}</p>
        ) : null}
        {error && !(tooLarge && error === L.replaceTooLarge) ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:h-10"
          >
            {L.replaceCancel}
          </button>
          <button
            type="button"
            data-testid="replace-file-confirm"
            onClick={() => void handleSave()}
            disabled={!file || busy || tooLarge}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {phase === "uploading" ? L.replaceUploading : phase === "saving" ? L.replaceSaving : L.replaceConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
