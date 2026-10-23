import { parseDtfLineData } from "./parseDtfLineData";
import type { DtfLineData } from "./types";

/** Customer-safe view of a DTF line: what is printed on what, without costs or margins. */
export type DtfPublicSummary = {
  garmentSource: DtfLineData["garmentSource"];
  garment: Pick<NonNullable<DtfLineData["garment"]>, "kind" | "name" | "colorName"> | null;
  quantity: number;
  sizes: { size: string; quantity: number }[];
  zones: { placement: DtfLineData["zones"][number]["placement"]; presetLabel: string }[];
};

export function toDtfPublicSummary(raw: unknown): DtfPublicSummary | null {
  const data: DtfLineData | null = parseDtfLineData(raw);
  if (!data) return null;
  return {
    garmentSource: data.garmentSource,
    garment: data.garment
      ? { kind: data.garment.kind, name: data.garment.name, colorName: data.garment.colorName }
      : null,
    quantity: data.quantity,
    sizes: data.sizes.map((s) => ({ size: s.size, quantity: s.quantity })),
    zones: data.zones.map((z) => ({ placement: z.placement, presetLabel: z.presetLabel })),
  };
}

