import { z } from "zod";
import type { StockVariantJson } from "./adminTypes";
import type { StockUnit } from "./kinds";
import { PrinterSlotRole } from "./printerMath";

/**
 * Client-safe pieces of the «Принтеры» admin screen: request schemas, JSON
 * shapes of `/api/admin/stock/printers/**`, and small display rules.
 */

export const PRINTER_SLOT_ROLES: readonly PrinterSlotRole[] = [
  PrinterSlotRole.Ink,
  PrinterSlotRole.Toner,
  PrinterSlotRole.Film,
  PrinterSlotRole.Powder,
  PrinterSlotRole.Paper,
  PrinterSlotRole.Tape,
];

/** Stock category whose items may be loaded into a slot of this role. */
export const SLOT_ROLE_CATEGORY: Readonly<Record<PrinterSlotRole, string>> = {
  [PrinterSlotRole.Ink]: "ink",
  [PrinterSlotRole.Toner]: "toner",
  [PrinterSlotRole.Film]: "dtf_film",
  [PrinterSlotRole.Powder]: "dtf_powder",
  [PrinterSlotRole.Paper]: "sublimation_paper",
  [PrinterSlotRole.Tape]: "thermal_tape",
};

/** Categories that are printer consumables (reached via «Принтеры», not as hub cards). */
export const PRINTER_CONSUMABLE_CATEGORY_CODES: readonly string[] = Object.values(SLOT_ROLE_CATEGORY);

export function isPrinterSlotRole(value: unknown): value is PrinterSlotRole {
  return typeof value === "string" && (PRINTER_SLOT_ROLES as readonly string[]).includes(value);
}

export function categoryCodeForRole(role: PrinterSlotRole): string {
  return SLOT_ROLE_CATEGORY[role];
}

/** True when a variant from category `categoryCode` may be loaded into a slot of `role`. */
export function variantFitsRole(role: PrinterSlotRole, categoryCode: string): boolean {
  return SLOT_ROLE_CATEGORY[role] === categoryCode;
}

export function isPrinterConsumableCategory(code: string): boolean {
  return PRINTER_CONSUMABLE_CATEGORY_CODES.includes(code);
}

// ─── Request bodies ─────────────────────────────────────────────────────────

const slotLabelSchema = z.string().trim().min(1).max(60);
const sortOrderSchema = z.number().int().min(-100_000).max(100_000);
/** Ink share of the printer's total ink use, 0–1. */
export const slotShareSchema = z.number().finite().min(0).max(1);
/** Toner cartridge yield in printed sheets. */
export const slotSheetsPerUnitSchema = z.number().int().min(1).max(10_000_000);

export const printerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "empty_patch" });
export type PrinterUpdateBody = z.infer<typeof printerUpdateSchema>;

export const printerSlotUpdateSchema = z
  .object({
    label: slotLabelSchema.optional(),
    variantId: z.string().uuid().nullable().optional(),
    share: slotShareSchema.nullable().optional(),
    sheetsPerUnit: slotSheetsPerUnitSchema.nullable().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "empty_patch" });
export type PrinterSlotUpdateBody = z.infer<typeof printerSlotUpdateSchema>;

