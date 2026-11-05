import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fx = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/prisma", async () => {
  const { lfTestDb } = await import("@/lib/largeFormat/lfTestFixtures");
  fx.db = lfTestDb();
  return { prisma: fx.db, HEAVY_TX_OPTIONS: {} };
});
vi.mock("@/lib/accounting/accountingSettings", async () => {
  const { LF_TEST_PRODUCTION_COSTS } = await import("@/lib/largeFormat/lfTestFixtures");
  return { getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: LF_TEST_PRODUCTION_COSTS })) };
});
vi.mock("@/lib/stock/unified/printers", async (importOriginal) => {
  const { LF_TEST_INK_PER_ML } = await import("@/lib/largeFormat/lfTestFixtures");
  return {
    ...(await importOriginal<typeof import("@/lib/stock/unified/printers")>()),
    printerInkCostPerMl: vi.fn(async () => LF_TEST_INK_PER_ML),
  };
});

import { LF_TEST_PRESETS, LF_TEST_ROLL_ID } from "@/lib/largeFormat/lfTestFixtures";
import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import { resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import type { ShopLfQuote } from "@/lib/storefront/largeFormat";
import type { AdminOrderLineInput } from "@/lib/validations";
import { resolveShopLfLine, shopLfOrderLineInput } from "./largeFormatShop";

const FILE = { fileName: "banner.pdf", fileUrl: "uploads/1730000000000-x-banner.pdf", copies: 1, color: "color" as const };

/** The line the studio wizard sends for this roll / family, size and copies (retail). */
function wizardLine(target: { largeFormatMaterialId: string } | { materialFamilyKey: string }, w: number, h: number, qty = 1, extra: Partial<AdminOrderLineInput> = {}): AdminOrderLineInput {
  return {
    productType: "large_format_print",
    ...target,
    printWidthCm: w,
    printHeightCm: h,
    quantity: qty,
    customerType: "retail",
    lfSizePresetId: null,
    files: [{ ...FILE, copies: qty, paperType: "large_format" }],
    ...extra,
  } as AdminOrderLineInput;
}

async function wizardTotal(line: AdminOrderLineInput): Promise<number> {
  const { resolved } = await resolveOrderLines([line]);
  return (resolved[0]!.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData).totalSellPrice;
}

async function quote(line: ShopLfQuote) {
  const r = await quotePublicLines([line], "ro");
  return r.lines[0]!;
}

const PRESET = (materialName: string, w: number, h: number) =>
  LF_TEST_PRESETS.find((p) => p.materialId === LF_TEST_ROLL_ID[materialName] && p.widthCm === w && p.heightCm === h)!.id;

describe("public quote largeFormat = the wizard's order line, per material", () => {
  const cases: [string, ShopLfQuote, AdminOrderLineInput][] = [
    [
      "banner (BANNER MATT 1.37)",
      { kind: "largeFormat", product: "banner", material: "banner", widthCm: 200, heightCm: 100, quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["BANNER MATT 1.37*50m"]! }, 200, 100),
    ],
    [
      "Oracal matt (family of 3 rolls)",
      { kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 120, heightCm: 80, quantity: 2 },
      wizardLine({ materialFamilyKey: "ORACAL MATT" }, 120, 80, 2),
    ],
    [
      "Oracal gloss",
      { kind: "largeFormat", product: "autocolant", material: "oracal_gloss", widthCm: 100, heightCm: 100, quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["ORACAL GLOSS 1.27*50m"]! }, 100, 100),
    ],
    [
      "photo 200 g custom size",
      { kind: "largeFormat", product: "poster", material: "photo_200", widthCm: 70, heightCm: 100, quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["PHOTO PAPER 200G 1.07*75m"]! }, 70, 100),
    ],
    [
      "photo 230 g",
      { kind: "largeFormat", product: "poster", material: "photo_230", widthCm: 60, heightCm: 90, quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["PHOTO PAPER 230g 1.27*30m"]! }, 60, 90),
    ],
    [
      "paper 100 g",
      { kind: "largeFormat", product: "poster", material: "paper_100", widthCm: 84.1, heightCm: 118.9, quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["PAPER 100G 0.91*50m"]! }, 84.1, 118.9),
    ],
    [
      "photo 200 g preset 50×70",
      { kind: "largeFormat", product: "poster", material: "photo_200", widthCm: 50, heightCm: 70, quantity: 3, preset: true },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["PHOTO PAPER 200G 1.07*75m"]! }, 50, 70, 3, {
        lfSizePresetId: PRESET("PHOTO PAPER 200G 1.07*75m", 50, 70),
      }),
    ],
    [
      "canvas preset 50×70 (landscape 70×50)",
      { kind: "largeFormat", product: "canvas", material: "canvas", widthCm: 70, heightCm: 50, quantity: 1, preset: true },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["Panza din bumbac 1.07*20m"]! }, 70, 50, 1, {
        lfSizePresetId: PRESET("Panza din bumbac 1.07*20m", 50, 70),
      }),
    ],
    [
      "roll-up 80×200 (FF-330 1.07)",
      { kind: "largeFormat", product: "rollup", kit: "rollup_80x200", quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["BANNER Roll Up MATT 1.07*30m"]! }, 80, 210, 1, { lfKit: "rollup_80x200" }),
    ],
    [
      "roll-up 120×200 (FF-330 1.27)",
      { kind: "largeFormat", product: "rollup", kit: "rollup_120x200", quantity: 1 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["Banner pentru Roll Up 1.27*30m Matt (38,1 m2)"]! }, 120, 210, 1, {
        lfKit: "rollup_120x200",
      }),
    ],
    [
      "X-banner 80×180",
      { kind: "largeFormat", product: "xbanner", kit: "xbanner_80x180", quantity: 2 },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["BANNER MATT 1.37*50m"]! }, 80, 180, 2, { lfKit: "xbanner_80x180" }),
    ],
    [
      "banner with finishing",
      {
        kind: "largeFormat",
        product: "banner",
        material: "banner",
        widthCm: 300,
        heightCm: 100,
        quantity: 1,
        finishing: { hem: true, pockets: ["top"], eyelets: { mode: "spacing", spacingCm: 40 } },
      },
      wizardLine({ largeFormatMaterialId: LF_TEST_ROLL_ID["BANNER MATT 1.37*50m"]! }, 300, 100, 1, {
        lfFinishing: { hem: true, pockets: ["top"], eyelets: { mode: "spacing", spacingCm: 40 } },
      }),
    ],
  ];

  for (const [name, shop, wizard] of cases) {
    it(name, async () => {
      const q = await quote(shop);
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      const studio: number = await wizardTotal(wizard);
      // Custom sizes: whole lei per piece (rounded down) — 2 × Oracal 120×80 = 431 by the formula → 2 × 215;
      // photo 70×100 custom (218 by the formula) is never below the fixed 60×90 (250).
      const expected: Record<string, number> = { "Oracal matt (family of 3 rolls)": 430, "photo 200 g custom size": 250 };
      expect(q.total).toBe(expected[name] ?? studio);
      // The same order line fields as the wizard's.
      const input = await shopLfOrderLineInput(shop, [FILE]);
      expect({ ...input, files: [] }).toEqual({ ...wizard, files: [] });
    });
  }
});

