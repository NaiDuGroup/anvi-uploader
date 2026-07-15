import { describe, it, expect } from "vitest";
import { parseMaibCsv } from "./parseMaibCsv";

const HEADER =
  "DATA,NDOC,DC,ST,CCL,CCOR,CCORT,CFC,CFCCOR,CBC,DENC,DENCT,TV,SUMN,SUML,TD,DE1,DE2,DE3,DE4,PRI,DAT_TR,DAT_AC,BIC,COD_TRANZ,URGENT";

const OUR = "1023600000396";
const OUR_IBAN = "MD82AG000000022515244995";

// Incoming customer payment (DC=1), purpose split across DE1/DE2.
const INCOMING =
  "01-07-2026,284,1, ,MD82AG000000022515244995,MD42ML022510000000001018, ,1002600012266,1023600000396, ,(R) 'KONSTAOIL' SRL, ,MDL,584.00,584.00,1,SERVICII IMPRIMARE CONF.FACTURA EBJ 000662654 DIN 29/06/2,026, ,, ,,01-07-2026,MOLDMD2X,001,N";

// Outgoing bank commission (DC=0).
const OUTGOING =
  "01-07-2026,1822000,0, ,MD82AG000000022515244995,490252250, ,1023600000396,1002600003778, ,BC 'MAIB' S.A. Sucursala Constantin Tanase, ,MDL,12.40,12.40,6,Retinerea comisionului-operatiunile acceptare card Visa. ,(R)Anvi Studi o Group SRL, ,, ,,01-07-2026,AGRNMD2X493, ,N";

const OPENING = "143494.24000000002,,,,,,,,,,,,,,,,,,,,,,,,,";

function build(...rows: string[]): string {
  return [HEADER, OPENING, ...rows].join("\n");
}

describe("parseMaibCsv", () => {
  it("captures the opening balance row without treating it as a transaction", () => {
    const res = parseMaibCsv(build(INCOMING), { ourFiscalCode: OUR, ourIban: OUR_IBAN });
    expect(res.openingBalance).toBe("143494.24");
    expect(res.transactions).toHaveLength(1);
  });

  it("parses an incoming payment: direction, amount, concatenated purpose, payer IDNO", () => {
    const res = parseMaibCsv(build(INCOMING), { ourFiscalCode: OUR, ourIban: OUR_IBAN });
    const tx = res.transactions[0];
    expect(tx.direction).toBe("CREDIT");
    expect(tx.amount).toBe("584.00");
    expect(tx.currency).toBe("MDL");
    expect(tx.counterpartyName).toBe("'KONSTAOIL' SRL");
    // DE1 + DE2 reconstruct the full date/number.
    expect(tx.purpose).toContain("EBJ 000662654");
    expect(tx.purpose).toContain("DIN 29/06/2026");
    // For CREDIT the payer fiscal code (CFC) is the counterparty, not ours.
    expect(tx.counterpartyIdno).toBe("1002600012266");
    expect(tx.counterpartyIban).toBe("MD42ML022510000000001018");
    expect(tx.bookingDate.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("marks bank commissions as DEBIT and resolves counterparty to the non-us code", () => {
    const res = parseMaibCsv(build(OUTGOING), { ourFiscalCode: OUR, ourIban: OUR_IBAN });
    const tx = res.transactions[0];
    expect(tx.direction).toBe("DEBIT");
    expect(tx.amount).toBe("12.40");
    // DC=0: beneficiary (CFCCOR) is the counterparty.
    expect(tx.counterpartyIdno).toBe("1002600003778");
    expect(tx.txTypeCode).toBe("6");
  });

  it("deduplicates identical rows within a file", () => {
    const res = parseMaibCsv(build(INCOMING, INCOMING), { ourFiscalCode: OUR });
    expect(res.transactions).toHaveLength(1);
    expect(res.warnings.some((w) => /Duplicate/.test(w.message))).toBe(true);
  });

  it("produces distinct dedupe keys for different transactions", () => {
    const res = parseMaibCsv(build(INCOMING, OUTGOING), { ourFiscalCode: OUR });
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0].dedupeKey).not.toBe(res.transactions[1].dedupeKey);
  });

  it("computes the statement period from booking dates", () => {
    const later = INCOMING.replace("01-07-2026", "05-07-2026");
    const res = parseMaibCsv(build(INCOMING, later), { ourFiscalCode: OUR });
    expect(res.periodFrom?.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(res.periodTo?.toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  it("skips rows with an unrecognized date and reports a warning", () => {
    const bad = INCOMING.replace("01-07-2026", "not-a-date");
    const res = parseMaibCsv(build(bad), { ourFiscalCode: OUR });
    expect(res.transactions).toHaveLength(0);
    expect(res.warnings.some((w) => /date/.test(w.message))).toBe(true);
  });

  it("parses caret-delimited card export without CCORT and MM/DD/YY dates", () => {
    const caret = [
      "DATA^NDOC^DC^ST^CCL^CCOR^CFC^CFCCOR^CBC^DENC^DENCT^TV^SUMN^SUML^TD^DE1^DE2^DE3^DE4^PRI^DAT_TR^DAT_AC^BIC^COD_TRANZ^URGENT",
      "136762.94",
      "01/13/26^2119808210^0^^MD52AG000000022585325901^2797^^1023600000396^1002600003778^^BC 'MAIB' S.A.^^MDL^718.00^718.00^1^Cumparaturi la Comercianti din 12.01.2026/4356***^5688 493.MDL^^^^^01/13/26^^001^N",
      "01/16/26^6779772^1^^MD52AG000000022585325901^^^^1023600000396^^^^MDL^265.00^265.00^1^^^^^^^01/16/26^^001^N",
    ].join("\n");
    const res = parseMaibCsv(caret, { ourFiscalCode: OUR });
    expect(res.openingBalance).toBe("136762.94");
    expect(res.accountIban).toBe("MD52AG000000022585325901");
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0].direction).toBe("DEBIT");
    expect(res.transactions[0].amount).toBe("718.00");
    expect(res.transactions[0].bookingDate.toISOString().slice(0, 10)).toBe("2026-01-13");
    expect(res.transactions[0].counterpartyIdno).toBe("1002600003778");
    expect(res.transactions[1].direction).toBe("CREDIT");
    expect(res.transactions[1].amount).toBe("265.00");
  });
});
