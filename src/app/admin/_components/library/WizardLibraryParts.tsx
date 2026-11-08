"use client";

import { AlertTriangle, BookMarked, X } from "lucide-react";
import type { WizardReusedFile } from "./wizardReuse";

/** «Из библиотеки» trigger for a wizard row (or the files panel). */
export function WizardLibraryPickButton({
  onClick,
  className,
  label = "Из библиотеки",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className ?? "ml-7 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900"}
      data-testid="wizard-library-pick"
    >
      <BookMarked className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

/** Under a row that reuses stored artwork: where it comes from + «убрать». */
export function WizardReuseInfo({ reuse, onClear }: { reuse: WizardReusedFile; onClear: () => void }) {
  const from =
    reuse.source === "library"
      ? `Из библиотеки${reuse.title && reuse.title !== reuse.fileName ? ` · ${reuse.title}` : ""}`
      : reuse.source === "link"
        ? "Ссылка из прошлого заказа"
        : "Файл из прошлого заказа (хранится 7 дней с загрузки)";
  return (
    <div className="ml-7 flex min-w-0 items-center gap-1.5 text-[11px]">
      <span
        className={
          reuse.source === "library"
            ? "inline-flex min-w-0 items-center gap-1 truncate rounded bg-emerald-50 px-1.5 py-px font-medium text-emerald-700 ring-1 ring-emerald-200"
            : "inline-flex min-w-0 items-center gap-1 truncate rounded bg-sky-50 px-1.5 py-px font-medium text-sky-800 ring-1 ring-sky-200"
        }
        title={from}
      >
        {reuse.source === "library" ? <BookMarked className="h-3 w-3 shrink-0" aria-hidden /> : null}
        <span className="truncate">{from}</span>
      </span>
      {reuse.metaText ? <span className="truncate text-gray-500">{reuse.metaText}</span> : null}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title="Убрать файл"
        aria-label="Убрать файл"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** «Повторить заказ»: the original file is no longer stored. */
export function WizardMissingFileNote({ fileName }: { fileName: string }) {
  return (
    <p className="ml-7 flex items-start gap-1 text-[11px] font-medium text-red-700" data-testid="wizard-missing-file">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        Файл нужно загрузить заново: <span className="break-all">{fileName}</span> (удалён из хранилища)
      </span>
    </p>
  );
}