describe("prices (production rolls and settings, 2026-11-05)", () => {
  it("banner 200×100 by the formula: 2,01 lm × 210 + ink 2 m² × 74 = 570; eyelets every 50 cm +42", async () => {
    const plain = await quote({ kind: "largeFormat", product: "banner", material: "banner", widthCm: 200, heightCm: 100, quantity: 1 });
    expect(plain.ok && plain.total).toBe(570);
    const withEyelets = await quote({
      kind: "largeFormat",
      product: "banner",
      material: "banner",
      widthCm: 200,
      heightCm: 100,
      quantity: 1,
      finishing: { eyelets: { mode: "spacing", spacingCm: 50 } },
    });
    expect(withEyelets.ok && withEyelets.total).toBe(612);
    expect(withEyelets.ok && withEyelets.breakdown).toEqual([
      { key: "print", label: "Imprimare", amount: 570 },
      { key: "eyelets", label: "Capse (inele)", amount: 42 },
    ]);
  });

  it("canvas 50×70 = 610 (price list size); roll-up 1100 / 1300 / 1600; X-banner 650", async () => {
    const canvas = await quote({ kind: "largeFormat", product: "canvas", material: "canvas", widthCm: 50, heightCm: 70, quantity: 1, preset: true });
    expect(canvas.ok && canvas.total).toBe(610);
    for (const [kit, price] of [
      ["rollup_80x200", 1100],
      ["rollup_100x200", 1300],
      ["rollup_120x200", 1600],
    ] as const) {
      const q = await quote({ kind: "largeFormat", product: "rollup", kit, quantity: 1 });
      expect(q.ok && q.total).toBe(price);
    }
    const x = await quote({ kind: "largeFormat", product: "xbanner", kit: "xbanner_80x180", quantity: 1 });
    expect(x.ok && x.total).toBe(650);
  });

  it("a small print pays the 100-lei minimum, shown as a surcharge", async () => {
    const q = await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_gloss", widthCm: 20, heightCm: 20, quantity: 1 });
    expect(q.ok && q.total).toBe(100);
    expect(q.ok && q.breakdown?.map((b) => b.key)).toEqual(["print", "minimum"]);
    // A family line (Oracal mat) is billed by the group path: the minimum is in the total.
    const family = await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 20, heightCm: 20, quantity: 1 });
    expect(family.ok && family.total).toBe(100);
  });
});

