import "server-only";
import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma, HEAVY_TX_OPTIONS } from "@/lib/prisma";
import { loadDtfSettings, loadDtfStockGarments, resolveDtfLine } from "@/lib/dtf/resolveDtfLine";
import { DtfLineError } from "@/lib/dtf/dtfLineCalc";
import { deductDtfLineStock } from "@/lib/dtf/dtfOrderStock";
import { orderConsentSchema } from "@/lib/validations";
import { dtfZoneFilePaperType } from "@/lib/dtf/dtfConstants";
import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import type { DtfCustomerType, DtfLineData } from "@/lib/dtf/types";
import { procurementMetaToJson } from "@/lib/orderProcurement";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { TSHIRT_CATEGORY_CODE, TSHIRT_SIDES, fitsTshirtArea, isSleeve, printAreaForSizes, sizePrintArea } from "./tshirtRules";

/** Sleeve print limits from the DTF settings (Depozit → DTF): largest side and retail price per sleeve. */
export async function loadTshirtSleeve(): Promise<{ maxCm: number; priceMdl: number }> {
  const st = await loadDtfSettings();
  return { maxCm: st.sleeveMaxCm, priceMdl: st.sleevePriceRetailMdl };
}

// ─── Public catalog ─────────────────────────────────────────────────────────

export type TshirtCatalogGarment = {
  /** `<stockItemId>:<colorKey>` — the DTF garment id. */
  id: string;
  stockItemId: string;
  names: { ro: string; ru: string; en: string };
  colorName: string;
  colorHex: string | null;
  sizes: { size: string; inStock: number }[];
  /** Lowest retail garment price (from the biggest quantity tier), MDL. */
  fromPriceMdl: number | null;
};

/** Sizes the designer doesn't offer (still in stock for the admin's own orders). */
export const TSHIRT_HIDDEN_SIZES: readonly string[] = ["XXXL", "3XL"];
const isHiddenSize = (size: string) => TSHIRT_HIDDEN_SIZES.includes(size.trim().toUpperCase());

/** T-shirts offered in the designer: active stock items of the t-shirt category, per colour. No costs. */
export async function loadTshirtCatalog(): Promise<TshirtCatalogGarment[]> {
  const garments: DtfGarmentJson[] = await loadDtfStockGarments();
  return garments
    .map((g) => ({ ...g, variants: g.variants.filter((v) => !isHiddenSize(v.size)) }))
    .filter((g) => g.categoryCode === TSHIRT_CATEGORY_CODE && g.variants.length > 0)
    .map((g) => {
      const prices = g.variants.flatMap((v) => v.priceTiers.map((t) => t.priceMdl));
      return {
        id: g.id,
        stockItemId: g.stockItemId,
        names: g.itemNames,
        colorName: g.colorName,
        colorHex: g.colorHex,
        sizes: g.variants.map((v) => ({ size: v.size, inStock: Math.max(0, Math.floor(v.stockQuantity)) })),
        fromPriceMdl: prices.length ? Math.min(...prices) : null,
      };
    });
}

// ─── Quote / order input ────────────────────────────────────────────────────

const zoneSchema = z.object({
  placement: z.enum(TSHIRT_SIDES),
  widthCm: z.number().positive().max(100),
  heightCm: z.number().positive().max(100),
});

export const tshirtQuoteSchema = z.object({
  garmentId: z.string().min(3).max(200),
  sizes: z
    .array(z.object({ size: z.string().trim().min(1).max(16), quantity: z.number().int().min(1).max(1000) }))
    .min(1)
    .max(20),
  zones: z.array(zoneSchema).min(1).max(TSHIRT_SIDES.length),
});

const layerSchema = z.record(z.string(), z.unknown());

export const tshirtOrderSchema = tshirtQuoteSchema.extend({
  phone: z.string().trim().min(8).max(32),
  name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  /** The required consent checkbox (files checked + personal data), as on the other guest forms. */
  consent: orderConsentSchema,
  /** One id per order the client sends: a retry or a double click with the same id gets the same order back. */
  requestId: z.string().trim().min(8).max(64).optional(),
  zones: z
    .array(
      zoneSchema.extend({
        /** Print PNG uploaded through /api/upload-url (order scope). */
        fileKey: z.string().startsWith("uploads/").max(500),
        mockupKey: z.string().startsWith("uploads/").max(500).optional(),
        /** Design top below the collar and its middle from the centre line (+ = right as you look at that side). */
        positionCm: z
          .object({ fromCollarCm: z.number().min(0).max(90), fromCenterCm: z.number().min(-40).max(40) })
          .optional(),
        layers: z.array(layerSchema).max(40),
        /**
         * The print of each ordered size: the design is made on M and scaled per size (S smaller,
         * XXL bigger). One file per size; absent (older pages): the zone's file for every size.
         */
        perSize: z
          .array(
            z.object({
              size: z.string().trim().min(1).max(16),
              widthCm: z.number().positive().max(100),
              heightCm: z.number().positive().max(100),
              fileKey: z.string().startsWith("uploads/").max(500),
              positionCm: z
                .object({ fromCollarCm: z.number().min(0).max(90), fromCenterCm: z.number().min(-40).max(40) })
                .optional(),
            }),
          )
          .max(20)
          .optional(),
      }),
    )
    .min(1)
    .max(TSHIRT_SIDES.length),
});

