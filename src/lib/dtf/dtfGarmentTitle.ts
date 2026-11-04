import type { DtfGarmentSnapshot } from "@/lib/dtf/types";
import { localizedDtfName } from "@/lib/dtf/stockGarments";

/** Item name in the viewer's language; lines priced before names were stored keep their snapshot name. */
export function dtfGarmentName(garment: Pick<DtfGarmentSnapshot, "name" | "names">, locale: string): string {
  return (garment.names ? localizedDtfName(garment.names, locale) : "") || garment.name.trim();
}

/** «белый» is in «футболка белая»: compare without the ending. */
function nameHasColor(name: string, color: string): boolean {
  const c: string = color.trim().toLowerCase();
  const stem: string = c.length > 4 ? c.slice(0, -2) : c;
  return name.toLowerCase().includes(stem);
}

/**
 * «Кепка · ERIS · чёрный» on order summaries and the workshop board: the kind
 * label, the item name in the viewer's language and the colour, without
 * repeating what the name already says («Кепка ERIS тёмно-синяя») and without
 * empty parts.
 */
export function dtfGarmentTitle(
  garment: Pick<DtfGarmentSnapshot, "name" | "names" | "colorName">,
  kindLabel: string,
  locale: string,
): string {
  const name: string = dtfGarmentName(garment, locale);
  const kind: string = kindLabel.trim();
  const color: string = garment.colorName?.trim() ?? "";
  const parts: string[] = [
    kind && !name.toLowerCase().startsWith(kind.toLowerCase()) ? kind : "",
    name,
    color && !nameHasColor(name, color) ? color : "",
  ];
  return parts.filter((p) => p).join(" · ");
}
