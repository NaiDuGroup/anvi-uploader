import { describe, it, expect } from "vitest";
import { groupLines } from "./groupLines";
import type { RawOrder, RawOrderLine } from "./groupLines";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const lfLineData = (
  materialName: string,
  widthCm: number,
  heightCm: number,
  qty: number,
  lm: number,
  widths: { rollWidthMeters: string; printableWidthMeters: string } = {
    rollWidthMeters: "1.27",
    printableWidthMeters: "1.20",
  },
) => ({
  materialSnapshot: {
    name: materialName,
    rollWidthMeters: widths.rollWidthMeters,
    printableWidthMeters: widths.printableWidthMeters,
  },
  printWidthCm: widthCm,
  printHeightCm: heightCm,
  quantity: qty,
  calculatedLinearMeters: lm,
  customerType: "retail",
  materialCost: 100,
  materialSellPrice: 200,
  printSellPrice: 100,
  totalSellPrice: 300,
  estimatedProfit: 100,
});

const mugSnap = (sku: string) => ({
  id: "12345678-1234-4234-8234-123456789012",
  sku,
  nameRo: "Cană albă",
  nameRu: "Белая кружка",
  nameEn: "White mug",
  imageUrl: null,
  bodyColorHex: "#ffffff",
  handleColorHex: "#ffffff",
  innerColorHex: null,
});

const notebookSnap = (sku: string) => ({
  id: "12345678-1234-4234-8234-123456789013",
  sku,
  nameRo: "Caiet negru",
  nameRu: "Чёрный блокнот",
  nameEn: "Black notebook",
  imageUrl: null,
  coverColorHex: "#1f1f1f",
  strapColorHex: "#1f1f1f",
  bookmarkColorHex: "#c0392b",
  paperKind: "ruled",
});

const penSnap = (sku: string) => ({
  sku,
  nameRo: "Pix metalic",
  nameRu: "Металлическая ручка",
  nameEn: "Metal pen",
  bodyColorHex: "#1f1f1f",
  clipColorHex: "#c0c0c0",
  printWidthCm: 4,
  printHeightCm: 1.5,
  printDpi: 300,
  has3dPreview: false,
  sellPrice: 45,
  dealerPrice: 30,
});

const file = (
  id: string,
  orderLineId: string,
  copies: number,
  overrides: Partial<RawOrderLine["files"][number]> = {},
): RawOrderLine["files"][number] => ({
  id,
  fileName: `${id}.pdf`,
  fileUrl: `/${id}`,
  copies,
  color: "color",
  paperType: null,
  pageCount: null,
  orderLineId,
  ...overrides,
});

function makeLine(
  overrides: Partial<RawOrderLine> & Pick<RawOrderLine, "id" | "productType">,
): RawOrderLine {
  return {
    sortOrder: 0,
    mugProductId: null,
    mugProductSnapshot: null,
    notebookProductId: null,
    notebookProductSnapshot: null,
    penProductId: null,
    penProductSnapshot: null,
    largeFormatLineData: null,
    files: [],
    ...overrides,
  };
}

