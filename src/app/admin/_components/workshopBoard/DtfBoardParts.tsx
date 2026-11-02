"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, ScanLine, Stamp, X } from "lucide-react";
import { formatNumber } from "@/lib/dtf/dtfClientApi";
import {
  collectDtfFilmTransfers,
  collectUvDtfFilmTransfers,
  hasUvDtfLines,
  type DtfFilmTransfers,
} from "@/lib/dtf/dtfFilmLayout";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type {
  DtfFilmSpec,
  DtfLineFacts,
  WorkshopBoardGroup,
} from "@/lib/workshopBoard/types";

const DTF_FILM_URL = "/api/workshop-board/dtf-film";

function garmentText(facts: DtfLineFacts, t: TranslationDictionary): string {
  if (!facts.garmentKind || !facts.garmentName) return t.dtf.workshop.clientGarment;
  return `${t.dtf.garmentKinds[facts.garmentKind]} ${facts.garmentName} · ${facts.colorName ?? ""}`;
}

/** Board line summary: garment, size run and the transfers pressed on each piece. */
export function DtfBoardLineSummary({ facts }: { facts: DtfLineFacts }) {
  const { t } = useLanguageStore();
  return (
    <div className="space-y-1 text-[11px] text-gray-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <Stamp className="h-3 w-3 shrink-0 text-fuchsia-600" aria-hidden />
        {facts.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: facts.colorHex }}
            aria-hidden
          />
        )}
        <span className="max-w-[14rem] truncate font-medium text-gray-800">
          {garmentText(facts, t)}
        </span>
        <span className="text-gray-300" aria-hidden>·</span>
        <span className="inline-flex shrink-0 items-center rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 font-semibold leading-none text-fuchsia-800">
          {t.dtf.workshop.summary(facts.quantity, facts.transfers.length)}
        </span>
      </div>
      {facts.garmentSource === "stock" && (
        <p className="tabular-nums text-gray-700">
          {facts.sizes.map((s) => `${s.size}×${s.quantity}`).join("  ")}
        </p>
      )}
      <ul className="flex flex-wrap gap-1">
        {facts.transfers.map((tr) => (
          <li
            key={tr.zoneId}
            className={
              tr.fileId
                ? "rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5"
                : "rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800"
            }
          >
            {t.dtf.placements[tr.placement]} · {tr.customSize ? `${tr.widthCm}×${tr.heightCm}` : tr.presetLabel}
            {tr.noPress && <span className="ml-1 font-semibold text-red-700">· {t.dtf.editor.noPress}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DtfFilmPreview {
  filmWidthCm: number;
  lengthCm: number;
  placedCount: number;
  unplaced: { tileId: string; reason: string }[];
  vectorPdfCount: number;
  gapMm: number;
  previewDataUrl: string | null;
}

type FilmMethod = "dtf" | "uv_dtf";

async function postDtfFilm<T>(
  mode: "preview" | "pdf",
  film: DtfFilmTransfers,
  failedText: string,
  method: FilmMethod = "dtf",
): Promise<T> {
  const res = await fetch(DTF_FILM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, method, orderNumbers: film.orderNumbers, transfers: film.transfers }),
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? failedText);
  return body;
}

function DtfFilmLayoutModal({
  group,
  onClose,
  method = "dtf",
}: {
  group: WorkshopBoardGroup;
  onClose: () => void;
  method?: FilmMethod;
}) {
  const { t, locale } = useLanguageStore();
  const copy = t.dtf.workshop;
  const title: string = method === "uv_dtf" ? t.uv.workshop.filmLayoutTitle : copy.filmLayoutTitle;
  const film: DtfFilmTransfers = useMemo(
    () => (method === "uv_dtf" ? collectUvDtfFilmTransfers(group.lines) : collectDtfFilmTransfers(group.lines)),
    [group.lines, method],
  );
  const [preview, setPreview] = useState<DtfFilmPreview | null>(null);
  const [nesting, setNesting] = useState<boolean>(film.transfers.length > 0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // The board re-renders on every refresh; nest again only when the transfers change.
  const filmKey: string = JSON.stringify(film);
  const filmRef = useRef<DtfFilmTransfers>(film);
  filmRef.current = film;
  const previewFailedText = copy.previewFailed;

  useEffect(() => {
    const current: DtfFilmTransfers = filmRef.current;
    if (current.transfers.length === 0) return;
    let cancelled = false;
    setNesting(true);
    setError(null);
    postDtfFilm<DtfFilmPreview>("preview", current, previewFailedText, method)
      .then((p) => !cancelled && setPreview(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : previewFailedText))
      .finally(() => !cancelled && setNesting(false));
    return () => {
      cancelled = true;
    };
  }, [filmKey, previewFailedText, method]);

  const tileCount: number = film.transfers.length + film.missingArtworkCount;
  const canDownload: boolean =
    preview !== null && preview.placedCount > 0 && preview.unplaced.length === 0 && film.missingArtworkCount === 0;

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { downloadUrl } = await postDtfFilm<{ downloadUrl: string }>("pdf", film, copy.downloadFailed, method);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.downloadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {preview ? `${copy.filmWidth(preview.filmWidthCm)} · ` : ""}
              {copy.transfers(tileCount)}
              {preview ? ` · ${copy.filmLength(formatNumber(preview.lengthCm / 100, locale))}` : ""}
            </p>
            {preview && <p className="mt-0.5 text-[11px] text-gray-500">{copy.layoutNote(preview.gapMm)}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {tileCount === 0 ? (
          <p className="text-xs text-gray-500">{copy.noTransfers}</p>
        ) : nesting ? (
          <p className="flex items-center gap-2 py-8 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {copy.nesting}
          </p>
        ) : preview?.previewDataUrl ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-100 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered data URL */}
            <img src={preview.previewDataUrl} alt={title} className="mx-auto block w-full max-w-sm" />
          </div>
        ) : null}

        {film.missingArtworkCount > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">{copy.missingArtwork(film.missingArtworkCount)}</p>
        )}
        {preview && preview.unplaced.length > 0 && (
          <p className="mt-2 text-[11px] text-red-600">{copy.unplaced(preview.unplaced.length)}</p>
        )}
        {preview && preview.vectorPdfCount > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">{copy.vectorPdfNote(preview.vectorPdfCount)}</p>
        )}
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!canDownload || busy}
            onClick={() => void download()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
            {busy ? copy.building : copy.download}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Group-header action that nests every DTF transfer on the board onto one film. */
export function DtfFilmLayoutButton({ group }: { group: WorkshopBoardGroup }) {
  const { t } = useLanguageStore();
  const [open, setOpen] = useState<boolean>(false);
  const film: DtfFilmSpec | undefined = group.meta.dtfFilm;
  if (!film) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-medium text-fuchsia-700 transition-colors hover:border-fuchsia-400 hover:bg-fuchsia-100"
      >
        <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t.dtf.workshop.filmLayout}
      </button>
      {open && <DtfFilmLayoutModal group={group} onClose={() => setOpen(false)} />}
    </>
  );
}

/** UV section action: nests the UV-DTF stickers of the board onto the 30 cm film. */
export function UvDtfFilmLayoutButton({ group }: { group: WorkshopBoardGroup }) {
  const { t } = useLanguageStore();
  const [open, setOpen] = useState<boolean>(false);
  if (!hasUvDtfLines(group.lines)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-medium text-fuchsia-700 transition-colors hover:border-fuchsia-400 hover:bg-fuchsia-100"
      >
        <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t.uv.workshop.filmLayout}
      </button>
      {open && <DtfFilmLayoutModal group={group} method="uv_dtf" onClose={() => setOpen(false)} />}
    </>
  );
}
