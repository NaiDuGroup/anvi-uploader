"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, ScanLine, Stamp, X } from "lucide-react";
import { DtfZoneIcon } from "@/app/admin/_components/dtf/GarmentZoneSchema";
import { formatNumber } from "@/lib/dtf/dtfClientApi";
import { dtfSizesText } from "@/lib/dtf/dtfSizesText";
import { dtfZoneLabel } from "@/lib/dtf/dtfZones";
import {
  collectDtfFilmTransfers,
  collectUvDtfFilmTransfers,
  filmLineChoices,
  FILM_GAP_MAX_MM,
  FILM_GAP_MIN_MM,
  hasUvDtfLines,
  parseFilmGapMm,
  pickFilmLines,
  type DtfFilmTransfers,
  type FilmLineChoice,
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
          {dtfSizesText(facts.sizes, t.dtf.editor.pieces)}
        </p>
      )}
      <ul className="flex flex-wrap gap-1">
        {facts.transfers.map((tr) => (
          <li
            key={tr.zoneId}
            className={
              tr.fileId
                ? "inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 py-0.5 pl-0.5 pr-1.5"
                : "inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 py-0.5 pl-0.5 pr-1.5 text-amber-800"
            }
          >
            <DtfZoneIcon placement={tr.placement} placementNote={tr.placementNote} className="h-8 w-8" />
            {dtfZoneLabel(tr, t.dtf.placements)} · {tr.customSize ? `${tr.widthCm}×${tr.heightCm}` : tr.presetLabel}
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
  method: FilmMethod,
  gapMm: number | null,
): Promise<T> {
  const res = await fetch(DTF_FILM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      method,
      orderNumbers: film.orderNumbers,
      transfers: film.transfers,
      ...(gapMm !== null ? { gapMm } : {}),
    }),
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? failedText);
  return body;
}

const GAP_STORAGE_KEY = "workshop-film-gap-mm:";

function readStoredGap(method: FilmMethod): number | null {
  try {
    return parseFilmGapMm(localStorage.getItem(GAP_STORAGE_KEY + method) ?? "");
  } catch {
    return null;
  }
}

function storeGap(method: FilmMethod, gapMm: number | null): void {
  try {
    if (gapMm === null) localStorage.removeItem(GAP_STORAGE_KEY + method);
    else localStorage.setItem(GAP_STORAGE_KEY + method, String(gapMm));
  } catch {
    // Private mode: the gap is just not remembered.
  }
}

/** What the last nesting was run with. */
interface AppliedFilm {
  selectedKey: string;
  gapMm: number | null;
}

function selectionKey(selected: ReadonlySet<string>): string {
  return [...selected].sort().join("|");
}

