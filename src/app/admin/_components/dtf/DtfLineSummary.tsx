"use client";

import { dtfGarmentTitle } from "@/lib/dtf/dtfGarmentTitle";
import { dtfSizesText } from "@/lib/dtf/dtfSizesText";
import { dtfZoneLabel } from "@/lib/dtf/dtfZones";
import { dtfZoneSizeText, toDtfPublicSummary, type DtfPublicSummary } from "@/lib/dtf/dtfPublicSummary";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { DtfZoneIcon } from "./GarmentZoneSchema";

/** One-line description of a DTF order line: garment, sizes and print zones. */
export function dtfLineSummaryText(data: DtfPublicSummary, t: TranslationDictionary, locale: string): {
  garment: string;
  sizes: string;
  zones: string;
} {
  const garment: string = data.garment
    ? dtfGarmentTitle(data.garment, t.dtf.garmentKinds[data.garment.kind], locale)
    : t.dtf.workshop.clientGarment;
  const sizes: string =
    data.garmentSource === "client"
      ? t.dtf.editor.pieces(data.quantity)
      : dtfSizesText(data.sizes, t.dtf.editor.pieces);
  const zones: string = data.zones
    .map((z) => `${dtfZoneLabel(z, t.dtf.placements)} ${dtfZoneSizeText(z, t.dtf.editor.customSizeAs)}`)
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
  const data: DtfPublicSummary | null = toDtfPublicSummary(dataRaw);
  if (!data) return null;
  return <DtfLineSummaryView data={data} t={t} className={className} />;
}

/** Garment with its colour, sizes and the print zones on a garment silhouette. */
export function DtfLineSummaryView({
  data,
  t,
  className,
}: {
  data: DtfPublicSummary;
  t: TranslationDictionary;
  className?: string;
}) {
  const { locale } = useLanguageStore();
  const { garment, sizes } = dtfLineSummaryText(data, t, locale);
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
      <ul className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-1 text-gray-500">
        {data.zones.map((z, i) => (
          <li key={i} className="inline-flex items-center gap-1">
            <DtfZoneIcon placement={z.placement} placementNote={z.placementNote} className="h-8 w-8" />
            {dtfZoneLabel(z, t.dtf.placements)} {dtfZoneSizeText(z, t.dtf.editor.customSizeAs)}
          </li>
        ))}
      </ul>
    </div>
  );
}
