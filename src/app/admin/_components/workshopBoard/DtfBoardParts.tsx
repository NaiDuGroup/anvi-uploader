"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, ScanLine, Stamp, X } from "lucide-react";
import { formatNumber } from "@/lib/dtf/dtfClientApi";
import { buildDtfFilmLayout, type DtfFilmLayout } from "@/lib/dtf/dtfFilmLayout";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type {
  DtfFilmSpec,
  DtfLineFacts,
  WorkshopBoardGroup,
} from "@/lib/workshopBoard/types";

const LAYOUT_PDF_URL = "/api/workshop-board/layout-pdf";

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
          </li>
        ))}
      </ul>
    </div>
  );
}

async function downloadLayoutPdf(layout: DtfFilmLayout, failedText: string): Promise<void> {
  const res = await fetch(LAYOUT_PDF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      materialLabel: "DTF",
      printableWidthCm: layout.pack.printableWidthCm,
      totalAlongCm: layout.pack.totalAlongCm,
      placements: layout.pack.placements,
      tiles: layout.tileFiles,
    }),
  });
  const body = (await res.json().catch(() => null)) as { downloadUrl?: string; error?: string } | null;
  if (!res.ok || !body?.downloadUrl) throw new Error(body?.error ?? failedText);
  const anchor = document.createElement("a");
  anchor.href = body.downloadUrl;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function FilmPreview({ layout }: { layout: DtfFilmLayout }) {
  const { pack } = layout;
  const withArtwork = new Set<string>(layout.tileFiles.map((f) => f.tileId));
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-100 p-2">
      <svg
        viewBox={`0 0 ${pack.printableWidthCm} ${Math.max(pack.totalAlongCm, 1)}`}
        className="mx-auto block w-full max-w-sm bg-white"
        role="img"
      >
        {pack.placements.map((p) => (
          <g key={p.tileId}>
            <rect
              x={p.xCm}
              y={p.yCm}
              width={p.widthCm}
              height={p.heightCm}
              className={withArtwork.has(p.tileId) ? "fill-fuchsia-100 stroke-fuchsia-500" : "fill-amber-100 stroke-amber-500"}
              strokeWidth={0.15}
            />
            <text
              x={p.xCm + p.widthCm / 2}
              y={p.yCm + p.heightCm / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(1.6, p.widthCm / 8)}
              className="fill-gray-700"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DtfFilmLayoutModal({
  group,
  film,
  onClose,
}: {
  group: WorkshopBoardGroup;
  film: DtfFilmSpec;
  onClose: () => void;
}) {
  const { t, locale } = useLanguageStore();
  const copy = t.dtf.workshop;
  const layout: DtfFilmLayout = useMemo(() => buildDtfFilmLayout(group.lines, film), [group.lines, film]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const tileCount: number = layout.pack.placements.length + layout.pack.unplacedTileIds.length;
  const canDownload: boolean =
    tileCount > 0 && layout.missingArtworkCount === 0 && layout.pack.unplacedTileIds.length === 0;

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await downloadLayoutPdf(layout, copy.downloadFailed);
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
        aria-label={copy.filmLayoutTitle}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{copy.filmLayoutTitle}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {copy.filmWidth(film.printableWidthCm)} · {copy.transfers(tileCount)} ·{" "}
              {copy.filmLength(formatNumber(layout.pack.totalAlongCm / 100, locale))}
            </p>
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
        ) : (
          <FilmPreview layout={layout} />
        )}

        {layout.missingArtworkCount > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">{copy.missingArtwork(layout.missingArtworkCount)}</p>
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
      {open && <DtfFilmLayoutModal group={group} film={film} onClose={() => setOpen(false)} />}
    </>
  );
}
