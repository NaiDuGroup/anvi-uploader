import { Prisma, type PrintPricePreset } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DtfLineInput } from "./dtfLineInput";
import { buildDtfLineData } from "./buildDtfLineData";
import { DEFAULT_DTF_SETTINGS, parseDtfSettingsJson } from "./dtfSettings";
import { CATALOG, LOGO, A5, A4 } from "./dtfTestFixtures";
import { loadDtfPresets } from "./dtfCatalog";
import { loadDtfSettings, resolveDtfLine } from "./resolveDtfLine";

const db = vi.hoisted(() => ({
  printMethod: { findUnique: vi.fn() },
  printPricePreset: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/stock/unified/printers", () => ({
  printerSlotUnitCost: vi.fn(async (_db: unknown, _printer: string, role: string) => (role === "film" ? 4.83 : 0.18)),
  printerInkCostPerMl: vi.fn(async () => 0.3),
}));


/** The fixture price list as `print_price_presets` rows (Decimal columns). */
function presetRows(): PrintPricePreset[] {
  return CATALOG.presets.map((p) => ({
    id: p.id,
    methodCode: "dtf",
    label: p.label,
    widthCm: new Prisma.Decimal(p.widthCm.toFixed(2)),
    heightCm: new Prisma.Decimal(p.heightCm.toFixed(2)),
    retailPrice: new Prisma.Decimal(p.retailPrice.toFixed(2)),
    dealerPrice: p.dealerPrice == null ? null : new Prisma.Decimal(p.dealerPrice.toFixed(2)),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

const CLIENT_INPUTS: DtfLineInput[] = [
  { garmentSource: "client", sizes: [{ size: "one", quantity: 1 }], zones: [{ id: "a", placement: "front", presetId: A4 }] },
  {
    garmentSource: "client",
    sizes: [{ size: "one", quantity: 25 }],
    zones: [
      { id: "a", placement: "front", presetId: A5 },
      { id: "b", placement: "back", presetId: null, widthCm: 9, heightCm: 9 },
      { id: "c", placement: "sleeve_left", presetId: LOGO },
    ],
  },
  {
    garmentSource: "client",
    sizes: [{ size: "one", quantity: 7 }],
    zones: [{ id: "a", placement: "front", presetId: null, widthCm: 20, heightCm: 14 }],
  },
];

describe("DTF reads PrintMethod('dtf') and its PrintPricePreset rows", () => {
  beforeEach(() => {
    db.printMethod.findUnique.mockReset();
    db.printPricePreset.findMany.mockReset();
    db.printPricePreset.findMany.mockResolvedValue(presetRows());
  });

  it("settings come from PrintMethod('dtf').settings with the tolerant parse", async () => {
    db.printMethod.findUnique.mockResolvedValue({ settings: { pressFeePerZoneMdl: 10, gapCm: -5 } });
    expect(await loadDtfSettings()).toEqual({ ...DEFAULT_DTF_SETTINGS, pressFeePerZoneMdl: 10 });
    expect(db.printMethod.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "dtf" } }));
  });

  it("falls back to defaults when the method row is missing", async () => {
    db.printMethod.findUnique.mockResolvedValue(null);
    expect(await loadDtfSettings()).toEqual(DEFAULT_DTF_SETTINGS);
  });

  it("presets are filtered by method and mapped to the same JSON as before", async () => {
    expect(await loadDtfPresets(false)).toEqual(CATALOG.presets);
    expect(db.printPricePreset.findMany).toHaveBeenCalledWith({
      where: { methodCode: "dtf" },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    await loadDtfPresets(true);
    expect(db.printPricePreset.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { methodCode: "dtf", isActive: true } }),
    );
  });

  it.each(["retail", "dealer"] as const)("server quote (%s) equals the wizard quote on the same price list", async (ct) => {
    db.printMethod.findUnique.mockResolvedValue({ settings: {} });
    for (const input of CLIENT_INPUTS) {
      const server = await resolveDtfLine(input, ct);
      const local = buildDtfLineData(input, ct, {
        garment: null,
        presets: CATALOG.presets,
        settings: parseDtfSettingsJson({}),
        unitCosts: CATALOG.unitCosts,
      });
      expect(server).toEqual(local);
    }
  });
});
