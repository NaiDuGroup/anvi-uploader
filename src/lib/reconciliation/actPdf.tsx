// Server-only PDF for the reconciliation act ("act de verificare"). Imported
// lazily by the act PDF route. Keep free of browser-only code.

import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Locale } from "@/lib/i18n/types";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import type { ClientStatement } from "./report";

let fontsRegistered = false;
function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: path.join(fontsDir, "NotoSans-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(fontsDir, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  fontsRegistered = true;
}

const LABELS: Record<Locale, Record<string, string>> = {
  ro: {
    heading: "ACT DE VERIFICARE",
    subtitle: "Reconcilierea decontărilor reciproce",
    supplier: "Furnizor",
    client: "Client",
    fiscalCode: "Cod fiscal",
    generatedAt: "Generat la",
    colDate: "Data",
    colDoc: "Document",
    colDebit: "Debit (facturat)",
    colCredit: "Credit (încasat)",
    colBalance: "Sold",
    rowPayment: "Încasare",
    rowReceipt: "Bon fiscal",
    rowPaperInvoice: "FF pe hârtie",
    rowHistoricalInvoice: "FF veche",
    paperFiscalNote: "în afara e-Factura",
    totalInvoiced: "Total facturat",
    totalPaid: "Total achitat",
    totalOutstanding: "Sold de plată",
    empty: "Nu există mișcări.",
    signSupplier: "Din partea furnizorului",
    signClient: "Din partea clientului",
  },
  ru: {
    heading: "АКТ СВЕРКИ",
    subtitle: "Сверка взаиморасчётов",
    supplier: "Поставщик",
    client: "Клиент",
    fiscalCode: "Фискальный код",
    generatedAt: "Сформирован",
    colDate: "Дата",
    colDoc: "Документ",
    colDebit: "Дебет (выставлено)",
    colCredit: "Кредит (оплачено)",
    colBalance: "Сальдо",
    rowPayment: "Оплата",
    rowReceipt: "Бон фискал",
    rowPaperInvoice: "Бумажная FF",
    rowHistoricalInvoice: "Старая ФФ",
    paperFiscalNote: "вне e-Factura",
    totalInvoiced: "Всего выставлено",
    totalPaid: "Всего оплачено",
    totalOutstanding: "Остаток к оплате",
    empty: "Нет движений.",
    signSupplier: "От поставщика",
    signClient: "От клиента",
  },
  en: {
    heading: "RECONCILIATION ACT",
    subtitle: "Reconciliation of mutual settlements",
    supplier: "Supplier",
    client: "Client",
    fiscalCode: "Fiscal code",
    generatedAt: "Generated at",
    colDate: "Date",
    colDoc: "Document",
    colDebit: "Debit (invoiced)",
    colCredit: "Credit (received)",
    colBalance: "Balance",
    rowPayment: "Payment",
    rowReceipt: "Fiscal receipt",
    rowPaperInvoice: "Paper FF",
    rowHistoricalInvoice: "Old FF",
    paperFiscalNote: "outside e-Factura",
    totalInvoiced: "Total invoiced",
    totalPaid: "Total paid",
    totalOutstanding: "Balance due",
    empty: "No movements.",
    signSupplier: "For the supplier",
    signClient: "For the client",
  },
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans",
    fontSize: 10,
    color: "#111827",
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 36,
    lineHeight: 1.35,
  },
  headerBlock: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 1.5,
    lineHeight: 1.2,
    marginTop: 6,
    marginBottom: 14,
  },
  subtitle: { fontSize: 11, textAlign: "center", color: "#6b7280", marginBottom: 2 },
  partiesRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  // Extra left padding: @react-pdf often clips the first glyph of bold Noto
  // text flush against a bordered View (e.g. "PERFECT" → "ERFECT").
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 8,
    paddingLeft: 10,
  },
  partyLabel: { fontSize: 9, fontWeight: "bold", color: "#6b7280", marginBottom: 4 },
  partyName: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
    paddingLeft: 1,
  },
  partyLine: { fontSize: 9, color: "#374151", marginTop: 1, paddingLeft: 1 },
  meta: { fontSize: 9, color: "#6b7280", marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4, marginBottom: 12 },
  headRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  th: { fontSize: 8, fontWeight: "bold", color: "#374151", textTransform: "uppercase" },
  td: { fontSize: 9, color: "#111827" },
  cDate: { flex: 1.2 },
  cDoc: { flex: 2.6 },
  cNum: { flex: 1.2, textAlign: "right" },
  debitCol: { color: "#b91c1c" },
  creditCol: { color: "#15803d" },
  muted: { color: "#6b7280" },
  docPrimary: { fontSize: 9, color: "#111827" },
  docPurpose: {
    fontSize: 7.5,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 1.3,
  },
  totalsBox: {
    alignSelf: "flex-end",
    width: "55%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 8,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 1 },
  totalsLabel: { fontSize: 9, color: "#374151" },
  totalsValue: { fontSize: 10, fontWeight: "bold" },
  dueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#111827",
  },
  dueLabel: { fontSize: 11, fontWeight: "bold" },
  dueValue: { fontSize: 12, fontWeight: "bold" },
  signatures: { marginTop: 32, flexDirection: "row", gap: 24 },
  sigCol: { flex: 1 },
  sigName: {
    fontSize: 10,
    marginTop: 20,
    borderTopWidth: 0.5,
    borderTopColor: "#9ca3af",
    paddingTop: 4,
  },
});

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function fmtMoney(v: string, locale: Locale): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v;
  const tag = locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "ro-RO";
  return n.toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function renderActPdfBuffer(
  statement: ClientStatement,
  currency: string,
  locale: Locale = "ro",
): Promise<Buffer> {
  ensureFontsRegistered();
  const L = LABELS[locale] ?? LABELS.ro;
  const supplier = await getOrCreateCompanyProfile();

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBlock}>
          <Text style={styles.heading}>{L.heading}</Text>
          <Text style={styles.subtitle}>{L.subtitle}</Text>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>{L.supplier}</Text>
            <Text style={styles.partyName}>{supplier.name}</Text>
            <Text style={styles.partyLine}>
              {L.fiscalCode}: {supplier.fiscalCode}
            </Text>
            <Text style={styles.partyLine}>{supplier.address}</Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>{L.client}</Text>
            <Text style={styles.partyName}>{statement.buyer.name}</Text>
            <Text style={styles.partyLine}>
              {L.fiscalCode}: {statement.buyer.idno}
            </Text>
          </View>
        </View>

        <Text style={styles.meta}>
          {L.generatedAt}: {fmtDate(statement.generatedAt)}
        </Text>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.th, styles.cDate]}>{L.colDate}</Text>
            <Text style={[styles.th, styles.cDoc]}>{L.colDoc}</Text>
            <Text style={[styles.th, styles.cNum, styles.debitCol]}>{L.colDebit}</Text>
            <Text style={[styles.th, styles.cNum, styles.creditCol]}>{L.colCredit}</Text>
            <Text style={[styles.th, styles.cNum]}>{L.colBalance}</Text>
          </View>
          {statement.entries.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.td}>{L.empty}</Text>
            </View>
          ) : (
            statement.entries.map((e) => (
              <View key={`${e.kind}-${e.sourceId}`} style={styles.row} wrap={false}>
                <Text style={[styles.td, styles.cDate]}>
                  {e.date ? fmtDate(e.date) : "—"}
                </Text>
                <View style={[styles.td, styles.cDoc]}>
                  <Text style={styles.docPrimary}>
                    {e.kind === "payment"
                      ? `${L.rowPayment}: ${e.document}`
                      : e.kind === "receipt"
                        ? `${L.rowReceipt}: ${e.document}`
                        : e.kind === "paper_invoice"
                          ? `${L.rowPaperInvoice}: ${e.document}`
                          : e.kind === "historical_invoice"
                            ? `${L.rowHistoricalInvoice}: ${e.document}`
                            : e.document}
                    {e.paperFiscal ? ` · ${L.paperFiscalNote}` : ""}
                  </Text>
                  {e.description ? (
                    <Text style={styles.docPurpose}>{e.description}</Text>
                  ) : e.kind === "paper_invoice" ||
                    e.kind === "historical_invoice" ? (
                    <Text style={styles.docPurpose}>
                      {e.kind === "historical_invoice"
                        ? L.rowHistoricalInvoice
                        : L.paperFiscalNote}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.td, styles.cNum, styles.debitCol]}>
                  {e.debit === "0.00" ? "" : fmtMoney(e.debit, locale)}
                </Text>
                <Text style={[styles.td, styles.cNum, styles.creditCol]}>
                  {e.credit === "0.00" ? "" : fmtMoney(e.credit, locale)}
                </Text>
                <Text style={[styles.td, styles.cNum]}>{fmtMoney(e.balance, locale)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{L.totalInvoiced}</Text>
            <Text style={styles.totalsValue}>
              {fmtMoney(statement.totalInvoiced, locale)} {currency}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{L.totalPaid}</Text>
            <Text style={styles.totalsValue}>
              {fmtMoney(statement.totalPaid, locale)} {currency}
            </Text>
          </View>
          <View style={styles.dueRow}>
            <Text style={styles.dueLabel}>{L.totalOutstanding}</Text>
            <Text style={styles.dueValue}>
              {fmtMoney(statement.totalOutstanding, locale)} {currency}
            </Text>
          </View>
        </View>

        <View style={styles.signatures}>
          <View style={styles.sigCol}>
            <Text style={styles.td}>{L.signSupplier}</Text>
            <Text style={styles.sigName}>{supplier.directorName ?? " "}</Text>
          </View>
          <View style={styles.sigCol}>
            <Text style={styles.td}>{L.signClient}</Text>
            <Text style={styles.sigName}> </Text>
          </View>
        </View>
      </Page>
    </Document>,
  );
}
