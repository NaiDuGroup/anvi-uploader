import { describe, expect, it } from "vitest";
import {
  diffOrderEdit,
  parseOrderEditChanges,
  type OrderHistorySnapshot,
  type OrderLineHistorySnapshot,
} from "./orderEditDiff";
import { orderLineHistorySnapshot } from "./orderEditSnapshot";

const line = (over: Partial<OrderLineHistorySnapshot> = {}): OrderLineHistorySnapshot => ({
  id: "l1",
  productType: "mug",
  name: "Cană albă 330 ml",
  qty: 10,
  filesKey: "a.png·color·",
  optionsKey: "{}",
  ...over,
});

const snap = (over: Partial<OrderHistorySnapshot> = {}): OrderHistorySnapshot => ({
  lines: [line()],
  price: 340,
  phone: "+37360000000",
  clientId: null,
  clientName: "Ion",
  notes: null,
  ...over,
});

describe("diffOrderEdit", () => {
  it("no change → []", () => {
    expect(diffOrderEdit(snap(), snap())).toEqual([]);
  });

  it("whitespace-only notes / client name and price 340 vs 340.00 are not changes", () => {
    expect(diffOrderEdit(snap({ notes: "" }), snap({ notes: "  " }))).toEqual([]);
    expect(diffOrderEdit(snap({ price: 340 }), snap({ price: 340.001 }))).toEqual([]);
  });

  it("quantity and price", () => {
    const after = snap({ lines: [line({ qty: 12 })], price: 380 });
    expect(diffOrderEdit(snap(), after)).toEqual([
      { kind: "line_qty", name: "Cană albă 330 ml", type: "mug", from: 10, to: 12 },
      { kind: "price", from: 340, to: 380 },
    ]);
  });

  it("a quantity change does not also report the derived options", () => {
    const after = snap({ lines: [line({ qty: 12, optionsKey: '{"sheets":2}' })] });
    expect(diffOrderEdit(snap(), after).map((c) => c.kind)).toEqual(["line_qty"]);
  });

  it("added and removed lines", () => {
    const after = snap({ lines: [line({ id: "l2", name: null, productType: "paper_print", qty: 5 })] });
    expect(diffOrderEdit(snap(), after)).toEqual([
      { kind: "line_removed", name: "Cană albă 330 ml", type: "mug", qty: 10 },
      { kind: "line_added", name: null, type: "paper_print", qty: 5 },
    ]);
  });

  it("file replaced, options changed, product swapped", () => {
    expect(diffOrderEdit(snap(), snap({ lines: [line({ filesKey: "b.png·color·" })] }))).toEqual([
      { kind: "line_files", name: "Cană albă 330 ml", type: "mug" },
    ]);
    expect(diffOrderEdit(snap(), snap({ lines: [line({ optionsKey: '{"w":2}' })] }))).toEqual([
      { kind: "line_options", name: "Cană albă 330 ml", type: "mug" },
    ]);
    expect(diffOrderEdit(snap(), snap({ lines: [line({ name: "Cană neagră" })] }))).toEqual([
      { kind: "line_product", name: "Cană neagră", type: "mug", fromName: "Cană albă 330 ml" },
    ]);
  });

  it("client, phone, notes", () => {
    const after = snap({ clientId: "c1", clientName: "SRL Alfa", phone: "+37369999999", notes: "urgent" });
    expect(diffOrderEdit(snap(), after)).toEqual([
      { kind: "client", from: "Ion", to: "SRL Alfa" },
      { kind: "phone", from: "+37360000000", to: "+37369999999" },
      { kind: "notes" },
    ]);
  });
});

describe("parseOrderEditChanges", () => {
  it("keeps known kinds only; old rows → []", () => {
    expect(parseOrderEditChanges(null)).toEqual([]);
    expect(parseOrderEditChanges({})).toEqual([]);
    expect(parseOrderEditChanges({ changes: "x" })).toEqual([]);
    expect(parseOrderEditChanges({ changes: [{ kind: "notes" }, { kind: "costPrice", from: 1 }, null] })).toEqual([
      { kind: "notes" },
    ]);
  });
});

describe("orderLineHistorySnapshot", () => {
  it("paper line: name from the paper type, quantity = copies, files key ignores copies", () => {
    const base = {
      id: "l1",
      sortOrder: 0,
      productType: "paper_print",
      mugProductSnapshot: null,
      notebookProductSnapshot: null,
      penProductSnapshot: null,
      largeFormatLineData: null,
      files: [
        { id: "f1", fileName: "a.pdf", fileUrl: "uploads/a.pdf", copies: 3, color: "color", paperType: "A4", pageCount: 1 },
      ],
    };
    const a = orderLineHistorySnapshot(base);
    expect(a.qty).toBe(3);
    expect(a.name).toBeTruthy();
    const b = orderLineHistorySnapshot({ ...base, files: [{ ...base.files[0]!, copies: 5 }] });
    expect(b.qty).toBe(5);
    expect(b.filesKey).toBe(a.filesKey);
  });

  it("unreadable line → name / qty null", () => {
    const s = orderLineHistorySnapshot({ id: "x", productType: "mug", files: [] });
    expect(s).toMatchObject({ name: null, qty: null, optionsKey: null });
  });
});
