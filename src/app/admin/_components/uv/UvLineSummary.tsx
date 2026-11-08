"use client";

import type { TranslationDictionary } from "@/lib/i18n/types";
import { uvItemDisplayName } from "@/lib/uv/stockItems";
import { toUvPublicSummary, type UvPublicSummary } from "@/lib/uv/uvPublicSummary";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { UvItemPhotoThumb } from "./UvItemPhotoThumb";

type UvSummaryZone = UvPublicSummary["zones"][number];

/** «Лицевая сторона 14.5×21 см · подложка ×1 · лак · праймер» (white / primer on staff views only). */
export function uvZoneText(z: UvSummaryZone, t: TranslationDictionary): string {
  const place: string = z.placementLabel ?? t.uv.placements[z.placement];
  return [
    `${place} ${z.sizeLabel}`,
    z.whiteLayers != null && z.whiteLayers > 0 ? t.uv.workshop.white(z.whiteLayers) : null,
    z.varnish ? t.uv.workshop.varnish : null,
    z.primer ? t.uv.workshop.primer : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One-line description of a UV order line: item, quantity and print zones. */
export function uvLineSummaryText(
  data: UvPublicSummary,
  t: TranslationDictionary,
  locale: string,
): { item: string; notes: string | null; quantity: string; zones: string } {
  const item: string = data.item
    ? uvItemDisplayName(data.item, locale)
    : data.giftSetItem
      ? (data.clientItemDescription ?? "—")
      : data.source === "stickers"
      ? t.uv.workshop.stickers
      : `${t.uv.workshop.clientItem}: ${data.clientItemDescription ?? "—"}`;
  return {
    item,
    notes: data.clientItemNotes ?? null,
    quantity: t.uv.editor.pieces(data.quantity),
    zones: data.zones.map((z) => uvZoneText(z, t)).join(", "),
  };
}

export function UvLineSummary({
  dataRaw,
  setData,
  t,
  className,
}: {
  dataRaw: unknown;
  /** The line's «Набор» data: a ready set's zone line names the set's item, not a client item. */
  setData?: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const data: UvPublicSummary | null = toUvPublicSummary(dataRaw, { production: true, setData });
  if (!data) return null;
  return <UvLineSummaryView data={data} t={t} className={className} />;
}

/** Item with its colour, quantity and print zones; renders whatever the summary carries. */
export function UvLineSummaryView({
  data,
  t,
  className,
}: {
  data: UvPublicSummary;
  t: TranslationDictionary;
  className?: string;
}) {
  const locale: string = useLanguageStore((s) => s.locale);
  const { item, notes, quantity, zones } = uvLineSummaryText(data, t, locale);
  const sizeLabel: string | null = data.clientItemSizeLabel ?? null;
  return (
    <div className={cn("flex items-start gap-2 text-xs leading-snug text-gray-700", className)}>
      {data.clientItemPhoto && <UvItemPhotoThumb photo={data.clientItemPhoto} label={t.uv.workshop.itemPhoto} size="md" />}
      <div className="min-w-0">
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
      {sizeLabel && <p className="tabular-nums text-gray-600">{t.uv.workshop.itemSize(sizeLabel)}</p>}
      {notes && <p className="text-gray-500">{notes}</p>}
      <p className="tabular-nums">{quantity}</p>
      <p className="text-gray-500">{zones}</p>
      </div>
    </div>
  );
}
