import { describe, it, expect } from "vitest";
import { groupLines } from "./groupLines";
import type { RawOrder } from "./groupLines";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const lfLineData = (materialName: string, widthCm: number, heightCm: number, qty: number, lm: number) => ({
  materialSnapshot: {
    name: materialName,
    rollWidthMeters: "1.27",
    printableWidthMeters: "1.20",
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
    const order = makeOrder({
      id: "order-lf-1",
      orderNumber: 2806,
      productType: "large_format_print",
      orderLines: [
        {
          id: "line-1",
          sortOrder: 0,
          productType: "large_format_print",
          mugProductId: null,
          mugProductSnapshot: null,
          notebookProductId: null,
          notebookProductSnapshot: null,
          largeFormatLineData: lfLineData("ORACAL MATT 1.27*50m", 100, 150, 2, 3.0),
          files: [
            { id: "f1", fileName: "banner.pdf", fileUrl: "/f1", copies: 2, color: "color", paperType: "large_format", pageCount: null, orderLineId: "line-1" },
          ],
        },
      ],
      files: [
        { id: "f1", fileName: "banner.pdf", fileUrl: "/f1", copies: 2, color: "color", paperType: "large_format", pageCount: null, orderLineId: "line-1" },
      ],
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
          {
            id: `${id}-line`,
            sortOrder: 0,
            productType: "large_format_print",
            mugProductId: null,
            mugProductSnapshot: null,
            notebookProductId: null,
            notebookProductSnapshot: null,
            largeFormatLineData: lfLineData("ORACAL MATT 1.27*50m", 100, 150, 1, lm),
            files: [],
          },
        ],
        files: [],
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
          {
            id: `${id}-line`,
            sortOrder: 0,
            productType: "large_format_print",
            mugProductId: null,
            mugProductSnapshot: null,
            notebookProductId: null,
            notebookProductSnapshot: null,
            largeFormatLineData: lfLineData(mat, 80, 100, 1, 1.0),
            files: [],
          },
        ],
        files: [],
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

  it("places a mixed order (LF + mug) in both LF and mug sections", () => {
    const order = makeOrder({
      id: "mixed-1",
      orderNumber: 100,
      productType: "mixed",
      orderLines: [
        {
          id: "lf-line",
          sortOrder: 0,
          productType: "large_format_print",
          mugProductId: null,
          mugProductSnapshot: null,
          notebookProductId: null,
          notebookProductSnapshot: null,
          largeFormatLineData: lfLineData("BANNER MATT 1.37*30m", 80, 150, 1, 1.5),
          files: [],
        },
        {
          id: "mug-line",
          sortOrder: 1,
          productType: "mug",
          mugProductId: "mug-1",
          mugProductSnapshot: mugSnap("MUG-YLW-330"),
          notebookProductId: null,
          notebookProductSnapshot: null,
          largeFormatLineData: null,
          files: [
            { id: "mf1", fileName: "mug.jpg", fileUrl: "/mf1", copies: 4, color: "color", paperType: null, pageCount: null, orderLineId: "mug-line" },
          ],
        },
      ],
      files: [
        { id: "mf1", fileName: "mug.jpg", fileUrl: "/mf1", copies: 4, color: "color", paperType: null, pageCount: null, orderLineId: "mug-line" },
      ],
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
    const mkMugOrder = (id: string, num: number, copies: number): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        productType: "mug",
        orderLines: [
          {
            id: `${id}-line`,
            sortOrder: 0,
            productType: "mug",
            mugProductId: "mug-1",
            mugProductSnapshot: mugSnap("MUG-BLK-330"),
            notebookProductId: null,
            notebookProductSnapshot: null,
            largeFormatLineData: null,
            files: [
              { id: `${id}-f`, fileName: "mug.jpg", fileUrl: "/mug", copies, color: "color", paperType: null, pageCount: null, orderLineId: `${id}-line` },
            ],
          },
        ],
        files: [
          { id: `${id}-f`, fileName: "mug.jpg", fileUrl: "/mug", copies, color: "color", paperType: null, pageCount: null, orderLineId: `${id}-line` },
        ],
      });

    const sections = groupLines([mkMugOrder("o1", 1, 3), mkMugOrder("o2", 2, 5)]);
    const mugSection = sections.find((s) => s.productType === "mug")!;
    expect(mugSection.groups).toHaveLength(1);
    expect(mugSection.groups[0].aggregate.totalQty).toBe(8);
    expect(mugSection.groups[0].aggregate.orderCount).toBe(2);
  });

  it("sections are in canonical order: LF → mug → notebook → paper", () => {
    const mkLf = (): RawOrder =>
      makeOrder({
        id: "lf-o", orderNumber: 1, productType: "large_format_print",
        orderLines: [{
          id: "lf-l", sortOrder: 0, productType: "large_format_print",
          mugProductId: null, mugProductSnapshot: null, notebookProductId: null,
          notebookProductSnapshot: null,
          largeFormatLineData: lfLineData("MAT", 60, 80, 1, 0.8),
          files: [],
        }],
        files: [],
      });

    const mkNotebook = (): RawOrder =>
      makeOrder({
        id: "nb-o", orderNumber: 2, productType: "notebook",
        orderLines: [{
          id: "nb-l", sortOrder: 0, productType: "notebook",
          mugProductId: null, mugProductSnapshot: null, notebookProductId: "nb-1",
          notebookProductSnapshot: notebookSnap("NB-BLK-A5"),
          largeFormatLineData: null,
          files: [{ id: "nbf", fileName: "cover.pdf", fileUrl: "/nbf", copies: 5, color: "bw", paperType: null, pageCount: null, orderLineId: "nb-l" }],
        }],
        files: [{ id: "nbf", fileName: "cover.pdf", fileUrl: "/nbf", copies: 5, color: "bw", paperType: null, pageCount: null, orderLineId: "nb-l" }],
      });

    const sections = groupLines([mkNotebook(), mkLf()]);
    expect(sections[0].productType).toBe("large_format_print");
    expect(sections[1].productType).toBe("notebook");
  });

  it("prio lines appear first in a group", () => {
    const mkLfOrder = (id: string, num: number, isPrio: boolean): RawOrder =>
      makeOrder({
        id,
        orderNumber: num,
        isPrio,
        productType: "large_format_print",
        orderLines: [{
          id: `${id}-l`, sortOrder: 0, productType: "large_format_print",
          mugProductId: null, mugProductSnapshot: null, notebookProductId: null,
          notebookProductSnapshot: null,
          largeFormatLineData: lfLineData("ORACAL", 60, 80, 1, 0.8),
          files: [],
        }],
        files: [],
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
