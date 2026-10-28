"use client";

import type { TranslationDictionary } from "@/lib/i18n/types";
import { uvItemDisplayName } from "@/lib/uv/stockItems";
import { uvZoneSizeLabel } from "@/lib/uv/uvPublicSummary";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import type { UvLineData, UvLineZone } from "@/lib/uv/types";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** «Лицевая сторона 14.5×21 см · подложка ×1 · лак · праймер». */
export function uvZoneText(z: UvLineZone, t: TranslationDictionary): string {
  const place: string = z.placementLabel ?? t.uv.placements[z.placement];
  const size: string = uvZoneSizeLabel(z);
  return [
    `${place} ${size}`,
    z.whiteLayers > 0 ? t.uv.workshop.white(z.whiteLayers) : null,
    z.varnish ? t.uv.workshop.varnish : null,
    z.primer ? t.uv.workshop.primer : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One-line description of a UV order line: item, quantity and print zones. */
export function uvLineSummaryText(
  data: UvLineData,
  t: TranslationDictionary,
  locale: string,
): { item: string; notes: string | null; quantity: string; zones: string } {
  const item: string = data.item
    ? uvItemDisplayName(data.item, locale)
    : `${t.uv.workshop.clientItem}: ${data.clientItem?.description ?? "—"}`;
  return {
    item,
    notes: data.clientItem?.notes ?? null,
    quantity: t.uv.editor.pieces(data.quantity),
    zones: data.zones.map((z) => uvZoneText(z, t)).join(", "),
  };
}

export function UvLineSummary({
  dataRaw,
  t,
  className,
}: {
  dataRaw: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const locale: string = useLanguageStore((s) => s.locale);
  const data: UvLineData | null = parseUvLineData(dataRaw);
  if (!data) return null;
  const { item, notes, quantity, zones } = uvLineSummaryText(data, t, locale);
  return (
    <div className={cn("text-xs leading-snug text-gray-700", className)}>
      <p className="flex items-center gap-1.5 font-medium text-gray-900">
        {data.item?.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: data.item.colorHex }}
            aria-hidden
          />
        )}
        {item}
      </p>
      {notes && <p className="text-gray-500">{notes}</p>}
      <p className="tabular-nums">{quantity}</p>
      <p className="text-gray-500">{zones}</p>
    </div>
  );
}
