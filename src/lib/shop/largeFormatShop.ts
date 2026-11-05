import "server-only";
import type { Prisma } from "@prisma/client";
import { AdminOrderResolveError, type ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import { fetchFamilyRolls } from "@/lib/largeFormat/lfFamilyBilling";
import { findLfPricingMaterials, type LfPricingMaterial } from "@/lib/largeFormat/lfMaterialStock";
import { LF_KITS } from "@/lib/largeFormat/lfKits";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import { lfMaterialFamilyKey } from "@/lib/largeFormat/lfMaterialFamily";
import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import { resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { prisma } from "@/lib/prisma";
import { PrinterCode } from "@/lib/stock/unified/printerMath";
import { printerInkCostPerMl } from "@/lib/stock/unified/printers";
import {
  SHOP_LF_MATERIALS,
  SHOP_LF_MATERIAL_FAMILY,
  SHOP_LF_RULES,
  shopLfLineProblem,
  type ShopLfMaterial,
  type ShopLfQuote,
} from "@/lib/storefront/largeFormat";
import type { AdminOrderLineInput, FileInput } from "@/lib/validations";
import { lfPresetFloorMdl, lfShopLineTotalMdl, lfShopUnitPriceMdl, type LfShopPricingContext } from "./lfShopUnitPrice";

/**
 * Storefront wide-format lines on the studio's own pipeline: a shop line
 * becomes exactly the order line the studio wizard would create (material or
 * material family, size, copies, size preset, finishing, roll-up set), and is
 * priced by `resolveOrderLines` — the function the wizard's order goes
 * through. The quote and the checkout both call {@link resolveShopLfLine}, so
 * the price the customer sees is the price on the order line.
 *
 * Each shop line is priced on its own (no pooling of several cart lines on
 * one roll): the cart quote and the order agree line by line.
 */

/** One active roll as the shop needs it (no cost, no stock). */
export interface ShopLfRoll {
  id: string;
  name: string;
  printableWidthCm: number;
  presets: { id: string; widthCm: number; heightCm: number; retailPriceMdl: number }[];
}

export interface ShopLfMaterialInfo {
  key: ShopLfMaterial;
  /** Family key as derived from the roll names (for family pricing). */
  familyKey: string;
  rolls: ShopLfRoll[];
  /** Widest printable width of the family, cm. */
  maxPrintableWidthCm: number;
  /** Canvas: mirrored wrap per side (cm), added to the face for the roll. */
  wrapCm: number;
}

export type ShopLfMaterials = Partial<Record<ShopLfMaterial, ShopLfMaterialInfo>>;

interface RollRow {
  id: string;
  name: string;
  rollWidthMeters: { toString(): string };
  printableWidthMeters: { toString(): string } | null;
  sizePresets: { id: string; widthCm: number; heightCm: number; retailPriceMdl: number; isActive: boolean }[];
}

function rollOf(r: RollRow): ShopLfRoll {
  const printableM: number = resolveEffectivePrintableWidthMeters({
    printableWidthMeters: r.printableWidthMeters?.toString() ?? null,
    rollWidthMeters: r.rollWidthMeters.toString(),
  });
  return {
    id: r.id,
    name: r.name,
    printableWidthCm: Math.round(printableM * 1000) / 10,
    presets: r.sizePresets
      .filter((p) => p.isActive)
      .map((p) => ({ id: p.id, widthCm: p.widthCm, heightCm: p.heightCm, retailPriceMdl: p.retailPriceMdl })),
  };
}

/** Group active rolls into the shop materials (pure; rows sorted by width). */
export function mapShopLfMaterials(rows: readonly RollRow[]): ShopLfMaterials {
  const out: ShopLfMaterials = {};
  for (const key of SHOP_LF_MATERIALS) {
    const members = rows.filter((r) => lfMaterialFamilyKey(r.name).toLowerCase() === SHOP_LF_MATERIAL_FAMILY[key]);
    if (members.length === 0) continue;
    const rolls: ShopLfRoll[] = members.map(rollOf);
    out[key] = {
      key,
      familyKey: lfMaterialFamilyKey(members[0]!.name),
      rolls,
      maxPrintableWidthCm: Math.max(...rolls.map((r) => r.printableWidthCm)),
      wrapCm: resolveGalleryWrapCm(members[0]!.name),
    };
  }
  return out;
}

const ROLL_SELECT = {
  id: true,
  name: true,
  rollWidthMeters: true,
  printableWidthMeters: true,
  sizePresets: {
    select: { id: true, widthCm: true, heightCm: true, retailPriceMdl: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { widthCm: "asc" }],
  },
} satisfies Prisma.LargeFormatMaterialSelect;

/** Active wide-format rolls, by width (narrowest first). */
async function loadActiveRolls(): Promise<RollRow[]> {
  return prisma.largeFormatMaterial.findMany({
    where: { isActive: true },
    orderBy: [{ rollWidthMeters: "asc" }, { sortOrder: "asc" }],
    select: ROLL_SELECT,
  });
}

/** The shop materials from the admin's roll catalog (no costs). */
export async function loadShopLfMaterials(): Promise<ShopLfMaterials> {
  return mapShopLfMaterials(await loadActiveRolls());
}

export class ShopLfLineError extends Error {
  constructor(
    readonly code: string,
    readonly reason: "invalid" | "price_unavailable" = "invalid",
  ) {
    super(code);
  }
}

/** Material, size and preset of a non-set line → the wizard's order-line fields. */
function plainLineInput(line: ShopLfQuote, materials: ShopLfMaterials): Partial<AdminOrderLineInput> {
  const info = line.material ? materials[line.material] : undefined;
  if (!info) throw new ShopLfLineError("lf_material_unavailable", "price_unavailable");
  const w: number = line.widthCm!;
  const h: number = line.heightCm!;
  // The roll must take the short side (the packer rotates when it helps).
  if (Math.min(w, h) + 2 * info.wrapCm > info.maxPrintableWidthCm + 1e-9) throw new ShopLfLineError("lf_too_wide");
  let lfSizePresetId: string | null = null;
  let roll: ShopLfRoll | null = null;
  if (line.preset) {
    for (const r of info.rolls) {
      const p = r.presets.find((x) => (x.widthCm === w && x.heightCm === h) || (x.widthCm === h && x.heightCm === w));
      if (p) {
        lfSizePresetId = p.id;
        roll = r;
        break;
      }
    }
    if (!lfSizePresetId) throw new ShopLfLineError("lf_preset_unknown");
  }
  // A preset belongs to one roll; a family of several rolls is priced on its cheapest roll (wizard «семейство»).
  const target =
    roll != null
      ? { largeFormatMaterialId: roll.id }
      : info.rolls.length > 1
        ? { materialFamilyKey: info.familyKey }
        : { largeFormatMaterialId: info.rolls[0]!.id };
  return { ...target, printWidthCm: w, printHeightCm: h, lfSizePresetId, ...(line.finishing ? { lfFinishing: line.finishing } : {}) };
}

/** Roll-up / X-banner: the narrowest roll of the set's media that takes the print. */
function kitLineInput(line: ShopLfQuote, rows: readonly RollRow[]): Partial<AdminOrderLineInput> {
  const kit = LF_KITS[line.kit!];
  const fits = rows
    .filter((r) => kit.materialPattern.test(r.name))
    .map(rollOf)
    .filter((r) => r.printableWidthCm + 1e-9 >= Math.min(kit.printWidthCm, kit.printHeightCm))
    .sort((a, b) => a.printableWidthCm - b.printableWidthCm);
  const roll = fits[0];
  if (!roll) throw new ShopLfLineError("lf_material_unavailable", "price_unavailable");
  return {
    largeFormatMaterialId: roll.id,
    printWidthCm: kit.printWidthCm,
    printHeightCm: kit.printHeightCm,
    lfSizePresetId: null,
    lfKit: kit.id,
  };
}

/**
 * The studio order line of a shop wide-format line (retail): one file, its
 * copies = the pieces, `paperType` «large_format» — as the wizard saves it.
 */
export async function shopLfOrderLineInput(
  line: ShopLfQuote,
  files: FileInput[] = [],
  rolls?: readonly RollRow[],
): Promise<AdminOrderLineInput> {
  const problem: string | null = shopLfLineProblem(line);
  if (problem) throw new ShopLfLineError(problem);
  const rows: readonly RollRow[] = rolls ?? (await loadActiveRolls());
  const fields = line.kit ? kitLineInput(line, rows) : plainLineInput(line, mapShopLfMaterials(rows));
  return {
    productType: "large_format_print",
    customerType: "retail",
    quantity: line.quantity,
    ...fields,
    files: files.map((f) => ({ ...f, copies: line.quantity, paperType: "large_format" })),
  } as AdminOrderLineInput;
}

/** Rolls, settings and ink cost the per-piece price needs (same sources as the order pipeline). */
async function loadShopLfPricingContext(input: AdminOrderLineInput): Promise<LfShopPricingContext | null> {
  let materials: LfPricingMaterial[];
  if (input.materialFamilyKey) {
    const familyRolls = await fetchFamilyRolls(prisma, input.materialFamilyKey);
    const rows = await findLfPricingMaterials(prisma, { where: { id: { in: familyRolls.map((r) => r.id) }, isActive: true } });
    const byId = new Map(rows.map((m) => [m.id, m]));
    materials = familyRolls.map((r) => byId.get(r.id)).filter((m): m is LfPricingMaterial => m != null);
  } else if (input.largeFormatMaterialId) {
    materials = await findLfPricingMaterials(prisma, { where: { id: input.largeFormatMaterialId, isActive: true } });
  } else {
    return null;
  }
  if (materials.length === 0) return null;
  const acct = await getOrCreateAccountingSettings();
  return {
    materials,
    family: !!input.materialFamilyKey,
    prod: parseProductionCostsJson(acct.productionCosts),
    avgInkCostPerMlMdl: (await printerInkCostPerMl(prisma, PrinterCode.LargeFormat)) ?? 0,
    galleryWrapCm: resolveGalleryWrapCm(materials[0]!.name),
  };
}

/**
 * Shop price of a custom-size line: whole lei per piece, never more per piece
 * for more pieces (`lfShopUnitPrice.ts`), and never below a fixed size of the
 * material that fits inside it. Returns the line data with that total (the
 * difference to the studio formula is booked on the material sell).
 */
export function withShopLfUnitPrice(data: LargeFormatLineData, unitMdl: number): LargeFormatLineData {
  const total: number = unitMdl * data.quantity;
  const delta: number = total - data.totalSellPrice;
  if (delta === 0) return { ...data, shopUnitPriceMdl: unitMdl };
  const directCost: number = data.totalDirectCostMdl ?? data.materialCost;
  return {
    ...data,
    shopUnitPriceMdl: unitMdl,
    shopPriceAdjustMdl: delta,
    materialSellPrice: data.materialSellPrice + delta,
    totalSellPrice: total,
    estimatedProfit: total - directCost,
    marginPercent: total > 0 ? Math.round(((total - directCost) / total) * 10000) / 100 : 0,
  };
}

/**
 * Resolve a shop wide-format line through the order pipeline. Throws
 * {@link ShopLfLineError} with a stable code. The quote and the checkout both
 * call it, so they agree on the price (custom sizes: whole lei per piece).
 */
export async function resolveShopLfLine(
  line: ShopLfQuote,
  files: FileInput[] = [],
): Promise<{ resolved: ResolvedAdminOrderLine; data: LargeFormatLineData; totalMdl: number }> {
  const rows: RollRow[] = await loadActiveRolls();
  const input: AdminOrderLineInput = await shopLfOrderLineInput(line, files, rows);
  let resolved: ResolvedAdminOrderLine;
  try {
    resolved = (await resolveOrderLines([input])).resolved[0]!;
  } catch (e) {
    if (e instanceof AdminOrderResolveError) {
      throw new ShopLfLineError(e.message === "lf_pack_does_not_fit" ? "lf_too_wide" : e.message);
    }
    throw e;
  }
  let data = resolved.largeFormatExtras?.largeFormatLineData as unknown as LargeFormatLineData | undefined;
  if (!data) throw new ShopLfLineError("lf_resolve_failed");
  if (!line.kit && !line.preset) {
    const ctx = await loadShopLfPricingContext(input);
    const piece = { widthCm: line.widthCm!, heightCm: line.heightCm!, finishing: line.finishing ?? null };
    const unit: number | null = ctx ? lfShopUnitPriceMdl((k) => lfShopLineTotalMdl(ctx, piece, k), line.quantity) : null;
    if (unit != null) {
      // Posters sell fixed sizes and «Altă mărime» side by side: the custom size is never the cheaper way to buy a fixed size.
      const presets =
        SHOP_LF_RULES[line.product].sizing === "both" && line.material
          ? (mapShopLfMaterials(rows)[line.material]?.rolls ?? []).flatMap((r) => r.presets)
          : [];
      const unitMdl: number = Math.max(unit, lfPresetFloorMdl(presets, line.widthCm!, line.heightCm!));
      data = withShopLfUnitPrice(data, unitMdl);
      resolved = {
        ...resolved,
        largeFormatExtras: {
          ...resolved.largeFormatExtras!,
          largeFormatLineData: data as unknown as Prisma.InputJsonValue,
        },
      };
    }
  }
  return { resolved, data, totalMdl: data.totalSellPrice };
}
