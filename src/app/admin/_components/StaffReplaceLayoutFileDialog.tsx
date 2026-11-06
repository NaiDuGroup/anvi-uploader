"use client";

import { useEffect, useRef, useState } from "react";
import { FilePen, Link2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import { ArtworkSizeCheckLine } from "@/components/ArtworkSizeCheckLine";
import { checkArtworkSize } from "@/lib/files/artworkSizeCheck";
import type { PrintSizeCm } from "@/lib/files/declaredPrintSize";
import { readLocalFileMetaCached, useLocalFileMeta } from "@/lib/files/useLocalFileMeta";
import { layoutLinkAllowed } from "@/lib/layoutIssue";
import { staffReplaceLineFile } from "@/lib/layoutIssueClient";
import { isHttpLink } from "@/lib/validations";
import { cn } from "@/lib/utils";

export interface StaffReplaceTarget {
  orderId: string;
  lineId: string;
  /** «#0042.2/3». */
  lineCode: string;
  productType: string;
  /** Ordered print size of a large-format line (a bigger artwork cannot be saved); null otherwise. */
  declared: PrintSizeCm | null;
  /** The line's current files (shown with their size line; with several, the one to replace is picked). */
  currentFiles: readonly { id: string; fileName: string }[];
  /** Pre-selected file to replace (e.g. a per-file button); otherwise the only file, or none until picked. */
  initialFileId?: string | null;
}

/** The file pre-selected in the dialog: the requested one if it is on the line, else the only file. */
export function initialReplaceFileId(target: Pick<StaffReplaceTarget, "currentFiles" | "initialFileId">): string | null {
  if (target.initialFileId && target.currentFiles.some((f) => f.id === target.initialFileId)) {
    return target.initialFileId;
  }
  return target.currentFiles.length === 1 ? target.currentFiles[0]!.id : null;
}

/**
 * Staff «Заменить файл» on one «Нужен макет» line (studio orders list, ЦЕХ
 * sidebar, workshop board): the same focused flow as the cabinet's
 * `ReplaceLayoutFileDialog`, for this line only. The new artwork is a picked
 * file (read in the browser for the size line, uploaded via
 * `POST /api/upload-url` like the admin wizard) or — like the wizard's
 * «или вставьте ссылку» — a link, except for sheet products / DTF. Saving posts
 * to `/api/orders/[id]/lines/[lineId]/replace-file`; the line returns to «Ждёт».
 *
 * Replaces ONE file: on a line with several files the staff picks which one
 * (radio list of the current files); the others, and the copies / colour /
 * paper of the replaced one, stay as they are.
 */
export default function StaffReplaceLayoutFileDialog({
  target,
  onDone,
  onClose,
}: {
  target: StaffReplaceTarget;
  /** After a save (or when the line was not flagged any more): refresh lists. */
  onDone: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useLanguageStore();
  const L = t.layoutIssue;
  const { declared } = target;
  const linkAllowed = layoutLinkAllowed(target.productType);
  const multiFile = target.currentFiles.length > 1;
  const [fileId, setFileId] = useState<string | null>(() => initialReplaceFileId(target));
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = phase !== "idle";

  const meta = useLocalFileMeta(file);
  const tooLarge = Boolean(file && declared && checkArtworkSize(meta, declared)?.issues.includes("larger"));
  const trimmedLink = link.trim();
  const linkInvalid = !file && trimmedLink.length > 0 && !isHttpLink(trimmedLink);
  const needsPick = multiFile && fileId === null;
  const canSave = !busy && !tooLarge && !needsPick && (file !== null || (trimmedLink.length > 0 && !linkInvalid));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const handleSave = async () => {
    if (needsPick) {
      setError(L.staffReplacePickFileRequired);
      return;
    }
    if (!canSave) return;
    setError(null);
    let artwork: { fileName: string; fileUrl: string };
    if (file) {
      if (declared) {
        const check = checkArtworkSize(await readLocalFileMetaCached(file), declared);
        if (check?.issues.includes("larger")) {
          setError(L.replaceTooLarge);
          return;
        }
      }
      setPhase("uploading");
      try {
        artwork = await uploadFile(file);
      } catch {
        setPhase("idle");
        setError(L.replaceUploadFailed);
        return;
      }
    } else {
      artwork = { fileName: trimmedLink, fileUrl: trimmedLink };
    }

    setPhase("saving");
    try {
      await staffReplaceLineFile(target.orderId, target.lineId, fileId, artwork);
      await onDone();
      toast.success(L.staffReplaceDone);
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "line_not_flagged") {
        toast.info(L.replaceNotFlagged);
        await onDone();
        onClose();
        return;
      }
      if (code === "file_not_in_line") {
        // Replaced / removed meanwhile (another tab, the owner): the file list here is stale — refresh and close.
        toast.info(L.replaceFileGone);
        await onDone();
        onClose();
        return;
      }
      setError(
        code === "file_id_required" ? L.staffReplacePickFileRequired :
        code === "artwork_larger_than_ordered"
          ? L.replaceTooLarge
          : code === "link_not_allowed"
            ? L.staffReplaceLinkNotAllowed
            : L.replaceFailed,
      );
    } finally {
      setPhase("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-replace-layout-title"
        data-testid="staff-replace-file-dialog"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="staff-replace-layout-title" className="flex items-center gap-2 text-base font-bold sm:text-lg">
            <FilePen className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            {L.replaceTitle(target.lineCode)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={L.replaceCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">{L.staffReplaceDialogHint}</p>

        {multiFile ? (
          <fieldset className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5" data-testid="staff-replace-pick">
            <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              {L.staffReplacePickFile}
            </legend>
            <div className="space-y-1">
              {target.currentFiles.map((f) => (
                <label
                  key={f.id}
                  data-testid={`staff-replace-pick-${f.id}`}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-2 rounded-md border p-2",
                    fileId === f.id ? "border-amber-400 bg-white" : "border-transparent hover:bg-white/70",
                  )}
                >
                  <input
                    type="radio"
                    name="staff-replace-file"
                    className="mt-1 shrink-0"
                    value={f.id}
                    checked={fileId === f.id}
                    disabled={busy}
                    onChange={() => {
                      setFileId(f.id);
                      setError(null);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800" title={f.fileName}>
                      {f.fileName}
                    </span>
                    <ArtworkSizeCheckLine fileId={f.id} declared={declared} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : target.currentFiles.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5" data-testid="staff-replace-current">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">{L.cabinetOldFile}</p>
            {target.currentFiles.map((f) => (
              <div key={f.id} className="min-w-0">
                <p className="truncate text-sm text-gray-800" title={f.fileName}>
                  {f.fileName}
                </p>
                <ArtworkSizeCheckLine fileId={f.id} declared={declared} />
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          data-testid="staff-replace-file-input"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!next) return;
            setFile(next);
            setLink("");
            setError(null);
          }}
        />

        {file ? (
          <div className={cn("rounded-lg border p-3", tooLarge ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50")}>
            <p className="truncate text-sm font-medium text-gray-900" title={file.name}>
              {file.name}
            </p>
            <ArtworkSizeCheckLine className="mt-1" file={file} declared={declared} />
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
              >
                {L.replaceChange}
              </button>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={busy}
                className="text-xs font-medium text-gray-500 hover:underline disabled:opacity-50"
              >
                {L.replaceCancel}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm font-semibold text-gray-700 transition-colors hover:border-gold hover:bg-amber-50/40"
          >
            <Upload className="h-5 w-5 text-gray-500" aria-hidden />
            {L.replacePick}
          </button>
        )}

        {linkAllowed && !file ? (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              <span>{t.upload.orPasteLink}</span>
            </div>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              data-testid="staff-replace-link-input"
              value={link}
              disabled={busy}
              onChange={(e) => {
                setLink(e.target.value);
                setError(null);
              }}
              placeholder={t.upload.linkPlaceholder}
              className={cn(
                "h-9 w-full min-w-0 rounded-md border px-2.5 text-sm text-gray-900 placeholder:text-gray-400",
                linkInvalid ? "border-red-400" : "border-gray-300",
              )}
            />
            {linkInvalid ? (
              <p className="text-xs text-red-600">{t.upload.invalidLink}</p>
            ) : trimmedLink ? (
              <p className="text-[11px] text-amber-700">{L.staffReplaceLinkNoCheck}</p>
            ) : null}
          </div>
        ) : null}

        {tooLarge ? <p className="mt-2 text-sm font-semibold text-red-700">{L.replaceTooLarge}</p> : null}
        {error && !(tooLarge && error === L.replaceTooLarge) ? (
          <p role="alert" className="mt-2 text-sm text-red-700" data-testid="staff-replace-error">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {L.replaceCancel}
          </button>
          <button
            type="button"
            data-testid="staff-replace-file-confirm"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {phase === "uploading" ? L.replaceUploading : phase === "saving" ? L.replaceSaving : L.replaceConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
