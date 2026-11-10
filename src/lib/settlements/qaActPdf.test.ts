import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/invoice/companyProfile", () => ({
  getOrCreateCompanyProfile: async () => ({
    name: "PERFECT ȘTIINȚĂ ÎNTÂI SRL",
    fiscalCode: "1012600000001",
    address: "mun. Chișinău, str. Ștefan cel Mare 1",
    iban: "MD00AG000000000000000001",
    bankName: "MAIB",
    bic: "AGRNMD2X",
    directorName: "Țurcanu Ăndrei",
    currency: "MDL",
  }),
}));

import { buildSettlementAct } from "./act";
import { renderSettlementActPdf } from "./actPdf";
import { renderActPdfBuffer } from "@/lib/reconciliation/actPdf";
import { sliceLedger, withRunningBalance } from "./period";
import type { LedgerEntry } from "./types";

/** PDFs land in the OS temp dir for a manual look (QA_ACT_PDF_KEEP=1 prints the path). */
const OUT = mkdtempSync(path.join(tmpdir(), "qa-act-pdf-"));
if (process.env.QA_ACT_PDF_KEEP) console.log("act PDFs in", OUT);

/** Text per page (pdf.js, worker on the main thread). */
async function pageTexts(buf: Buffer): Promise<string[]> {
  const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= DOMMatrix;
  g.ImageData ??= ImageData;
  g.Path2D ??= Path2D;
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    out.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
  }
  await doc.destroy();
  return out;
}

function ledger(n: number): LedgerEntry[] {
  const kinds = ["sale_invoice", "payment_in", "purchase_invoice", "payment_out", "receipt", "refund", "card_payment_out", "receipt_out", "historical_invoice"] as const;
  const raw = [] as Omit<LedgerEntry, "balance">[];
  raw.push({ kind: "opening_balance", date: "2025-12-31T12:00:00.000Z", document: "", description: "Sold 1C", amount: 1234.56 });
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length]!;
    const sign = ["payment_in", "purchase_invoice", "receipt"].includes(k) ? -1 : 1;
    raw.push({
      kind: k,
      date: new Date(Date.UTC(2026, 0, 2 + i, 21, 30)).toISOString(),
      document: `AAA${1000 + i}`,
      description: i % 3 === 0 ? "Plată pentru servicii tipografice, achitare factură ăâîșț ĂÂÎȘȚ — оплата по счёту" : null,
      amount: sign * (100 + i * 1.115),
    });
  }
  return withRunningBalance(raw);
}

describe("QA act PDFs", () => {
  for (const locale of ["ru", "ro"] as const) {
    it(`renders ${locale}`, async () => {
      const slice = sliceLedger(ledger(12), { from: "2026-01-01", to: "2026-12-31" });
      const act = buildSettlementAct(slice);
      const buf = await renderSettlementActPdf({
        idno: "1003600000002", name: "ÎNTREPRINDEREA «ȘARM-ȚESĂTORIA» SRL", period: { from: "2026-01-01", to: "2026-12-31" },
        firstDay: null, act, locale, now: new Date("2026-11-10T08:00:00Z"),
      });
      writeFileSync(path.join(OUT, `act-${locale}.pdf`), buf);
      expect(buf.length).toBeGreaterThan(1000);
    });
  }

  it("long act: header + page number on every page, dates in Chișinău, ro after ru", async () => {
    const slice = sliceLedger(ledger(70), { from: null, to: null });
    const act = buildSettlementAct(slice);
    const texts: Record<string, string[]> = {};
    for (const locale of ["ru", "ro", "ru"] as const) {
      const buf = await renderSettlementActPdf({
        idno: "1003600000002", name: "ООО «Щука-Ёж» Ţ", period: { from: null, to: null },
        firstDay: "2025-12-31", act, locale, now: new Date("2026-11-10T22:30:00Z"),
      });
      writeFileSync(path.join(OUT, `act-long-${locale}.pdf`), buf);
      texts[locale] = await pageTexts(buf);
    }
    const ru = texts.ru!;
    const ro = texts.ro!;
    expect(ru.length).toBeGreaterThan(1);
    ru.forEach((t, i) => {
      expect(t).toContain("ДЕБЕТ"); // th is uppercase
      expect(t).toContain(`стр. ${i + 1} из ${ru.length}`);
    });
    ro.forEach((t, i) => {
      expect(t).toContain("DEBIT");
      expect(t).toContain(`pag. ${i + 1} din ${ro.length}`);
    });
    // Bold runs keep their first glyph in RO after RU.
    expect(ro.join(" ")).toContain("Sold la sfârșitul perioadei");
    // "generated" 22:30Z on 10.11 is already 11.11 in Chișinău.
    expect(ru.at(-1)).toContain("Сформирован: 11.11.2026");
    // Verdict and signatures share the last page.
    expect(ru.at(-1)).toContain("Задолженность в пользу");
    expect(ru.at(-1)).toContain("М.П.");

    // totals = sum of rows
    const d = act.rows.reduce((s, r) => s + Math.round(r.debit * 100), 0);
    const c = act.rows.reduce((s, r) => s + Math.round(r.credit * 100), 0);
    expect(d / 100).toBe(act.debitTotal);
    expect(c / 100).toBe(act.creditTotal);
    expect(act.closing).toBe(slice.closing);
  }, 30_000);

  it("old sales act with refund + payerName: labels present in ro / ru / en", async () => {
    const st = {
      buyer: { idno: "1003600000002", name: "Client Ș" },
      generatedAt: "2026-11-10T22:30:00Z",
      entries: [
        { kind: "refund", sourceId: "1", date: "2026-03-01T00:00:00Z", document: "R1", debit: "10.00", credit: "0.00", balance: "10.00", description: null, payerName: null },
        { kind: "payment", sourceId: "2", date: "2026-03-02T00:00:00Z", document: "P1", debit: "0.00", credit: "10.00", balance: "0.00", description: null, payerName: "Ion Popescu", payerIdno: "2000" },
      ],
      totalInvoiced: "10.00", totalPaid: "10.00", totalOutstanding: "0.00",
    };
    const expected = { ru: ["Возврат: R1", "Оплатил: Ion Popescu"], ro: ["Restituire: R1", "Achitat de: Ion Popescu"], en: ["Refund: R1", "Paid by: Ion Popescu"] };
    for (const l of ["ru", "ro", "en"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buf = await renderActPdfBuffer(st as any, "MDL", l);
      writeFileSync(path.join(OUT, `old-sales-act-${l}.pdf`), buf);
      const text = (await pageTexts(buf)).join(" ");
      for (const s of expected[l]) expect(text).toContain(s);
      expect(text).toContain("11.11.2026"); // generated date in Chișinău
      expect(text).not.toContain("undefined");
    }
  }, 30_000);
});
