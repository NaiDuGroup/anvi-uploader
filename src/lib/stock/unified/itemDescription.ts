import { z } from "zod";

/** Client-facing description of a stock item, per language. */
export type StockItemDescription = { ru: string; ro: string; en: string };

const textSchema = z.string().trim().max(4000);

export const stockItemDescriptionSchema = z.object({
  ru: textSchema.default(""),
  ro: textSchema.default(""),
  en: textSchema.default(""),
});

/** Tolerant read of `StockItem.description`; null when every language is empty. */
export function parseStockItemDescription(raw: unknown): StockItemDescription | null {
  const parsed = stockItemDescriptionSchema.safeParse(raw ?? {});
  if (!parsed.success) return null;
  const d = parsed.data;
  return d.ru || d.ro || d.en ? d : null;
}

/** Text for the UI language, falling back to the other languages. */
export function localizedDescription(desc: StockItemDescription | null | undefined, locale: string): string {
  if (!desc) return "";
  const first = locale === "ru" ? desc.ru : locale === "en" ? desc.en : desc.ro;
  return first || desc.ru || desc.ro || desc.en || "";
}
