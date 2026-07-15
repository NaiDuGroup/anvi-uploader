import { describe, expect, it } from "vitest";
import { parseMaibExtrasTxt } from "./parseMaibExtrasTxt";

const SAMPLE = `
BC'MAIB'S.A. suc. Constantin Tanase
                                   EXTRAS DIN CONT
                              pentru 01.01.2023-31.12.2025

Titular: ANVI-STUDIO GROUP S.R.L. / Cod Fiscal: 1023600000396
Cod IBAN: MD52AG000000022585325901/MDL
--------------------------------------------------------------------------------------------------------------------------------------------------
N/O|        |BIC        |           Cont         |Cod fiscal   |Denumire           |  Numarul   |T |   Rulaj    |   Rulaj    |Destinatia          |
--------------------------------------------------------------------------------------------------------------------------------------------------
SOLD INITIAL LA 01.01.2023                                                                                  0.00         0.00
1   20.09.23 AGRNMD2X493 MD82AG000000022515244995 1023600000396 (R) ANVI-STUDIO GRO 3            1          0.00     2,000.00 Transfer intre contu
                                                                  UP S.R.L.                                                   ri proprii
213 18.06.25 AGRNMD2X452 MD36AG000000022516181097 1024600060562 (R)  GOLDEN YARD S. 175          1          0.00     3,800.00 Plata pentru Servici
                                                                  R.L.                                                        i conform Factura/Co
                                                                                                                              nt de plata/Invoice
                                                                                                                              Nr.EAY 00035497 din
                                                                                                                              10-06-2025 TVA 20%
100026.03.24 AGRNMD2X435 MD62AG000000022514187473 1021600004437 (R) SALON SLIMS S.R 56           1          0.00     5,226.00 Plata pu servicii im
                                                                  L.                                                          primare
230 16.07.25 AGRNMD2X437 MD10AG000002251304011399 1003600029104 (R) PRUT INTERNATIO 1878         1          0.00    16,748.00 Plata pru imprimare
                                                                  NAL S.R.L.                                                  conform facturii EAV
                                                                                                                              000343130 din 19.02.
                                                                                                                              25 Inclusiv TVA 2791
                                                                                                                              .33
`.trim();

describe("parseMaibExtrasTxt", () => {
  it("parses header IBAN, period, and credits with wrapped purpose", () => {
    const parsed = parseMaibExtrasTxt(SAMPLE);
    expect(parsed.accountIban).toBe("MD52AG000000022585325901");
    expect(parsed.periodFrom?.toISOString().slice(0, 10)).toBe("2023-01-01");
    expect(parsed.periodTo?.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(parsed.transactions.length).toBe(4);

    const golden = parsed.transactions.find((t) => t.counterpartyIdno === "1024600060562");
    expect(golden).toBeTruthy();
    expect(golden!.direction).toBe("CREDIT");
    expect(golden!.amount).toBe("3800.00");
    expect(golden!.purpose).toMatch(/EAY\s*00035497/i);
    expect(golden!.counterpartyName).toMatch(/GOLDEN YARD/i);

    const prut = parsed.transactions.find((t) => t.amount === "16748.00");
    expect(prut?.counterpartyIdno).toBe("1003600029104");
    expect(prut?.purpose).toMatch(/EAV\s*000343130/i);
  });

  it("parses glued N/O+date rows (N/O ≥ 1000)", () => {
    const parsed = parseMaibExtrasTxt(SAMPLE);
    const glued = parsed.transactions.find((t) => t.counterpartyIdno === "1021600004437");
    expect(glued).toBeTruthy();
    expect(glued!.bookingDate.toISOString().slice(0, 10)).toBe("2024-03-26");
    expect(glued!.amount).toBe("5226.00");
  });

  it("rejects non-extras text", () => {
    const parsed = parseMaibExtrasTxt("DATA,NDOC,DC\n01-01-2024,1,1");
    expect(parsed.transactions).toHaveLength(0);
    expect(parsed.warnings[0]?.line).toBe(1);
  });
});
