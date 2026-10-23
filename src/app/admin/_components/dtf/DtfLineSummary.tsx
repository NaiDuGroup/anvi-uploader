"use client";

import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import type { DtfLineData } from "@/lib/dtf/types";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/** One-line description of a DTF order line: garment, sizes and print zones. */
export function dtfLineSummaryText(data: DtfLineData, t: TranslationDictionary): {
  garment: string;
  sizes: string;
  zones: string;
} {
  const garment: string = data.garment
    ? `${t.dtf.garmentKinds[data.garment.kind]} · ${data.garment.name} · ${data.garment.colorName}`
    : t.dtf.workshop.clientGarment;
  const sizes: string =
    data.garmentSource === "client"
      ? t.dtf.editor.pieces(data.quantity)
      : data.sizes.map((s) => `${s.size}×${s.quantity}`).join("  ");
  const zones: string = data.zones
    .map((z) => `${t.dtf.placements[z.placement]} ${z.presetLabel}`)
    .join(", ");
  return { garment, sizes, zones };
}

export function DtfLineSummary({
  dataRaw,
  t,
  className,
}: {
  dataRaw: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const data: DtfLineData | null = parseDtfLineData(dataRaw);
  if (!data) return null;
  const { garment, sizes, zones } = dtfLineSummaryText(data, t);
  return (
    <div className={cn("text-xs leading-snug text-gray-700", className)}>
      <p className="flex items-center gap-1.5 font-medium text-gray-900">
        {data.garment?.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: data.garment.colorHex }}
            aria-hidden
          />
        )}
        {garment}
      </p>
      <p className="tabular-nums">{sizes}</p>
      <p className="text-gray-500">{zones}</p>
    </div>
  );
}
