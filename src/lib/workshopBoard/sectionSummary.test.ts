import { describe, expect, it } from "vitest";
import type { ProductType } from "@/lib/validations";
import { summarizeBoard, summarizeSection } from "./sectionSummary";
import type {
  LineFacts,
  WorkshopBoardAggregate,
  WorkshopBoardLine,
  WorkshopBoardSection,
} from "./types";

function line(productType: ProductType, status: string, facts: LineFacts): WorkshopBoardLine {
  return {
    uid: `o::${status}`,
    orderId: "o",
    orderLineId: "l",
    orderNumber: 1,
    lineIndex: 1,
    totalLines: 1,
    phone: "079999999",
    clientName: null,
    status,
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: "2026-10-22T12:00:00Z",
    productType,
    facts,
    files: [],
    notes: null,
    createdByName: null,
    sentToWorkshopByName: null,
  };
}

function section(
  productType: ProductType,
  lines: WorkshopBoardLine[],
  totals: Partial<WorkshopBoardAggregate> = {},
): WorkshopBoardSection {
  const aggregate: WorkshopBoardAggregate = {
    lineCount: lines.length,
    orderCount: lines.length,
    totalQty: 0,
    ...totals,
  };
  return {
    productType,
    groups: [{ key: "g", label: "g", aggregate, lines, meta: {} }],
    totals: aggregate,
  };
}

const flyerFacts = (sheetsUsed: number): LineFacts => ({
  kind: "sheet_product",
  data: {
    paperName: "Coated 300",
    sheetWidthCm: 32,
    sheetHeightCm: 45,
    cardWidthCm: 15.4,
    cardHeightCm: 7.4,
    cardTrimWidthCm: 15,
    cardTrimHeightCm: 7,
    quantity: 100,
    cardsPerSheet: 10,
    sheetsUsed,
    sides: "two",
  },
});

const paperFacts: LineFacts = { kind: "paper", data: { paperType: "A4", color: "bw", quantity: 5 } };

describe("summarizeSection", () => {
  it("splits lines by status", () => {
    const summary = summarizeSection(
      section("paper_print", [
        line("paper_print", "SENT_TO_WORKSHOP", paperFacts),
        line("paper_print", "SENT_TO_WORKSHOP", paperFacts),
        line("paper_print", "WORKSHOP_READY", paperFacts),
      ], { totalQty: 15 }),
    );
    expect(summary.lineCount).toBe(3);
    expect(summary.byStatus).toEqual({ SENT_TO_WORKSHOP: 2, WORKSHOP_READY: 1 });
    expect(summary.volume).toEqual({ unit: "pieces", value: 15 });
  });

  it("measures flyers and business cards in printed sheets", () => {
    const summary = summarizeSection(
      section("flyer", [
        line("flyer", "SENT_TO_WORKSHOP", flyerFacts(10)),
        line("flyer", "WORKSHOP_PRINTING", flyerFacts(4)),
      ]),
    );
    expect(summary.volume).toEqual({ unit: "sheets", value: 14 });
  });

  it("measures wide-format print in linear meters", () => {
    const summary = summarizeSection(section("large_format_print", [], { totalLinearMeters: 3.16 }));
    expect(summary.volume).toEqual({ unit: "linear_meters", value: 3.16 });
  });
});

describe("summarizeBoard", () => {
  it("adds up lines and statuses across types", () => {
    const totals = summarizeBoard([
      summarizeSection(section("paper_print", [line("paper_print", "SENT_TO_WORKSHOP", paperFacts)])),
      summarizeSection(
        section("flyer", [
          line("flyer", "SENT_TO_WORKSHOP", flyerFacts(1)),
          line("flyer", "WORKSHOP_READY", flyerFacts(1)),
        ]),
      ),
    ]);
    expect(totals).toEqual({ lineCount: 3, byStatus: { SENT_TO_WORKSHOP: 2, WORKSHOP_READY: 1 } });
  });
});