describe("QA 2026-11-05: whole lei per piece, never more per piece for more pieces", () => {
  const unit = async (line: ShopLfQuote): Promise<number> => {
    const q = await quote(line);
    if (!q.ok) throw new Error(q.code);
    expect(q.total % line.quantity).toBe(0);
    return q.total / line.quantity;
  };

  it("banner and Oracal: whole-lei unit price that never rises with the quantity", async () => {
    for (const base of [
      { kind: "largeFormat", product: "banner", material: "banner", widthCm: 200, heightCm: 100, finishing: { eyelets: { mode: "spacing", spacingCm: 30 } } },
      { kind: "largeFormat", product: "autocolant", material: "oracal_gloss", widthCm: 100, heightCm: 100 },
      { kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 50, heightCm: 50 },
    ] as const) {
      let prev = Number.POSITIVE_INFINITY;
      for (const quantity of [1, 2, 3, 4, 5, 7, 10]) {
        const u = await unit({ ...base, quantity } as ShopLfQuote);
        expect(Number.isInteger(u)).toBe(true);
        expect(u, `${base.material} ×${quantity}`).toBeLessThanOrEqual(prev);
        prev = u;
      }
    }
  });

  it("the checkout re-price gives the same total as the quote (no 409 price_changed)", async () => {
    const line: ShopLfQuote = { kind: "largeFormat", product: "autocolant", material: "oracal_gloss", widthCm: 100, heightCm: 100, quantity: 5 };
    const q = await quote(line);
    const lf = await resolveShopLfLine(line, [FILE]);
    expect(q.ok && q.total).toBe(lf.totalMdl);
    // The stored order line carries the same price.
    const stored = lf.resolved.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData;
    expect(stored.totalSellPrice).toBe(lf.totalMdl);
    expect(stored.shopUnitPriceMdl! * 5).toBe(lf.totalMdl);
  });

  it("poster «Altă mărime» 50×70 costs at least the fixed 50×70 (160)", async () => {
    const custom = await quote({ kind: "largeFormat", product: "poster", material: "photo_200", widthCm: 50, heightCm: 70, quantity: 1 });
    const fixed = await quote({ kind: "largeFormat", product: "poster", material: "photo_200", widthCm: 50, heightCm: 70, quantity: 1, preset: true });
    expect(fixed.ok && fixed.total).toBe(160);
    expect(custom.ok && custom.total).toBe(160);
    // Larger than every fixed size: the formula (above the dearest fixed size inside it) stays.
    const big = await quote({ kind: "largeFormat", product: "poster", material: "photo_200", widthCm: 100, heightCm: 150, quantity: 1 });
    expect(big.ok && big.total).toBeGreaterThanOrEqual(370);
  });

  it("Oracal mat takes exactly 157 cm on the short side (the hint says «până la 157 cm»)", async () => {
    expect((await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 157, heightCm: 157, quantity: 1 })).ok).toBe(true);
    expect((await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 157, heightCm: 200, quantity: 1 })).ok).toBe(true);
    expect(await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 158, heightCm: 200, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_too_wide",
    });
    // Banner: 132 cm inclusive as before.
    expect((await quote({ kind: "largeFormat", product: "banner", material: "banner", widthCm: 132, heightCm: 200, quantity: 1 })).ok).toBe(true);
  });
});

