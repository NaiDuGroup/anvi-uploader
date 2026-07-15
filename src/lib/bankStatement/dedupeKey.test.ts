import { describe, expect, it } from "vitest";
import { buildBankTxDedupeKey } from "./dedupeKey";

describe("buildBankTxDedupeKey", () => {
  const base = {
    accountIban: "MD82AG000000022515244995",
    bookingDate: new Date(Date.UTC(2026, 0, 15)),
    direction: "CREDIT" as const,
    amount: "991.00",
    documentNumber: "29",
    counterpartyIban: "MD10AG000002251304011399",
    counterpartyIdno: "1021600009948",
  };

  it("ignores purpose wrap differences when documentNumber is present", () => {
    const csv = buildBankTxDedupeKey({
      ...base,
      purpose: "PLATA PENTRU FELICITARI CONF FF EBD 000534472 DIN 04.12.2025",
    });
    const extras = buildBankTxDedupeKey({
      ...base,
      purpose: "PLATA PENTRU FELICIT ARI CONF FF EBD00053 4472 DIN 04.12.202",
      counterpartyIban: null, // TXT/CSV IBAN quirks must not matter when NDOC is set
    });
    expect(csv).toBe(extras);
  });

  it("uses normalized purpose when documentNumber is missing", () => {
    const a = buildBankTxDedupeKey({
      ...base,
      documentNumber: null,
      purpose: "Taxa  lunara",
    });
    const b = buildBankTxDedupeKey({
      ...base,
      documentNumber: null,
      purpose: "TAXA LUNARA",
    });
    expect(a).toBe(b);
  });
});
