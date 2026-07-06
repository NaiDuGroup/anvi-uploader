// Server-only PDF rendering via @react-pdf/renderer. The module is imported
// lazily by /api/admin/invoices/[id]/pdf and /api/cabinet/invoices/[id]/pdf —
// keep it free of any client/browser-only code.

import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  InvoiceClientSnapshot,
  InvoiceSupplierSnapshot,
  SerializedInvoice,
  SerializedInvoiceLine,
} from "./invoiceSerialization";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/types";
import { resolveCompanyLogoBuffer } from "@/lib/companyLogo";
import { getDictionary } from "@/lib/i18n";

let fontsRegistered = false;

/**
 * Registers the bundled Noto Sans TTFs used in the invoice PDF. They cover
 * Cyrillic + Latin Extended (Romanian diacritics ăâîșț), so the same render
 * pipeline works for RO / RU / EN. Must be called before renderToBuffer.
 */
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  logo: { width: 48, height: 48 },
  heading: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
    flex: 1,
  },
  topMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#374151",
    marginBottom: 14,
  },
  validity: {
    marginTop: 4,
    fontSize: 9,
    color: "#92400e",
  },
  partiesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 8,
  },
  partyLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#6b7280",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  partyName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 9,
    color: "#374151",
    marginTop: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  th: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thArticle: { flex: 4 },
  thQty: { flex: 1, textAlign: "right" },
  thUnit: { flex: 1, textAlign: "right" },
  thPrice: { flex: 1.4, textAlign: "right" },
  thTotal: { flex: 1.4, textAlign: "right" },
  td: {
    fontSize: 9,
    color: "#111827",
  },
  tdMuted: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 1,
  },
  totalsBox: {
    marginTop: 6,
    alignSelf: "flex-end",
    width: "55%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 8,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 1,
  },
  totalsLabel: { fontSize: 9, color: "#374151" },
  totalsLabelMuted: { fontSize: 9, color: "#6b7280" },
  totalsValue: { fontSize: 10, color: "#111827", fontWeight: "bold" },
  totalsValueMuted: { fontSize: 9, color: "#6b7280" },
  totalsDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    marginVertical: 4,
  },
  totalDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#111827",
  },
  totalDueLabel: { fontSize: 11, fontWeight: "bold" },
  totalDueValue: { fontSize: 12, fontWeight: "bold" },
  signatures: {
    marginTop: 28,
    flexDirection: "row",
    gap: 24,
  },
  sigCol: { flex: 1 },
  sigLabel: { fontSize: 9, color: "#6b7280" },
  sigName: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "bold",
    marginTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: "#9ca3af",
    paddingTop: 4,
  },
  notes: {
    marginTop: 12,
    fontSize: 9,
    color: "#374151",
  },
});

function formatNumber(n: string | number, locale: Locale): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return String(n);
  const tag = locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "ro-RO";
  return num.toLocaleString(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQty(n: string | number, locale: Locale): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return String(n);
  const tag = locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "ro-RO";
  // Strip trailing zeros for whole numbers but keep up to 3 decimals.
  return num.toLocaleString(tag, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatIssueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Always render as DD.MM.YYYY on the PDF for visual parity with the
  // reference document.
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function PartyBlock({
  label,
  supplier,
  payer,
  t,
}: {
  label: string;
  supplier?: InvoiceSupplierSnapshot;
  payer?: InvoiceClientSnapshot;
  t: TranslationDictionary;
}) {
  if (supplier) {
    return (
      <View style={styles.party}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName}>{supplier.name}</Text>
        <Text style={styles.partyLine}>
          {t.pdfInvoice.fiscalCode}: {supplier.fiscalCode}
        </Text>
        <Text style={styles.partyLine}>
          {t.pdfInvoice.address}: {supplier.address}
        </Text>
        <Text style={styles.partyLine}>IBAN: {supplier.iban}</Text>
        <Text style={styles.partyLine}>{supplier.bankName}</Text>
        <Text style={styles.partyLine}>BIC: {supplier.bic}</Text>
      </View>
    );
  }
  if (payer) {
    const displayName =
      payer.companyName?.trim() ||
      payer.personName?.trim() ||
      payer.phone ||
      "—";
    return (
      <View style={styles.party}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName}>{displayName}</Text>
        {payer.companyIdno ? (
          <Text style={styles.partyLine}>
            {t.pdfInvoice.fiscalCode}: {payer.companyIdno}
          </Text>
        ) : null}
        {payer.phone ? (
          <Text style={styles.partyLine}>{payer.phone}</Text>
        ) : null}
        {payer.email ? (
          <Text style={styles.partyLine}>{payer.email}</Text>
        ) : null}
      </View>
    );
  }
  return null;
}

