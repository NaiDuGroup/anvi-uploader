import { z } from "zod";

const money = z.number().min(0).max(999_999_999);

/** One entry of a method's price list: print size → retail / dealer price. */
export const printPresetSchema = z.object({
  label: z.string().trim().min(1).max(60),
  widthCm: z.number().positive().max(200),
  heightCm: z.number().positive().max(200),
  retailPrice: money,
  dealerPrice: money.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});
export type PrintPresetInput = z.infer<typeof printPresetSchema>;

export const printPresetPatchSchema = printPresetSchema.partial();
export type PrintPresetPatch = z.infer<typeof printPresetPatchSchema>;

/** Price list entry in plain numbers (what pricing code reads). */
export interface PrintPresetOption {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  retailPrice: number;
  dealerPrice: number | null;
}

/** Price list entry as the admin page edits it. */
export interface PrintPresetJson extends PrintPresetOption {
  isActive: boolean;
  sortOrder: number;
}
