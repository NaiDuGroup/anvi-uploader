"use client";

import { Pencil } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n";

/**
 * «Изменён дилером 05.11 14:20»: the dealer changed positions / files of the
 * order from the cabinet (`Order.dealerEditedAt`). Shown on the staff orders
 * list and the workshop board. There is no tracking of staff downloads, so
 * this marker is the only hint that an already downloaded file may be stale.
 */
export function DealerEditedBadge({ at, t }: { at: string; t: TranslationDictionary }) {
  const when = new Date(at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const label = t.dealerOrder.adminEditedBadge(when);
  return (
    <span
      data-testid="dealer-edited-badge"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-300"
      title={label}
    >
      <Pencil className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
