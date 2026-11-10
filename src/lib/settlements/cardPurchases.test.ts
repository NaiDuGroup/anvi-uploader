import { describe, it, expect } from "vitest";
import {
  attributeCardPurchases,
  matchByName,
  normalizeMerchantName,
  parseCardPurchase,
  receiptsNotCoveredByCard,
} from "./cardPurchases";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("parseCardPurchase", () => {
  it("parses a card CSV row", () => {
    const p = parseCardPurchase(
      "Cumparaturi la Comercianti din 19.08.2026/4356***5688 la TM LIVRARE 5 CHISINAU MCC5200 493.MDL.LOCAL",
    );
    expect(p).toEqual({
      purchaseDate: day("2026-08-19"),
      merchantRaw: "TM LIVRARE 5 CHISINAU",
      merchantKey: "TMLIVRARE",
    });
  });

  it("stops at the foreign-currency tail", () => {
    const p = parseCardPurchase(
      "Cumparaturi la Comercianti din 27.03.2026/4356***5688 la Alibaba.com Singapore E-C 408-7855580/suma 477.88/USD",
    );
    expect(p?.purchaseDate).toEqual(day("2026-03-27"));
    expect(p?.merchantRaw).toBe("Alibaba.com Singapore E-C 408-7855580");
    expect(p?.merchantKey).toBe("ALIBABACOMSINGAPOREEC");
  });

  it("survives random spaces from the TXT extract", () => {
    const p = parseCardPurchase(
      "Cumparaturi la Comer cianti din 03.11.202 5/4356***5688 la AGR AF PRIM CHISINAU MCC 5200 493.MDL.ONUSDIF CURS.1.2258",
    );
    expect(p?.purchaseDate).toEqual(day("2025-11-03"));
    expect(p?.merchantRaw).toBe("AGR AF PRIM CHISINAU");
    expect(p?.merchantKey).toBe("AGRAFPRIM");
  });

  it.each([
    ["Cumparaturi la Comercianti din 12.06.202 4/43565688 la SA SOL ING", "2024-06-12", "SOLING"],
    [
      'Cumparaturi la Comercianti din 01.02.2024/4356***5688 la \\"CA RTNORD PAPER\\" S.R.L. MCC5111',
      "2024-02-01",
      "CARTNORDPAPER",
    ],
    ["Cumparaturi la Comercianti din 05.05.2025/4356***5688 la Pri nterra Shop MCC5943", "2025-05-05", "PRINTERRASHOP"],
    [
      "Cumparaturi la Comercianti din 06.06.2025/4356***5688 la MEL ITAX-GRUP SRL CHISIN AU MCC5045",
      "2025-06-06",
      "MELITAXGRUP",
    ],
    [
      "Cumparaturi la Comercianti din 07.07.2025/4356***5688 la ULT RACOM LIVRARE1 CHISI NAU MCC4215",
      "2025-07-07",
      "ULTRACOMLIVRARE",
    ],
    [
      "Cumparaturi la Comercianti din 08.08.2025/4356***5688 la MET RO STAUCENI 5 CHISIN AU MCC5411",
      "2025-08-08",
      "METRO",
    ],
  ])("parses %s", (purpose, date, key) => {
    const p = parseCardPurchase(purpose);
    expect(p?.purchaseDate).toEqual(day(date));
    expect(p?.merchantKey).toBe(key);
  });

  it("keeps the quoted merchant readable", () => {
    const p = parseCardPurchase(
      'Cumparaturi la Comercianti din 01.02.2024/4356***5688 la \\"CA RTNORD PAPER\\" S.R.L. MCC5111',
    );
    expect(p?.merchantRaw).toBe('"CA RTNORD PAPER" S.R.L.');
  });

  it("ignores fees and other bank rows", () => {
    expect(parseCardPurchase("Taxa lunara de admin a card suplim din 01.03.2026/4356***5688")).toBeNull();
    expect(parseCardPurchase("Comision pentru transfer")).toBeNull();
    expect(parseCardPurchase(null)).toBeNull();
  });
});

describe("normalizeMerchantName", () => {
  it("drops legal forms, punctuation and cities", () => {
    expect(normalizeMerchantName('"SOLING" S.R.L.')).toBe("SOLING");
    expect(normalizeMerchantName("Î.C.S. PRINTERRA SHOP S.R.L.")).toBe("PRINTERRASHOP");
    expect(normalizeMerchantName("AGRAF-PRIM SRL")).toBe("AGRAFPRIM");
    expect(normalizeMerchantName("CARTNORD PAPER SRL")).toBe("CARTNORDPAPER");
  });
});

