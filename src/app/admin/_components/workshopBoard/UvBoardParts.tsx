"use client";

import { Sparkles } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { UvLineFacts, UvZoneFacts } from "@/lib/workshopBoard/types";
import { useLanguageStore } from "@/stores/useLanguageStore";

function zoneText(z: UvZoneFacts, t: TranslationDictionary): string {
  const place: string = z.placementLabel ?? t.uv.placements[z.placement];
  const size: string = z.customSize ? `${z.widthCm}×${z.heightCm}` : z.presetLabel;
  return [
    `${place} · ${size}`,
    z.whiteLayers > 0 ? t.uv.workshop.white(z.whiteLayers) : null,
    z.varnish ? t.uv.workshop.varnish : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Board line summary: item (ours or the client's), quantity and the zones printed on each piece. */
export function UvBoardLineSummary({ facts }: { facts: UvLineFacts }) {
  const { t } = useLanguageStore();
  const item: string =
    facts.itemName ?? `${t.uv.workshop.clientItem}: ${facts.clientItemDescription ?? "—"}`;
  return (
    <div className="space-y-1 text-[11px] text-gray-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="h-3 w-3 shrink-0 text-indigo-600" aria-hidden />
        {facts.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: facts.colorHex }}
            aria-hidden
          />
        )}
        <span className="max-w-[16rem] truncate font-medium text-gray-800" title={item}>
          {item}
        </span>
        {facts.sku && (
          <>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="font-mono text-gray-500">{facts.sku}</span>
          </>
        )}
        <span className="text-gray-300" aria-hidden>·</span>
        <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-semibold leading-none text-indigo-800">
          {t.admin.orderSkuPiecesBadge(facts.quantity)}
        </span>
      </div>
      {facts.clientItemNotes && <p className="text-gray-500">{facts.clientItemNotes}</p>}
      <ul className="flex flex-wrap gap-1">
        {facts.zones.map((z) => (
          <li
            key={z.zoneId}
            className={
              z.fileId
                ? "rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5"
                : "rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800"
            }
          >
            {zoneText(z, t)}
          </li>
        ))}
      </ul>
    </div>
  );
}