export type TshirtQuoteInput = z.infer<typeof tshirtQuoteSchema>;
export type TshirtOrderInput = z.infer<typeof tshirtOrderSchema>;

export class TshirtOrderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** File-name part for the workshop: "guler12cm_centru" / "guler8cm_dreapta9cm" / "guler8cm_stanga9cm". */
export function positionLabel(p: { fromCollarCm: number; fromCenterCm: number }): string {
  const n = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  const side = Math.abs(p.fromCenterCm) < 1 ? "centru" : `${p.fromCenterCm > 0 ? "dreapta" : "stanga"}${n(Math.abs(p.fromCenterCm))}cm`;
  return `guler${n(p.fromCollarCm)}cm_${side}`;
}

/**
 * Each side once; the design (made on M) within M's print area, and each
 * size's scaled print within that size's print area.
 */
function checkZones(
  zones: {
    placement: (typeof TSHIRT_SIDES)[number];
    widthCm: number;
    heightCm: number;
    perSize?: { size: string; widthCm: number; heightCm: number }[];
  }[],
  sizes: readonly string[],
  sleeveCm: number,
) {
  const seen = new Set<string>();
  const ordered = new Set(sizes.map((x) => x.toUpperCase()));
  for (const z of zones) {
    if (seen.has(z.placement)) throw new TshirtOrderError("side_duplicate");
    seen.add(z.placement);
    // the design (on M) small enough for every ordered size
    if (!fitsTshirtArea(printAreaForSizes(z.placement, sizes, sleeveCm), z.widthCm, z.heightCm)) {
      throw new TshirtOrderError("print_area");
    }
    for (const p of z.perSize ?? []) {
      if (!ordered.has(p.size.toUpperCase())) throw new TshirtOrderError("size");
      // each size's print within that size's largest print (upright, or lying down on XXL / XXXL)
      if (!fitsTshirtArea(sizePrintArea(z.placement, p.size, sleeveCm), p.widthCm, p.heightCm)) {
        throw new TshirtOrderError("print_area");
      }
    }
  }
}

/** Price the t-shirt with the live DTF rules (same as the admin order form). */
export async function quoteTshirt(input: TshirtQuoteInput, customerType: DtfCustomerType): Promise<DtfLineData> {
  const sleeve = input.zones.some((z) => isSleeve(z.placement)) ? await loadTshirtSleeve() : null;
  if (input.sizes.some((x) => isHiddenSize(x.size))) throw new TshirtOrderError("size");
  checkZones(input.zones, input.sizes.map((x) => x.size), sleeve?.maxCm ?? Infinity);
  if (!input.garmentId.includes(":")) throw new TshirtOrderError("garment");
  try {
    const line = await resolveDtfLine(
      {
        garmentSource: "stock",
        garmentProductId: input.garmentId,
        sizes: input.sizes,
        zones: input.zones.map((z) => ({
          id: z.placement,
          placement: z.placement,
          presetId: null,
          widthCm: Math.round(z.widthCm * 10) / 10,
          heightCm: Math.round(z.heightCm * 10) / 10,
        })),
      },
      customerType,
    );
    if (!line.garment || line.garment.categoryCode !== TSHIRT_CATEGORY_CODE) throw new TshirtOrderError("garment");
    return line;
  } catch (e) {
    if (e instanceof DtfLineError) throw new TshirtOrderError(String(e.code));
    throw e;
  }
}

/** Customer-facing price summary (no costs). */
export function publicQuote(line: DtfLineData) {
  const p = line.pricing;
  return {
    quantity: line.quantity,
    totalMdl: p.totalSellPriceMdl,
    perPieceMdl: line.quantity > 0 ? Math.round((p.totalSellPriceMdl / line.quantity) * 100) / 100 : 0,
    garmentMdl: p.garmentSellTotalMdl,
    printMdl: Math.round((p.printSellTotalMdl + p.pressSellTotalMdl + p.minimumLineUpliftMdl) * 100) / 100,
    zones: line.zones.map((z) => ({ placement: z.placement, presetLabel: z.presetLabel })),
    sizes: line.sizes.map((s) => ({ size: s.size, quantity: s.quantity })),
  };
}

/**
 * Create the client's t-shirt as a normal DTF apparel order: status NEW (an
 * operator checks it before the workshop), one print file per side tagged with
 * its zone, garments taken from stock per size, editable design kept on the line.
 */
