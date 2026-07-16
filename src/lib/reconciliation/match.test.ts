import { describe, it, expect } from "vitest";
import {
  extractInvoiceRefs,
  classifyFiscalRef,
  scoreMatch,
  suggestHistoricalDocument,
  shouldSkipFifoForPurpose,
  AUTO_APPLY_THRESHOLD,
} from "./match";

describe("extractInvoiceRefs", () => {
  it("extracts a fiscal token with a space between series and number", () => {
    const r = extractInvoiceRefs("SERVICII IMPRIMARE CONF.FACTURA EBJ 000662654 DIN 29/06/2026");
    expect(r.fiscalTokens).toContain("EBJ000662654");
    expect(r.paperTokens).toHaveLength(0);
  });

  it("extracts a fiscal token written as Nr.EBJ...", () => {
    const r = extractInvoiceRefs("Plata pentru Marfuri conform e-factura Nr.EBJ000872384 din 03-07-2026");
    expect(r.fiscalTokens).toContain("EBJ000872384");
    // The digits after EBJ must not also be captured as a cont number.
    expect(r.contNumbers).toHaveLength(0);
  });

  it("extracts an RP fiscal token", () => {
    const r = extractInvoiceRefs("Plata pentru produse tiparite conf fact.RP000014415 din 02.07.2026");
    expect(r.fiscalTokens).toContain("RP000014415");
  });

  it("extracts a plain cont number", () => {
    const r = extractInvoiceRefs("Plata conform Factura/Cont de plata/Invoice Nr.1 din 13-07-2026");
    expect(r.contNumbers).toContain(1);
  });

  it("returns empty for purposes without references", () => {
    const r = extractInvoiceRefs("Retinerea comisionului-operatiunile acceptare card Visa");
    expect(r.fiscalTokens).toHaveLength(0);
    expect(r.paperTokens).toHaveLength(0);
    expect(r.contNumbers).toHaveLength(0);
  });

  it("keeps CONF FF + e-Factura series as fiscal (FF is abbreviation)", () => {
    const r = extractInvoiceRefs("PLATA PENTRU FELICITARI CONF FF EBD 000534472 DIN 04.12.2025");
    expect(r.fiscalTokens).toContain("EBD000534472");
    expect(r.paperTokens).toHaveLength(0);
  });

  it("extracts glued FFAAQ… as paper AAQ4557640", () => {
    const r = extractInvoiceRefs("Plata pentru brosura conform FFAAQ455764 0 din 28.02.2023");
    expect(r.paperTokens).toContain("AAQ4557640");
    expect(r.fiscalTokens).toHaveLength(0);
  });

  it("extracts AAQ with mid-number wrap as paper", () => {
    const r = extractInvoiceRefs("Plata pentru brosura conffacturiiAAQ4557 640 din 28.02.2023");
    expect(r.paperTokens).toContain("AAQ4557640");
  });

  it("extracts clean AAQ4557640 as paper", () => {
    const r = extractInvoiceRefs("Plata pentru brosura conf facturii AAQ4557640 din 28.02.2023");
    expect(r.paperTokens).toContain("AAQ4557640");
  });

  it("extracts f/f AAQ4557650 as paper", () => {
    const r = extractInvoiceRefs(
      "Plata pentru servicii imprimare con f f/f AAQ4557650 din 10.09.2024 f/t",
    );
    expect(r.paperTokens).toContain("AAQ4557650");
  });

  it("does not treat DIN + date as a paper token", () => {
    const r = extractInvoiceRefs("SERVICII IMPRIMARE CONF.FACTURA EBJ 000662654 DIN 29/06/2026");
    expect(r.paperTokens).toHaveLength(0);
    expect(r.fiscalTokens).toContain("EBJ000662654");
  });
});

describe("classifyFiscalRef", () => {
  it("classifies e-Factura EA/EB/RP series", () => {
    expect(classifyFiscalRef("EAH", "000507006")).toBe("efactura");
    expect(classifyFiscalRef("RP", "000014415")).toBe("efactura");
  });

  it("classifies AAQ short numbers as paper", () => {
    expect(classifyFiscalRef("AAQ", "4557640")).toBe("paper");
  });

  it("rejects denylisted series", () => {
    expect(classifyFiscalRef("DIN", "29062026")).toBe("other");
    expect(classifyFiscalRef("TVA", "611067")).toBe("other");
  });
});

describe("scoreMatch", () => {
  it("gives a perfect score when number, amount and IDNO all match", () => {
    expect(
      scoreMatch({ numberMatch: true, amountExact: true, idnoMatch: true, uniqueOpenForClient: false }),
    ).toBe(100);
  });

  it("auto-applies when number + amount match even without IDNO", () => {
    const score = scoreMatch({ numberMatch: true, amountExact: true, idnoMatch: false, uniqueOpenForClient: false });
    expect(score).toBeGreaterThanOrEqual(AUTO_APPLY_THRESHOLD);
  });

  it("keeps bare idno-only matches below the auto-apply threshold", () => {
    const score = scoreMatch({
      numberMatch: false,
      amountExact: false,
      idnoMatch: true,
      uniqueOpenForClient: false,
    });
    expect(score).toBeLessThan(AUTO_APPLY_THRESHOLD);
  });

  it("returns 0 when there are no signals", () => {
    expect(
      scoreMatch({ numberMatch: false, amountExact: false, idnoMatch: false, uniqueOpenForClient: false }),
    ).toBe(0);
  });
});

describe("shouldSkipFifoForPurpose", () => {
  it("is true for AAQ paper purposes (SALON SLIMS regression)", () => {
    expect(
      shouldSkipFifoForPurpose(
        "Plata pu flaere conf orm factura AAQ45576 43 din 03.03.23",
      ),
    ).toBe(true);
  });
});

describe("suggestHistoricalDocument", () => {
  it("prefers Cont nr.N from LIDER LAND-style purposes", () => {
    expect(
      suggestHistoricalDocument(
        "Plata p/u servicii p rint bannerconform f acturii nr.1 din31.0 3.2023",
      ),
    ).toBe("nr.1");
  });

  it("prefers paper FF tokens over purpose snippet", () => {
    expect(
      suggestHistoricalDocument(
        "Plata pentru brosura conf facturii AAQ4557640 din 28.02.2023",
      ),
    ).toBe("AAQ4557640");
  });

  it("falls back to a short purpose snippet", () => {
    expect(suggestHistoricalDocument("Alimentare cont")).toBe("Alimentare cont");
  });

  it("returns em dash for empty purpose", () => {
    expect(suggestHistoricalDocument(null)).toBe("—");
    expect(suggestHistoricalDocument("")).toBe("—");
  });
});
