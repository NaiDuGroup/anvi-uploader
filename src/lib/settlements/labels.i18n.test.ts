import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "./auditTypes";
import { SETTLEMENT_EXTRA_LABELS } from "./checkLabels";
import { SETTLEMENT_LABELS } from "./labels";
import { countRo, countRu } from "./plural";
import { CHECK_TYPES, type CheckSignal, type SettlementFlag } from "./types";

const CYRILLIC = /[Ѐ-ӿ]/;
const money = (n: number) => `${n.toFixed(2)} MDL`;
const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

/** Every string a label set can produce: plain leaves + functions called with sample args. */
function leaves(obj: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof obj === "string") {
    out.push([path, obj]);
    return;
  }
  if (typeof obj === "function") {
    const key = path.split(".").pop()!;
    const calls: unknown[][] = (() => {
      switch (key) {
        case "flagText":
          return (["duplicate_sale", "payment_without_invoice", "supplier_overpaid", "duplicate_payment"] as const).map(
            (kind): unknown[] => [
              { kind, amount: 10, dates: ["2026-01-01T00:00:00Z"], documents: ["AAA1"] } satisfies SettlementFlag,
              money,
              date,
            ],
          );
        case "text":
          return CHECK_TYPES.flatMap((type) =>
            [1, 3, 5].map((count): unknown[] => [
              {
                key: "k",
                type,
                idno: "1",
                name: "X",
                amount: 10,
                date: "2026-01-01T00:00:00Z",
                documents: ["AAA1", "BBB2"],
                count,
                ageDays: count * 10,
                confidence: 60,
                side: "sales",
                vatReason: "vat_negative",
              } satisfies CheckSignal,
              money,
              date,
            ]),
          );
        case "balanceText":
          return [[5, money], [-5, money], [0, money]];
        case "details":
          return AUDIT_ACTIONS.map((a): unknown[] => [
            a,
            {
              document: "AAA1",
              paymentDocument: "12",
              category: "supplier",
              merchantKey: "SHOP",
              idno: "1",
              asOfDate: "2026-01-01",
              note: "ok",
              startedBy: "Ana",
              processed: 3,
              remaining: 2,
              scanned: 4,
              key: "x:y",
            },
          ]).concat([["category_set", { category: null }], ["card_alias_set", { reset: true }], ["card_alias_set", {}]]);
        case "receiptOutText":
          return [["B/f 1", "card"], [null, "cash"], [null, null]];
        case "dismissedBy":
          return [["Ana", "01.01.2026", "ok"], [null, "01.01.2026", null]];
        default:
          return [[1, 2, 3], [3, 5, 7], [21, 101, 1000]];
      }
    })();
    calls.forEach((args, i) => {
      out.push([`${path}#${i}`, (obj as (...a: unknown[]) => string)(...args)]);
    });
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) leaves(v, path ? `${path}.${k}` : k, out);
  }
}

function collect(set: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  leaves(set, "", out);
  return out;
}

describe("settlements labels i18n", () => {
  for (const [name, set] of [
    ["labels", SETTLEMENT_LABELS.ro],
    ["checkLabels", SETTLEMENT_EXTRA_LABELS.ro],
  ] as const) {
    it(`RO ${name}: every leaf non-empty, no Cyrillic`, () => {
      const all = collect(set);
      expect(all.length).toBeGreaterThan(100);
      for (const [path, value] of all) {
        expect(value.trim(), path).not.toBe("");
        expect(CYRILLIC.test(value), `${path}: ${value}`).toBe(false);
      }
    });
  }

  it("EN has no Cyrillic either", () => {
    for (const [path, value] of [...collect(SETTLEMENT_LABELS.en), ...collect(SETTLEMENT_EXTRA_LABELS.en)]) {
      expect(CYRILLIC.test(value), `${path}: ${value}`).toBe(false);
    }
  });

  it("RU has no lazy «(ых)/(ей)» plural forms", () => {
    for (const [path, value] of [...collect(SETTLEMENT_LABELS.ru), ...collect(SETTLEMENT_EXTRA_LABELS.ru)]) {
      expect(/[а-яё]\((?:ых|ей|а|ы|ов|и)\)/i.test(value), `${path}: ${value}`).toBe(false);
    }
  });

  it("RU / RO counts", () => {
    const L = SETTLEMENT_LABELS.ru;
    expect(L.rowsCount(1)).toBe("1 контрагент");
    expect(L.rowsCount(4)).toBe("4 контрагента");
    expect(L.rowsCount(104)).toBe("104 контрагента");
    expect(L.rowsCount(111)).toBe("111 контрагентов");
    expect(L.rowsCount(21)).toBe("21 контрагент");
    expect(countRu(12, "a", "b", "c")).toBe("12 c");
    expect(SETTLEMENT_LABELS.ro.rowsCount(1)).toBe("1 contragent");
    expect(SETTLEMENT_LABELS.ro.rowsCount(4)).toBe("4 contragenți");
    expect(SETTLEMENT_LABELS.ro.rowsCount(104)).toBe("104 contragenți");
    expect(countRo(20, "factură", "facturi")).toBe("20 de facturi");
    expect(countRo(0, "factură", "facturi")).toBe("0 facturi");
  });
});