function FilmLinePicker({
  choices,
  selected,
  onToggle,
  onSetAll,
}: {
  choices: readonly FilmLineChoice[];
  selected: ReadonlySet<string>;
  onToggle: (orderLineId: string) => void;
  onSetAll: (on: boolean) => void;
}) {
  const { t } = useLanguageStore();
  const copy = t.dtf.workshop;
  const count: number = choices.filter((c) => selected.has(c.orderLineId)).length;
  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <p className="text-xs font-semibold text-gray-800">
          {copy.pickTitle}
          <span className="ml-1.5 font-normal text-gray-500">{copy.selectedCount(count, choices.length)}</span>
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onSetAll(true)}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
          >
            {copy.selectAll}
          </button>
          <button
            type="button"
            onClick={() => onSetAll(false)}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
          >
            {copy.selectNone}
          </button>
        </div>
      </div>
      <ul className="max-h-52 divide-y divide-gray-100 overflow-y-auto">
        {choices.map((c) => {
          const on: boolean = selected.has(c.orderLineId);
          const printed: boolean = !c.defaultSelected;
          return (
            <li key={c.orderLineId}>
              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(c.orderLineId)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-fuchsia-600"
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11px] font-semibold text-gray-800">{c.label}</span>
                    <span
                      className={
                        printed
                          ? "rounded-full border border-orange-200 bg-orange-50 px-1.5 py-px text-[10px] font-medium text-orange-700"
                          : "rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700"
                      }
                    >
                      {t.statuses[c.status as keyof typeof t.statuses] ?? c.status}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-gray-600">
                    {c.phone}
                    {c.clientName ? ` · ${c.clientName}` : ""}
                  </span>
                  <span className="block text-[11px] tabular-nums text-gray-500">
                    {c.sizes.join(", ")} {c.sizes.length > 0 ? "см · " : ""}
                    {copy.pieces(c.quantity)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">{copy.pickHint}</p>
    </div>
  );
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
  const uvDtf: boolean = method === "uv_dtf";

  // ─── What goes on the film ───────────────────────────────────────────────
  const choices: FilmLineChoice[] = useMemo(() => filmLineChoices(group.lines, method), [group.lines, method]);
  // Operator ticks on top of the defaults, so a board refresh keeps them and ticks new lines by status.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const selected: Set<string> = useMemo(
    () => new Set(choices.filter((c) => overrides[c.orderLineId] ?? c.defaultSelected).map((c) => c.orderLineId)),
    [choices, overrides],
  );
  const toggle = (id: string): void =>
    setOverrides((prev) => ({ ...prev, [id]: !selected.has(id) }));
  const setAll = (on: boolean): void =>
    setOverrides(Object.fromEntries(choices.map((c) => [c.orderLineId, on])));

  // ─── Gap between outlines ────────────────────────────────────────────────
  const settingsGapMm: number | null = uvDtf ? null : (group.meta.dtfFilm?.layoutGapMm ?? 3);
  const [initialGap] = useState<number | null>(() => readStoredGap(method) ?? settingsGapMm);
  const [gapText, setGapText] = useState<string>(initialGap === null ? "" : String(initialGap));
  const gapMm: number | null = parseFilmGapMm(gapText);
  const gapInvalid: boolean = gapText.trim() !== "" && gapMm === null;

  const [applied, setApplied] = useState<AppliedFilm>(() => ({
    selectedKey: selectionKey(selected),
    gapMm: initialGap,
  }));
  const appliedSelected: Set<string> = useMemo(
    () => new Set(applied.selectedKey === "" ? [] : applied.selectedKey.split("|")),
    [applied.selectedKey],
  );
  const film: DtfFilmTransfers = useMemo(() => {
    const lines = pickFilmLines(group.lines, appliedSelected);
    return uvDtf ? collectUvDtfFilmTransfers(lines) : collectDtfFilmTransfers(lines);
  }, [group.lines, appliedSelected, uvDtf]);
  // No remembered gap (UV-DTF): the server uses the settings and reports it back.
  const [settingsGapSeen, setSettingsGapSeen] = useState<number | null>(null);
  const appliedGapMm: number | null = applied.gapMm ?? settingsGapSeen;
  const dirty: boolean = selectionKey(selected) !== applied.selectedKey || gapMm !== appliedGapMm;

  const [preview, setPreview] = useState<DtfFilmPreview | null>(null);
  const [nesting, setNesting] = useState<boolean>(film.transfers.length > 0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // The board re-renders on every refresh; nest again only when the transfers or the gap change.
  const filmKey: string = JSON.stringify([film, applied.gapMm]);
  const filmRef = useRef<{ film: DtfFilmTransfers; gapMm: number | null }>({ film, gapMm: applied.gapMm });
  filmRef.current = { film, gapMm: applied.gapMm };
  const previewFailedText = copy.previewFailed;

  useEffect(() => {
    const current = filmRef.current;
    if (current.film.transfers.length === 0) {
      setPreview(null);
      setNesting(false);
      return;
    }
    let cancelled = false;
    setNesting(true);
    setError(null);
    postDtfFilm<DtfFilmPreview>("preview", current.film, previewFailedText, method, current.gapMm)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        // No remembered gap: show the one the settings gave.
        if (current.gapMm === null) {
          setSettingsGapSeen(p.gapMm);
          setGapText((text) => (text.trim() === "" ? String(p.gapMm) : text));
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : previewFailedText))
      .finally(() => !cancelled && setNesting(false));
    return () => {
      cancelled = true;
    };
  }, [filmKey, previewFailedText, method]);

  function relayout(): void {
    if (gapInvalid) return;
    storeGap(method, gapMm);
    setApplied({ selectedKey: selectionKey(selected), gapMm });
  }

  const tileCount: number = film.transfers.length + film.missingArtworkCount;
  // UV-DTF is a PNG for the UV printer: vector PDFs have to come as pictures.
  const vectorBlocked: boolean = uvDtf && (preview?.vectorPdfCount ?? 0) > 0;
  const canDownload: boolean =
    !dirty &&
    !nesting &&
    preview !== null &&
    preview.placedCount > 0 &&
    preview.unplaced.length === 0 &&
    film.missingArtworkCount === 0 &&
    !vectorBlocked;

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { downloadUrl } = await postDtfFilm<{ downloadUrl: string }>(
        "pdf",
        film,
        copy.downloadFailed,
        method,
        applied.gapMm,
      );
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[90vh] sm:rounded-xl sm:pb-4"
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {choices.length > 0 && (
          <div className="mb-3 space-y-2">
            <FilmLinePicker choices={choices} selected={selected} onToggle={toggle} onSetAll={setAll} />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-700">
                {copy.gapLabel}
                <input
                  type="number"
                  inputMode="decimal"
                  min={FILM_GAP_MIN_MM}
                  max={FILM_GAP_MAX_MM}
                  step={0.5}
                  value={gapText}
                  placeholder={copy.gapDefault}
                  onChange={(e) => setGapText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && dirty && relayout()}
                  aria-invalid={gapInvalid}
                  className={
                    gapInvalid
                      ? "h-9 w-28 rounded-lg border border-red-300 px-2.5 text-sm tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-red-200"
                      : "h-9 w-28 rounded-lg border border-gray-300 px-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
                  }
                />
              </label>
              <button
                type="button"
                disabled={!dirty || gapInvalid || selected.size === 0}
                onClick={relayout}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-white px-3 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {copy.relayout}
              </button>
            </div>
            {gapInvalid && <p className="text-[11px] text-red-600">{copy.gapInvalid}</p>}
            {selected.size === 0 && <p className="text-[11px] text-amber-700">{copy.nothingSelected}</p>}
            {dirty && !gapInvalid && selected.size > 0 && (
              <p className="text-[11px] text-fuchsia-700">{copy.relayoutFirst}</p>
            )}
          </div>
        )}

        {tileCount === 0 ? (
          <p className="text-xs text-gray-500">{copy.noTransfers}</p>
        ) : nesting ? (
          <p className="flex items-center gap-2 py-8 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {copy.nesting}
          </p>
        ) : preview?.previewDataUrl ? (
          <div
            className={
              dirty
                ? "max-h-[45vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-100 p-2 opacity-50 sm:max-h-[50vh]"
                : "max-h-[45vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-100 p-2 sm:max-h-[50vh]"
            }
          >
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
          <p className={uvDtf ? "mt-2 text-[11px] text-red-600" : "mt-2 text-[11px] text-amber-700"}>
            {uvDtf ? t.uv.workshop.vectorPdfBlocked(preview.vectorPdfCount) : copy.vectorPdfNote(preview.vectorPdfCount)}
          </p>
        )}
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!canDownload || busy}
            onClick={() => void download()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-3 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
            {busy ? copy.building : uvDtf ? t.uv.workshop.downloadPng : copy.download}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Group-header action that nests the ticked DTF lines of the board onto one film. */
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