export const printerSlotCreateSchema = z.object({
  label: slotLabelSchema,
  role: z.enum(PRINTER_SLOT_ROLES as unknown as [PrinterSlotRole, ...PrinterSlotRole[]]),
  variantId: z.string().uuid().nullable().optional(),
  share: slotShareSchema.nullable().optional(),
  sheetsPerUnit: slotSheetsPerUnitSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type PrinterSlotCreateBody = z.infer<typeof printerSlotCreateSchema>;

/**
 * Field that does not apply to the slot's role (share is ink-only, yield is
 * toner-only), or null when the patch fits. Clearing (null) is always allowed.
 */
export function slotFieldRoleProblem(
  role: PrinterSlotRole,
  body: { share?: number | null; sheetsPerUnit?: number | null },
): "share" | "sheetsPerUnit" | null {
  if (body.share != null && role !== PrinterSlotRole.Ink) return "share";
  if (body.sheetsPerUnit != null && role !== PrinterSlotRole.Toner) return "sheetsPerUnit";
  return null;
}

// ─── Response JSON ──────────────────────────────────────────────────────────

export type PrinterSlotLoadedJson = {
  variant: StockVariantJson;
  item: { id: string; sku: string; nameRo: string; nameRu: string; nameEn: string; isActive: boolean };
  categoryCode: string;
  unit: StockUnit;
  /** avgCost ?? purchaseCost — what order costing uses. */
  effectiveCost: number | null;
};

export type PrinterSlotJson = {
  id: string;
  label: string;
  role: PrinterSlotRole;
  share: number | null;
  sheetsPerUnit: number | null;
  sortOrder: number;
  loaded: PrinterSlotLoadedJson | null;
};

export type PrinterJson = {
  id: string;
  code: string;
  name: string;
  technology: string;
  isActive: boolean;
  sortOrder: number;
  slots: PrinterSlotJson[];
  /** Share-weighted ink cost, MDL/ml; null without ink slots or costs. */
  inkCostPerMl: number | null;
  /** Toner cost of one printed sheet, MDL; null until yields and costs are set. */
  tonerCostPerSheet: number | null;
};

/** One loadable variant in a consumable category (for the slot select). */
export type PrinterConsumableOptionJson = {
  variantId: string;
  sku: string;
  label: string | null;
  itemId: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  stockQuantity: number;
  isActive: boolean;
};

export type PrintersResponse = {
  printers: PrinterJson[];
  /** Per role: the matching category (null when missing) and its loadable variants. */
  consumables: Record<
    PrinterSlotRole,
    { categoryId: string | null; categoryCode: string; unit: StockUnit | null; options: PrinterConsumableOptionJson[] }
  >;
};

// ─── Display rules ──────────────────────────────────────────────────────────

const SHARE_EPSILON = 0.0005;

/** Sum of ink shares (0–1 each; unset counts as 0). */
export function shareSum(shares: readonly (number | null)[]): number {
  return shares.reduce<number>((acc, s) => acc + (s != null && Number.isFinite(s) ? s : 0), 0);
}

/** «under» / «over» when ink shares don't add up to 100 %, else null. */
export function shareSumProblem(shares: readonly (number | null)[]): "under" | "over" | null {
  if (shares.length === 0) return null;
  const sum: number = shareSum(shares);
  if (sum < 1 - SHARE_EPSILON) return "under";
  if (sum > 1 + SHARE_EPSILON) return "over";
  return null;
}

/** 0.125 → 12.5 (percent with at most two decimals). */
export function shareToPercent(share: number | null): number | null {
  if (share == null || !Number.isFinite(share)) return null;
  return Math.round(share * 10000) / 100;
}

/** User input in percent → stored share; null for empty, undefined for invalid. */
export function percentInputToShare(input: string): number | null | undefined {
  const s: string = input.trim().replace(",", ".").replace(/%$/, "").trim();
  if (s === "") return null;
  const n: number = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 10000;
}

/** Yield input → whole sheets ≥ 1; null for empty, undefined for invalid. */
export function sheetsInputToYield(input: string): number | null | undefined {
  const s: string = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  const n: number = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 10_000_000) return undefined;
  return n;
}

/**
 * Unit cost for display: two decimals from 1 MDL up, more for small per-ml /
 * per-sheet costs (0.0123), never trailing noise.
 */
export function formatUnitCost(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs: number = Math.abs(value);
  const digits: number = abs >= 1 || abs === 0 ? 2 : abs >= 0.01 ? 3 : 4;
  return value.toFixed(digits);
}

/** Which footer a printer shows: ink average, toner per sheet, or none. */
export function printerFooterKind(slots: readonly { role: PrinterSlotRole }[]): "ink" | "toner" | null {
  if (slots.some((s) => s.role === PrinterSlotRole.Ink)) return "ink";
  if (slots.some((s) => s.role === PrinterSlotRole.Toner)) return "toner";
  return null;
}

/** Colour chip for a slot label (CMYK, light C/M, White, Varnish); null for non-colour slots. */
export function slotChipColor(label: string): string | null {
  const s: string = label.trim().toLowerCase();
  if (/^(lc|light ?cyan.*|светло-?голуб.*)$/.test(s)) return "#7FD6F7";
  if (/^(lm|light ?magenta.*|светло-?(пурпур|маджент).*)$/.test(s)) return "#F59AC9";
  if (/^(c|cyan.*|циан.*|голуб.*)$/.test(s)) return "#00AEEF";
  if (/^(m|magenta.*|маджент.*|пурпур.*)$/.test(s)) return "#EC008C";
  if (/^(y|yellow.*|жёлт.*|желт.*|galben.*)$/.test(s)) return "#FFE600";
  if (/^(k|black.*|ч[её]рн.*|negru.*)$/.test(s)) return "#231F20";
  if (/^(w|white.*|бел.*|alb.*)$/.test(s)) return "#FFFFFF";
  if (/^(varnish.*|лак.*|lac.*)$/.test(s)) return "#E5E7EB";
  return null;
}