describe("limits", () => {
  it("wider than the roll on both sides → lf_too_wide; more than 160 cm → refused before the DB", async () => {
    // Banner prints 132 cm wide: 140×200 cannot be printed in one piece.
    expect(await quote({ kind: "largeFormat", product: "banner", material: "banner", widthCm: 140, heightCm: 200, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_too_wide",
    });
    // Oracal matt 1,62 prints 157 cm: 150×300 fits rotated.
    expect((await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 300, heightCm: 150, quantity: 1 })).ok).toBe(true);
    expect(await quote({ kind: "largeFormat", product: "autocolant", material: "oracal_matt", widthCm: 170, heightCm: 200, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_too_wide",
    });
    expect(await quote({ kind: "largeFormat", product: "banner", material: "banner", widthCm: 100, heightCm: 600, quantity: 1 })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(await quote({ kind: "largeFormat", product: "banner", material: "banner", widthCm: 5, heightCm: 100, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_size_too_small",
    });
  });

  it("canvas needs a price-list size; a set takes no size; finishing only on banners", async () => {
    expect(await quote({ kind: "largeFormat", product: "canvas", material: "canvas", widthCm: 55, heightCm: 70, quantity: 1, preset: true })).toMatchObject({
      ok: false,
      code: "lf_preset_unknown",
    });
    expect(await quote({ kind: "largeFormat", product: "canvas", material: "canvas", widthCm: 50, heightCm: 70, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_preset_required",
    });
    expect(await quote({ kind: "largeFormat", product: "rollup", kit: "rollup_80x200", widthCm: 85, heightCm: 200, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_kit_options",
    });
    expect(await quote({ kind: "largeFormat", product: "rollup", kit: "xbanner_80x180", quantity: 1 })).toMatchObject({ ok: false, code: "lf_kit_required" });
    expect(
      await quote({
        kind: "largeFormat",
        product: "autocolant",
        material: "oracal_matt",
        widthCm: 100,
        heightCm: 100,
        quantity: 1,
        finishing: { hem: true },
      }),
    ).toMatchObject({ ok: false, code: "lf_finishing_invalid" });
    expect(await quote({ kind: "largeFormat", product: "banner", material: "canvas", widthCm: 100, heightCm: 100, quantity: 1 })).toMatchObject({
      ok: false,
      code: "lf_material_invalid",
    });
  });
});

describe("order line", () => {
  it("one file, copies = pieces, paperType large_format; finishing and the set frozen on the line", async () => {
    const res = await resolveShopLfLine(
      {
        kind: "largeFormat",
        product: "banner",
        material: "banner",
        widthCm: 200,
        heightCm: 100,
        quantity: 2,
        finishing: { hem: true, eyelets: { mode: "spacing", spacingCm: 50 } },
      },
      [FILE],
    );
    expect(res.resolved.input.files).toEqual([{ ...FILE, copies: 2, paperType: "large_format" }]);
    expect(res.data.finishing).toMatchObject({ eyelets: { countPerPiece: 12, totalMdl: 84 }, hem: { metersPerPiece: 6, totalMdl: 180 } });
    expect(res.data.materialSnapshot.name).toBe("BANNER MATT 1.37*50m");
    expect(res.totalMdl).toBe(res.data.totalSellPrice);

    const kit = await resolveShopLfLine({ kind: "largeFormat", product: "rollup", kit: "rollup_100x200", quantity: 1 }, [FILE]);
    expect(kit.data.kit).toMatchObject({ id: "rollup_100x200", standSku: "STAND-ROLLUP-100X200", unitPriceMdl: 1300 });
    expect(kit.data).toMatchObject({ printWidthCm: 100, printHeightCm: 210, materialSnapshot: { name: "BANNER Roll Up MATT 1.07*30m" } });
  });
});
