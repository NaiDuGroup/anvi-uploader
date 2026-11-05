import { designFilePaperType } from "@/lib/shop/designLine";
import type { PrintSizeCm } from "@/lib/printDimensions";
import type { StudioKind } from "./document";
import { studioSurfaces } from "./surfaces";

/**
 * What the Studio print export produces for a product: one PNG over the
 * print area at the catalog dpi (`cmToPx`, as the old editors), with the old
 * editors' `paperType` (`mug_layout` …). Pure: the parity test pins it.
 */
export interface StudioExportPlan {
  pxW: number;
  pxH: number;
  dpi: number;
  /** Pixels per millimetre of the export (covers the print area exactly). */
  pxPerMm: number;
  paperType: string;
}

export function studioExportPlan(kind: StudioKind, print?: PrintSizeCm): StudioExportPlan {
  const s = studioSurfaces(kind, print)[0]!;
  return { pxW: s.pxW, pxH: s.pxH, dpi: s.dpi, pxPerMm: s.pxW / s.widthMm, paperType: designFilePaperType(kind) };
}