export async function createTshirtOrder(input: TshirtOrderInput, ctx: { customerType: DtfCustomerType }) {
  // Sent again (a retry after a lost answer, a double click): the order made the first time, not a second one.
  if (input.requestId) {
    const same = await prisma.orderLine.findFirst({
      where: {
        productType: "dtf_apparel",
        order: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        designerData: { path: ["requestId"], equals: input.requestId },
      },
      select: { dtfLineData: true, order: { select: { orderNumber: true, publicToken: true } } },
    });
    if (same?.order) {
      const sizes = ((same.dtfLineData as unknown as DtfLineData | null)?.sizes ?? []).map((x) => `${x.size}×${x.quantity}`).join(", ");
      return { orderNumber: same.order.orderNumber, publicToken: same.order.publicToken, sizes };
    }
  }
  const line: DtfLineData = await quoteTshirt(input, ctx.customerType);
  const clientId = await findClientIdByOrderPhone(input.phone);
  const designerData = {
    /** 2: layer coordinates in cm from the collar top centre (1: from the fixed print box corner). */
    version: 2,
    tool: "tshirt",
    requestId: input.requestId ?? null,
    garmentId: input.garmentId,
    sides: input.zones.map((z) => ({
      placement: z.placement,
      widthCm: z.widthCm,
      heightCm: z.heightCm,
      fileKey: z.fileKey,
      mockupKey: z.mockupKey ?? null,
      positionCm: z.positionCm ?? null,
      perSize: z.perSize ?? null,
      layers: z.layers,
    })),
  };
  const sizeLine = line.sizes.map((s) => `${s.size}×${s.quantity}`).join(", ");
  const sideWord = (p: string) =>
    p === "front" ? "fata" : p === "back" ? "spate" : p === "sleeve_left" ? "maneca-stanga" : "maneca-dreapta";

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        phone: input.phone,
        clientName: input.name || undefined,
        clientId: clientId ?? undefined,
        productType: "dtf_apparel",
        status: "NEW",
        isWorkshop: false,
        price: toOrderPriceDecimal(line.pricing.totalSellPriceMdl) ?? undefined,
        notes: input.notes || undefined,
        consentAt: new Date(),
        consentVersion: input.consent.version,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    const ol = await tx.orderLine.create({
      data: {
        orderId: order.id,
        sortOrder: 0,
        productType: "dtf_apparel",
        dtfLineData: line as unknown as Prisma.InputJsonValue,
        designerData: designerData as unknown as Prisma.InputJsonValue,
      },
    });
    const colorPart = (line.garment?.colorName ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
    const qtyOf = (size: string) => input.sizes.filter((x) => x.size.toUpperCase() === size.toUpperCase()).reduce((a, x) => a + x.quantity, 0);
    for (const z of input.zones) {
      if (z.perSize?.length) {
        // One file per size: the design scaled for that shirt, printed as many times as its pieces.
        for (const p of z.perSize) {
          const copies = qtyOf(p.size);
          if (copies <= 0) continue;
          const pos = isSleeve(z.placement) ? "_centrat-pe-maneca" : p.positionCm ? `_${positionLabel(p.positionCm)}` : "";
          const sizePart = p.size.toUpperCase().replace(/[^0-9A-Z]/g, "");
          await tx.file.create({
            data: {
              orderId: order.id,
              orderLineId: ol.id,
              fileName: `Tricou_${colorPart || "x"}_${sideWord(z.placement)}_${sizePart}_${p.widthCm}x${p.heightCm}cm${pos}.png`,
              fileUrl: p.fileKey,
              copies,
              color: "color",
              paperType: dtfZoneFilePaperType(z.placement),
            },
          });
        }
        continue;
      }
      const preset = line.zones.find((lz) => lz.placement === z.placement);
      const pos = isSleeve(z.placement) ? "_centrat-pe-maneca" : z.positionCm ? `_${positionLabel(z.positionCm)}` : "";
      await tx.file.create({
        data: {
          orderId: order.id,
          orderLineId: ol.id,
          fileName: `Tricou_${colorPart || "x"}_${sideWord(z.placement)}_${preset?.widthCm ?? z.widthCm}x${preset?.heightCm ?? z.heightCm}cm${pos}.png`,
          fileUrl: z.fileKey,
          copies: Math.max(1, line.quantity),
          color: "color",
          paperType: dtfZoneFilePaperType(z.placement),
        },
      });
    }
    const issues = await deductDtfLineStock(tx, line, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderLineId: ol.id,
      createdById: null,
    });
    if (issues.length > 0) {
      await tx.order.update({
        where: { id: order.id },
        data: { needsProcurement: true, procurementMeta: procurementMetaToJson(issues.length === 1 ? issues[0]! : issues) },
      });
    }
    return { orderNumber: order.orderNumber, publicToken: order.publicToken, sizes: sizeLine };
  }, HEAVY_TX_OPTIONS);
}