describe("matchByName", () => {
  const names = [
    { idno: "1", key: "SOLING" },
    { idno: "2", key: "ULTRACOM" },
    { idno: "3", key: "METRO" },
    { idno: "4", key: "METROCASHCARRY" },
  ];
  it("matches when one contains the other", () => {
    expect(matchByName("SOLING", names)).toBe("1");
    expect(matchByName("ULTRACOMLIVRARE", names)).toBe("2");
  });
  it("needs exactly one IDNO", () => {
    expect(matchByName("METROCASHCARRYSTAUCENI", names)).toBeNull();
  });
  it("needs at least 5 chars on the shorter side", () => {
    expect(matchByName("TMLIVRARE", [{ idno: "9", key: "TM" }])).toBeNull();
  });
});

describe("attributeCardPurchases", () => {
  const purpose = (date: string, merchant: string) =>
    `Cumparaturi la Comercianti din ${date}/4356***5688 la ${merchant} MCC5200 1.MDL.LOCAL`;
  const debits = [
    { id: "a", amount: 100, bookingDate: day("2025-01-02"), purpose: purpose("01.01.2025", "SA SOL ING") },
    { id: "b", amount: 250.5, bookingDate: day("2025-02-02"), purpose: purpose("01.02.2025", "UNKNOWN SHOP") },
    { id: "c", amount: 77, bookingDate: day("2025-03-02"), purpose: purpose("01.03.2025", "Pri nterra Shop") },
    { id: "d", amount: 10, bookingDate: day("2025-03-02"), purpose: "Taxa lunara de admin a card suplim din 01.03.2025/4356***5688" },
    { id: "e", amount: 33, bookingDate: day("2025-04-02"), purpose: purpose("01.04.2025", "NO MATCH AT ALL") },
  ];
  const result = attributeCardPurchases({
    debits,
    aliases: [{ merchantKey: "PRINTERRASHOP", idno: null }],
    names: [
      { idno: "S1", name: "SOLING SRL" },
      { idno: "P1", name: "PRINTERRA SHOP SRL" },
      { idno: "BANK", name: "BC MAIB SA" },
    ],
    invoices: [
      { supplierIdno: "X1", totalAmount: 250.5, issueDate: day("2025-02-20") },
      { supplierIdno: "X2", totalAmount: 33, issueDate: day("2025-04-10") },
      { supplierIdno: "X3", totalAmount: 33, issueDate: day("2025-04-12") },
    ],
    excludedIdnos: new Set(["BANK"]),
  });
  const by = new Map(result.map((r) => [r.debitId, r]));

  it("skips non-purchases", () => {
    expect(by.has("d")).toBe(false);
    expect(result).toHaveLength(4);
  });
  it("attributes by name", () => {
    expect(by.get("a")).toMatchObject({ idno: "S1", source: "name" });
  });
  it("attributes by a unique amount when the name gives nothing", () => {
    expect(by.get("b")).toMatchObject({ idno: "X1", source: "amount" });
  });
  it("alias «не поставщик» beats the name match", () => {
    expect(by.get("c")).toMatchObject({ idno: null, source: null, ignored: true });
  });
  it("leaves ambiguous amounts unattributed", () => {
    expect(by.get("e")).toMatchObject({ idno: null, source: null, ignored: false });
  });
  it("amount window is −5..+30 days", () => {
    const r = attributeCardPurchases({
      debits: [debits[1]!],
      aliases: [],
      names: [],
      invoices: [{ supplierIdno: "X1", totalAmount: 250.5, issueDate: day("2025-01-20") }],
    });
    expect(r[0]?.idno).toBeNull();
  });
});

describe("receiptsNotCoveredByCard", () => {
  const receipt = (document: string, amount: number, date: string, supplierIdno = "S1") => ({
    document,
    supplierIdno,
    amount,
    date: day(date),
  });
  it("drops a receipt already paid by an attributed card purchase", () => {
    const kept = receiptsNotCoveredByCard(
      [receipt("AA1", 100, "2025-01-05"), receipt("AA2", 50, "2025-01-05")],
      [{ debitId: "c1", idno: "S1", amount: 100.01, date: day("2025-01-01") }],
    );
    expect(kept.map((k) => k.document)).toEqual(["AA2"]);
  });
  it("keeps it when the card is another supplier, far away or already used", () => {
    const kept = receiptsNotCoveredByCard(
      [
        receipt("AA1", 100, "2025-01-05"),
        receipt("AA2", 100, "2025-01-06"),
        receipt("AA3", 100, "2025-03-01"),
        receipt("BB1", 100, "2025-01-05", "S2"),
      ],
      [{ debitId: "c1", idno: "S1", amount: 100, date: day("2025-01-06") }],
    );
    expect(kept.map((k) => k.document)).toEqual(["BB1", "AA2", "AA3"]);
  });
});