function LineRow({
  line,
  t,
  locale,
}: {
  line: SerializedInvoiceLine;
  t: TranslationDictionary;
  locale: Locale;
}) {
  return (
    <View style={styles.tableRow} wrap={false}>
      <View style={styles.thArticle}>
        <Text style={styles.td}>{line.description}</Text>
        {line.orderNumber != null ? (
          <Text style={styles.tdMuted}>
            {t.invoices.itemsLinkedOrder(line.orderNumber)}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.td, styles.thQty]}>
        {formatQty(line.quantity, locale)}
      </Text>
      <Text style={[styles.td, styles.thUnit]}>
        {line.unit || t.pdfInvoice.unitBuc}
      </Text>
      <Text style={[styles.td, styles.thPrice]}>
        {formatNumber(line.unitPrice, locale)}
      </Text>
      <Text style={[styles.td, styles.thTotal]}>
        {formatNumber(line.lineTotal, locale)}
      </Text>
    </View>
  );
}

function InvoiceDocument({
  invoice,
  supplier,
  payer,
  logoAbsolutePath,
  t,
  locale,
}: {
  invoice: SerializedInvoice;
  supplier: InvoiceSupplierSnapshot;
  payer: InvoiceClientSnapshot;
  logoAbsolutePath: string | null;
  t: TranslationDictionary;
  locale: Locale;
}) {
  const validityDays = Math.max(
    1,
    Math.round(
      (new Date(invoice.validUntil).getTime() -
        new Date(invoice.issueDate).getTime()) /
        86_400_000,
    ),
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoAbsolutePath ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image is not an HTML img element
            <Image src={logoAbsolutePath} style={styles.logo} />
          ) : (
            <View style={styles.logo} />
          )}
          <Text style={styles.heading}>{t.pdfInvoice.heading}</Text>
          <View style={styles.logo} />
        </View>

        <View style={styles.topMeta}>
          <Text>
            {t.pdfInvoice.invoiceNo} {invoice.number ?? "—"}
          </Text>
          <Text>
            {t.pdfInvoice.date}: {formatIssueDate(invoice.issueDate)}
          </Text>
        </View>
        <Text style={styles.validity}>
          {t.pdfInvoice.validity(validityDays)}
        </Text>

        <View style={styles.partiesRow}>
          <PartyBlock label={t.pdfInvoice.supplier} supplier={supplier} t={t} />
          <PartyBlock label={t.pdfInvoice.payer} payer={payer} t={t} />
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.thArticle]}>
              {t.pdfInvoice.article}
            </Text>
            <Text style={[styles.th, styles.thQty]}>{t.pdfInvoice.qty}</Text>
            <Text style={[styles.th, styles.thUnit]}> </Text>
            <Text style={[styles.th, styles.thPrice]}>
              {t.pdfInvoice.priceInclVat}
            </Text>
            <Text style={[styles.th, styles.thTotal]}>{t.pdfInvoice.total}</Text>
          </View>
          {invoice.lineItems.map((line) => (
            <LineRow key={line.id} line={line} t={t} locale={locale} />
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelMuted}>
              {t.pdfInvoice.includingVat}
            </Text>
            <Text style={styles.totalsValueMuted}>
              {formatNumber(invoice.vatAmount, locale)} {invoice.currency}
            </Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalDueRow}>
            <Text style={styles.totalDueLabel}>{t.pdfInvoice.totalDue}</Text>
            <Text style={styles.totalDueValue}>
              {formatNumber(invoice.totalAmount, locale)} {invoice.currency}
            </Text>
          </View>
        </View>

        {invoice.notes ? (
          <Text style={styles.notes}>{invoice.notes}</Text>
        ) : null}

        <View style={styles.signatures}>
          <View style={styles.sigCol}>
            <Text style={styles.sigLabel}>{t.pdfInvoice.director}</Text>
            <Text style={styles.sigName}>{supplier.directorName ?? " "}</Text>
          </View>
          <View style={styles.sigCol}>
            <Text style={styles.sigLabel}>{t.pdfInvoice.chiefAccountant}</Text>
            <Text style={styles.sigName}>{supplier.accountantName ?? " "}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Builds the invoice PDF buffer for download/inline render. Falls back to
 * the live company profile when supplier/client snapshots are missing
 * (i.e. for DRAFT previews — not normally exposed but kept robust).
 */
export async function renderInvoicePdfBuffer(input: {
  invoice: SerializedInvoice;
  supplier: InvoiceSupplierSnapshot;
  payer: InvoiceClientSnapshot;
  locale?: Locale;
}): Promise<Buffer> {
  ensureFontsRegistered();
  const locale: Locale =
    input.locale ?? (input.invoice.locale as Locale) ?? "ro";
  const t = getDictionary(locale);
  const logoBuf = await resolveCompanyLogoBuffer(input.supplier.logoPath ?? null);
  const logoArg = logoBuf
    ? // @react-pdf/renderer accepts a Buffer for Image#src.
      (logoBuf as unknown as string)
    : null;

  return renderToBuffer(
    <InvoiceDocument
      invoice={input.invoice}
      supplier={input.supplier}
      payer={input.payer}
      logoAbsolutePath={logoArg}
      t={t}
      locale={locale}
    />,
  );
}
