import { describe, it, expect } from "vitest";
import {
  AUTO_APPLY_THRESHOLD,
  CROSS_PAYER_CONFIDENCE,
  isSimilarCounterpartyName,
  normalizeCounterpartyName,
  scoreMatch,
  type MatchSignals,
} from "./match";

describe("normalizeCounterpartyName", () => {
  it("glues dotted legal forms and drops them", () => {
    expect(normalizeCounterpartyName('Î.I. "STRUC ALINA"')).toBe("STRUCALINA");
    expect(normalizeCounterpartyName("S.R.L. FLAMISA")).toBe("FLAMISA");
    expect(normalizeCounterpartyName("'KONSTAOIL' SRL")).toBe("KONSTAOIL");
  });

  it("repairs names wrapped mid-word by the bank", () => {
    expect(normalizeCounterpartyName("INTREPRINZATOR INDIVIDUAL STRUCALI NA")).toBe(
      "STRUCALINA",
    );
    expect(normalizeCounterpartyName("CRAFTI BUSINES S S.R.L.")).toBe(
      "CRAFTIBUSINESS",
    );
  });

  it("does not eat a name that merely starts with a legal-form prefix", () => {
    expect(normalizeCounterpartyName("SALT EDGE S.R.L.")).toBe("SALTEDGE");
  });

  it("returns empty for missing names", () => {
    expect(normalizeCounterpartyName(null)).toBe("");
    expect(normalizeCounterpartyName("  ")).toBe("");
  });
});

describe("isSimilarCounterpartyName", () => {
  it("matches the Struc Alina pair across two fiscal codes", () => {
    expect(
      isSimilarCounterpartyName('II STRUC ALIN', 'I.I. "STRUC ALINA"'),
    ).toBe(true);
  });

  it("rejects unrelated companies that merely paid the same amount", () => {
    expect(
      isSimilarCounterpartyName("ELCORE DISTRIBUTION S.R.L.", '"PROSPECT-UZ" S.R.L.'),
    ).toBe(false);
    expect(
      isSimilarCounterpartyName("SHVETS THORRA S.R.L.", "CAMELOT PARTNERS S.R.L."),
    ).toBe(false);
  });

  it("refuses to match on a stub too short to mean anything", () => {
    expect(isSimilarCounterpartyName("EI", "EI GROUP COMPANY")).toBe(false);
  });
});

describe("cross-payer confidence", () => {
  const base: MatchSignals = {
    numberMatch: false,
    idnoMatch: false,
    amountExact: true,
    uniqueOpenForClient: false,
  };

  it("scores a cross-payer hint below the auto-apply threshold", () => {
    const score = scoreMatch({ ...base, crossPayerName: true });
    expect(score).toBe(CROSS_PAYER_CONFIDENCE);
    expect(score).toBeLessThan(AUTO_APPLY_THRESHOLD);
  });

  it("stays silent when only the amount lines up", () => {
    expect(scoreMatch({ ...base, crossPayerName: false })).toBe(0);
  });

  it("does not weaken a normal same-payer match", () => {
    expect(scoreMatch({ ...base, idnoMatch: true })).toBe(82);
  });
});