function makeOrder(overrides: Partial<RawOrder>): RawOrder {
  return {
    id: "order-1",
    orderNumber: 1,
    phone: "+37300000000",
    clientName: null,
    status: "SENT_TO_WORKSHOP",
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    notes: null,
    orderLines: [],
    files: [],
    productType: "paper_print",
    createdByName: null,
    sentToWorkshopByName: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("groupLines", () => {
  it("returns empty sections for empty input", () => {
    expect(groupLines([])).toEqual([]);
  });

  it("creates one LF section with one group for a single LF order line", () => {
    const banner = file("f1", "line-1", 2, {
      fileName: "banner.pdf",
      paperType: "large_format",
    });
    const order = makeOrder({
      id: "order-lf-1",
      orderNumber: 2806,
      productType: "large_format_print",
      orderLines: [
        makeLine({
          id: "line-1",
          productType: "large_format_print",
          largeFormatLineData: lfLineData("ORACAL MATT 1.27*50m", 100, 150, 2, 3.0),
          files: [banner],
        }),
      ],
      files: [banner],
    });

    const sections = groupLines([order]);
    expect(sections).toHaveLength(1);
    expect(sections[0].productType).toBe("large_format_print");
    expect(sections[0].groups).toHaveLength(1);

    const group = sections[0].groups[0];
    expect(group.label).toBe("ORACAL MATT 1.27*50m");
    expect(group.lines).toHaveLength(1);
    expect(group.aggregate.lineCount).toBe(1);
    expect(group.aggregate.orderCount).toBe(1);
    expect(group.aggregate.totalQty).toBe(2);
    expect(group.aggregate.totalLinearMeters).toBeCloseTo(3.0);
  });

  it("groups two LF lines of the same material together and sums linear meters", () => {
    const mkOrder = (id: string, num: number, lm: number): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        productType: "large_format_print",
        orderLines: [
          makeLine({
            id: `${id}-line`,
            productType: "large_format_print",
            largeFormatLineData: lfLineData("ORACAL MATT 1.27*50m", 100, 150, 1, lm),
          }),
        ],
      });

    const sections = groupLines([mkOrder("o1", 1, 1.5), mkOrder("o2", 2, 2.0)]);
    expect(sections).toHaveLength(1);

    const group = sections[0].groups[0];
    expect(group.lines).toHaveLength(2);
    expect(group.aggregate.orderCount).toBe(2);
    expect(group.aggregate.totalLinearMeters).toBeCloseTo(3.5);
  });

  it("keeps two LF lines of different materials in separate groups", () => {
    const mkOrder = (id: string, num: number, mat: string): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        productType: "large_format_print",
        orderLines: [
          makeLine({
            id: `${id}-line`,
            productType: "large_format_print",
            largeFormatLineData: lfLineData(mat, 80, 100, 1, 1.0),
          }),
        ],
      });

    const sections = groupLines([
      mkOrder("o1", 1, "ORACAL MATT"),
      mkOrder("o2", 2, "BANNER MATT"),
    ]);
    expect(sections[0].groups).toHaveLength(2);
    const labels = sections[0].groups.map((g) => g.label);
    expect(labels).toContain("ORACAL MATT");
    expect(labels).toContain("BANNER MATT");
  });

  it("merges ORACAL MATT 1.27 and 1.62 lines into one family group", () => {
    const mkOrder = (
      id: string,
      num: number,
      mat: string,
      widths: { rollWidthMeters: string; printableWidthMeters: string },
    ): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        productType: "large_format_print",
        orderLines: [
          makeLine({
            id: `${id}-line`,
            productType: "large_format_print",
            largeFormatLineData: lfLineData(mat, 60, 90, 1, 0.6, widths),
          }),
        ],
      });

    const sections = groupLines([
      mkOrder("o1", 1, "ORACAL MATT 1.27*50m", { rollWidthMeters: "1.27", printableWidthMeters: "1.22" }),
      mkOrder("o2", 2, "ORACAL MATT 1.27*50m", { rollWidthMeters: "1.27", printableWidthMeters: "1.22" }),
      mkOrder("o3", 3, "ORACAL MATT 1.62*50m", { rollWidthMeters: "1.62", printableWidthMeters: "1.57" }),
    ]);

    expect(sections[0].groups).toHaveLength(1);
    const group = sections[0].groups[0];
    expect(group.key).toBe("lf::ORACAL MATT");
    expect(group.label).toBe("ORACAL MATT");
    expect(group.meta.familyKey).toBe("ORACAL MATT");
    // Widths come from the widest ordered roll.
    expect(group.meta.rollWidthMeters).toBe("1.62");
    expect(group.meta.printableWidthMeters).toBe("1.57");
    expect(group.meta.materialBreakdown).toEqual([
      { name: "ORACAL MATT 1.27*50m", lineCount: 2 },
      { name: "ORACAL MATT 1.62*50m", lineCount: 1 },
    ]);
  });

  it("keeps the full material name as label when a family group has one material", () => {
    const order = makeOrder({
      id: "o-single",
      orderNumber: 5,
      productType: "large_format_print",
      orderLines: [
        makeLine({
          id: "o-single-line",
          productType: "large_format_print",
          largeFormatLineData: lfLineData("ORACAL MATT 1.27*50m", 60, 90, 1, 0.6),
        }),
      ],
    });

    const group = groupLines([order])[0].groups[0];
    expect(group.key).toBe("lf::ORACAL MATT");
    expect(group.label).toBe("ORACAL MATT 1.27*50m");
    expect(group.meta.materialBreakdown).toEqual([
      { name: "ORACAL MATT 1.27*50m", lineCount: 1 },
    ]);
  });

  it("places a mixed order (LF + mug) in both LF and mug sections", () => {
    const mugFile = file("mf1", "mug-line", 4, { fileName: "mug.jpg" });
    const order = makeOrder({
      id: "mixed-1",
      orderNumber: 100,
      productType: "mixed",
      orderLines: [
        makeLine({
          id: "lf-line",
          productType: "large_format_print",
          largeFormatLineData: lfLineData("BANNER MATT 1.37*30m", 80, 150, 1, 1.5),
        }),
        makeLine({
          id: "mug-line",
          sortOrder: 1,
          productType: "mug",
          mugProductId: "mug-1",
          mugProductSnapshot: mugSnap("MUG-YLW-330"),
          files: [mugFile],
        }),
      ],
      files: [mugFile],
    });

    const sections = groupLines([order]);
    expect(sections).toHaveLength(2);

    const ptSet = new Set(sections.map((s) => s.productType));
    expect(ptSet).toContain("large_format_print");
    expect(ptSet).toContain("mug");

    // LF section: 1 group, 1 line
    const lfSection = sections.find((s) => s.productType === "large_format_print")!;
    expect(lfSection.groups[0].lines).toHaveLength(1);

    // Mug section: 1 group, 1 line, qty = 4 (from file copies)
    const mugSection = sections.find((s) => s.productType === "mug")!;
    expect(mugSection.groups[0].aggregate.totalQty).toBe(4);
  });

  it("groups two mug orders of the same SKU together", () => {
    const mkMugOrder = (id: string, num: number, copies: number): RawOrder => {
      const mugFile = file(`${id}-f`, `${id}-line`, copies, { fileName: "mug.jpg" });
      return makeOrder({
        id,
        orderNumber: num,
        productType: "mug",
        orderLines: [
          makeLine({
            id: `${id}-line`,
            productType: "mug",
            mugProductId: "mug-1",
            mugProductSnapshot: mugSnap("MUG-BLK-330"),
            files: [mugFile],
          }),
        ],
        files: [mugFile],
      });
    };

    const sections = groupLines([mkMugOrder("o1", 1, 3), mkMugOrder("o2", 2, 5)]);
    const mugSection = sections.find((s) => s.productType === "mug")!;
    expect(mugSection.groups).toHaveLength(1);
    expect(mugSection.groups[0].aggregate.totalQty).toBe(8);
    expect(mugSection.groups[0].aggregate.orderCount).toBe(2);
  });

  it("groups two pen orders of the same SKU and exposes the body/clip colours", () => {
    const mkPenOrder = (id: string, num: number, copies: number): RawOrder => {
      const penFile = file(`${id}-f`, `${id}-line`, copies, { fileName: "pen.png" });
      return makeOrder({
        id,
        orderNumber: num,
        productType: "pen",
        orderLines: [
          makeLine({
            id: `${id}-line`,
            productType: "pen",
            penProductId: "pen-1",
            penProductSnapshot: penSnap("PEN-BLK-01"),
            files: [penFile],
          }),
        ],
        files: [penFile],
      });
    };

    const sections = groupLines([mkPenOrder("p1", 1, 10), mkPenOrder("p2", 2, 15)]);
    const penSection = sections.find((s) => s.productType === "pen")!;
    expect(penSection.groups).toHaveLength(1);

    const group = penSection.groups[0];
    expect(group.key).toBe("pen::PEN-BLK-01");
    expect(group.label).toBe("Металлическая ручка");
    expect(group.aggregate.totalQty).toBe(25);
    expect(group.aggregate.orderCount).toBe(2);
    expect(group.meta.bodyColorHex).toBe("#1f1f1f");
    expect(group.meta.clipColorHex).toBe("#c0c0c0");
  });

  it("sections are in canonical order: LF → mug → notebook → pen → paper", () => {
    const mkLf = (): RawOrder =>
      makeOrder({
        id: "lf-o",
        orderNumber: 1,
        productType: "large_format_print",
        orderLines: [
          makeLine({
            id: "lf-l",
            productType: "large_format_print",
            largeFormatLineData: lfLineData("MAT", 60, 80, 1, 0.8),
          }),
        ],
      });

    const mkNotebook = (): RawOrder => {
      const nbFile = file("nbf", "nb-l", 5, { fileName: "cover.pdf", color: "bw" });
      return makeOrder({
        id: "nb-o",
        orderNumber: 2,
        productType: "notebook",
        orderLines: [
          makeLine({
            id: "nb-l",
            productType: "notebook",
            notebookProductId: "nb-1",
            notebookProductSnapshot: notebookSnap("NB-BLK-A5"),
            files: [nbFile],
          }),
        ],
        files: [nbFile],
      });
    };

    const mkPen = (): RawOrder => {
      const penFile = file("pf", "pen-l", 20, { fileName: "pen.png" });
      return makeOrder({
        id: "pen-o",
        orderNumber: 3,
        productType: "pen",
        orderLines: [
          makeLine({
            id: "pen-l",
            productType: "pen",
            penProductId: "pen-1",
            penProductSnapshot: penSnap("PEN-BLK-01"),
            files: [penFile],
          }),
        ],
        files: [penFile],
      });
    };

    const sections = groupLines([mkPen(), mkNotebook(), mkLf()]);
    expect(sections.map((s) => s.productType)).toEqual([
      "large_format_print",
      "notebook",
      "pen",
    ]);
  });

  it("prio lines appear first in a group", () => {
    const mkLfOrder = (id: string, num: number, isPrio: boolean): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        isPrio,
        productType: "large_format_print",
        orderLines: [
          makeLine({
            id: `${id}-l`,
            productType: "large_format_print",
            largeFormatLineData: lfLineData("ORACAL", 60, 80, 1, 0.8),
          }),
        ],
      });

    const sections = groupLines([
      mkLfOrder("normal", 1, false),
      mkLfOrder("prio", 2, true),
    ]);
    const lines = sections[0].groups[0].lines;
    expect(lines[0].isPrio).toBe(true);
    expect(lines[1].isPrio).toBe(false);
  });
});
