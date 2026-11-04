import { parseDtfLineData } from "./parseDtfLineData";
import type { DtfLineData } from "./types";

/** Customer-safe view of a DTF line: what is printed on what, without costs or margins. */
export type DtfPublicSummary = {
  garmentSource: DtfLineData["garmentSource"];
  garment: Pick<NonNullable<DtfLineData["garment"]>, "kind" | "name" | "names" | "colorName" | "colorHex"> | null;
  quantity: number;
  sizes: { size: string; quantity: number }[];
  zones: {
    placement: DtfLineData["zones"][number]["placement"];
    placementNote?: string;
    presetLabel: string;
    /** Typed size (a cap logo 9×5) priced as `presetLabel`; absent = the format's own size. */
    customSize?: { widthCm: number; heightCm: number };
  }[];
};

export function toDtfPublicSummary(raw: unknown): DtfPublicSummary | null {
  const data: DtfLineData | null = parseDtfLineData(raw);
  if (!data) return null;
  return {
    garmentSource: data.garmentSource,
    garment: data.garment
      ? {
          kind: data.garment.kind,
          name: data.garment.name,
          ...(data.garment.names ? { names: data.garment.names } : {}),
          colorName: data.garment.colorName,
          colorHex: data.garment.colorHex ?? null,
        }
      : null,
    quantity: data.quantity,
    sizes: data.sizes.map((s) => ({ size: s.size, quantity: s.quantity })),
    zones: data.zones.map((z) => ({
      placement: z.placement,
      ...(z.placementNote ? { placementNote: z.placementNote } : {}),
      presetLabel: z.presetLabel,
      ...(z.customSize ? { customSize: { widthCm: z.widthCm, heightCm: z.heightCm } } : {}),
    })),
  };
}


/** «9×5» (cm, comma decimals dropped to one place). */
export function dtfCmSizeText(widthCm: number, heightCm: number): string {
  const f = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
  return `${f(widthCm)}×${f(heightCm)}`;
}

/** Print size of a zone for staff: the format, or the typed size with the format it is priced as. */
export function dtfZoneSizeText(
  zone: DtfPublicSummary["zones"][number],
  customSizeAs: (size: string, preset: string) => string,
): string {
  return zone.customSize
    ? customSizeAs(dtfCmSizeText(zone.customSize.widthCm, zone.customSize.heightCm), zone.presetLabel)
    : zone.presetLabel;
}
