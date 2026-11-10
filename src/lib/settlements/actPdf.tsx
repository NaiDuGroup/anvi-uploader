// Server-only PDF «Акт сверки взаиморасчётов» (both sides) for one counterparty.
// Same look as the sales act (src/lib/reconciliation/actPdf.tsx).

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import {
  actStyles as styles,
  ensureFontsRegistered,
  ensureLocaleFontFamily,
  fmtDate,
  fmtMoney,
} from "@/lib/reconciliation/actPdf";
import type { SettlementAct } from "./act";
import { getSettlementLabels } from "./labels";
import type { SettlementPeriod } from "./types";

export type SettlementActLocale = "ru" | "ro";

interface ActText {
  heading: string;
  period: (from: string, to: string) => string;
  asOf: (date: string) => string;
  intro: (us: string, them: string) => string;
  fiscalCode: string;
  iban: string;
  bank: string;
  colDate: string;
  colDoc: string;
  colDebit: string;
  colCredit: string;
  opening: string;
  turnover: string;
  closing: string;
  debtInFavour: (party: string, amount: string) => string;
  noDebt: string;
  empty: string;
  signFor: (party: string) => string;
  stamp: string;
  director: string;
  generatedAt: string;
  pageOf: (page: number, total: number) => string;
}

const TEXT: Record<SettlementActLocale, ActText> = {
  ru: {
    heading: "АКТ СВЕРКИ ВЗАИМОРАСЧЁТОВ",
    period: (f, t) => `за период с ${f} по ${t}`,
    asOf: (d) => `по состоянию на ${d}`,
    intro: (us, them) =>
      `Мы, нижеподписавшиеся, ${us}, с одной стороны, и ${them}, с другой стороны, составили настоящий акт о том, что состояние взаимных расчётов по данным ${us} следующее:`,
    fiscalCode: "IDNO",
    iban: "IBAN",
    bank: "Банк",
    colDate: "Дата",
    colDoc: "Документ",
    colDebit: "Дебет",
    colCredit: "Кредит",
    opening: "Сальдо на начало периода",
    turnover: "Обороты за период",
    closing: "Сальдо на конец периода",
    debtInFavour: (p, a) => `Задолженность в пользу ${p} составляет ${a}.`,
    noDebt: "Взаимная задолженность отсутствует.",
    empty: "За период движений нет.",
    signFor: (p) => `От ${p}`,
    stamp: "М.П.",
    director: "Директор",
    generatedAt: "Сформирован",
    pageOf: (p, t) => `стр. ${p} из ${t}`,
  },
  ro: {
    heading: "ACT DE VERIFICARE A DECONTĂRILOR RECIPROCE",
    period: (f, t) => `pentru perioada ${f} – ${t}`,
    asOf: (d) => `la data de ${d}`,
    intro: (us, them) =>
      `Subsemnații, ${us}, pe de o parte, și ${them}, pe de altă parte, am întocmit prezentul act privind starea decontărilor reciproce conform datelor ${us}:`,
    fiscalCode: "IDNO",
    iban: "IBAN",
    bank: "Banca",
    colDate: "Data",
    colDoc: "Document",
    colDebit: "Debit",
    colCredit: "Credit",
    opening: "Sold la începutul perioadei",
    turnover: "Rulaj pe perioadă",
    closing: "Sold la sfârșitul perioadei",
    debtInFavour: (p, a) => `Datoria în favoarea ${p} constituie ${a}.`,
    noDebt: "Datorii reciproce nu există.",
    empty: "Nu există mișcări în perioadă.",
    signFor: (p) => `Din partea ${p}`,
    stamp: "L.Ș.",
    director: "Director",
    generatedAt: "Generat la",
    pageOf: (p, t) => `pag. ${p} din ${t}`,
  },
};

/** Separate font family per act language (see ensureLocaleFontFamily). */
function ensureActFont(locale: SettlementActLocale): string {
  return ensureLocaleFontFamily("Noto Sans Act", locale);
}

const local = StyleSheet.create({
  heading: { fontSize: 15, letterSpacing: 0.8 },
  intro: { fontSize: 9, color: "#374151", marginBottom: 10 },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  bold: { fontWeight: "bold" },
  verdict: { fontSize: 10.5, fontWeight: "bold", marginTop: 4, marginBottom: 4 },
  stamp: { fontSize: 8, color: "#6b7280", marginTop: 6 },
  pageNumber: {
    position: "absolute",
    bottom: 14,
    left: 36,
    right: 36,
    textAlign: "right",
    fontSize: 8,
    color: "#6b7280",
  },
});

/*
 * The page-level lineHeight moves onto a content wrapper: @react-pdf 4.5
 * drops `render`-prop text (the page number) that inherits a multiplier
 * lineHeight from <Page>.
 */
const { lineHeight: bodyLineHeight, ...pageStyle } = styles.page;

function ymdToDisplay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

export interface SettlementActPdfInput {
  idno: string;
  name: string;
  period: SettlementPeriod;
  /** First entry day when the period has no start (YYYY-MM-DD). */
  firstDay: string | null;
  act: SettlementAct;
  locale: SettlementActLocale;
  now?: Date;
}

export async function renderSettlementActPdf(input: SettlementActPdfInput): Promise<Buffer> {
  ensureFontsRegistered();
  const fontFamily = ensureActFont(input.locale);
  const T = TEXT[input.locale];
  const kinds = getSettlementLabels(input.locale).ledgerKinds;
  const us = await getOrCreateCompanyProfile();
  const { act } = input;
  const now = input.now ?? new Date();
  const money = (n: number) => `${fmtMoney(n.toFixed(2), input.locale)} ${us.currency}`;
  const cell = (n: number) => (n === 0 ? "" : fmtMoney(n.toFixed(2), input.locale));
  const today = fmtDate(now.toISOString());
  const toDay = input.period.to ? ymdToDisplay(input.period.to) : today;
  const fromDay = input.period.from
    ? ymdToDisplay(input.period.from)
    : input.firstDay
      ? ymdToDisplay(input.firstDay)
      : null;
  const subtitle = fromDay ? T.period(fromDay, toDay) : T.asOf(toDay);

  const usName = us.name;
  const themName = input.name && input.name !== "—" ? input.name : input.idno;

  const sideCells = (n: number) => (
    <>
      <Text style={[styles.td, styles.cNum, local.bold]}>{n > 0 ? cell(n) : ""}</Text>
      <Text style={[styles.td, styles.cNum, local.bold]}>{n < 0 ? cell(-n) : ""}</Text>
    </>
  );

  return renderToBuffer(
    <Document>
      <Page size="A4" style={[pageStyle, { fontFamily }]}>
        <Text
          style={local.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => T.pageOf(pageNumber, totalPages)}
        />
        <View style={{ lineHeight: bodyLineHeight }}>
          <View style={styles.headerBlock}>
            <Text style={[styles.heading, local.heading]}>{T.heading}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.partiesRow}>
            <View style={styles.party}>
              <Text style={styles.partyName}>{usName}</Text>
              <Text style={styles.partyLine}>
                {T.fiscalCode}: {us.fiscalCode}
              </Text>
              {us.address ? <Text style={styles.partyLine}>{us.address}</Text> : null}
              {us.iban ? (
                <Text style={styles.partyLine}>
                  {T.iban}: {us.iban}
                </Text>
              ) : null}
              {us.bankName ? (
                <Text style={styles.partyLine}>
                  {T.bank}: {us.bankName}
                  {us.bic ? ` · BIC ${us.bic}` : ""}
                </Text>
              ) : null}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyName}>{themName}</Text>
              <Text style={styles.partyLine}>
                {T.fiscalCode}: {input.idno}
              </Text>
            </View>
          </View>

          <Text style={local.intro}>{T.intro(usName, themName)}</Text>

          <View style={styles.table}>
            {/* fixed: repeated at the top of the table on every page it spans */}
            <View style={styles.headRow} fixed>
              <Text style={[styles.th, styles.cDate]}>{T.colDate}</Text>
              <Text style={[styles.th, styles.cDoc]}>{T.colDoc}</Text>
              <Text style={[styles.th, styles.cNum]}>{T.colDebit}</Text>
              <Text style={[styles.th, styles.cNum]}>{T.colCredit}</Text>
            </View>

            <View style={local.summaryRow} wrap={false}>
              <Text style={[styles.td, styles.cDate]}>{fromDay ?? ""}</Text>
              <Text style={[styles.td, styles.cDoc, local.bold]}>{T.opening}</Text>
              {sideCells(act.opening)}
            </View>

            {act.rows.length === 0 ? (
              <View style={styles.row}>
                <Text style={[styles.td, styles.muted]}>{T.empty}</Text>
              </View>
            ) : (
              act.rows.map((r, i) => (
                <View key={i} style={styles.row} wrap={false}>
                  <Text style={[styles.td, styles.cDate]}>{r.date ? fmtDate(r.date) : "—"}</Text>
                  <View style={[styles.td, styles.cDoc]}>
                    <Text style={styles.docPrimary}>
                      {kinds[r.kind]}
                      {r.document ? `: ${r.document}` : ""}
                    </Text>
                    {r.description ? <Text style={styles.docPurpose}>{r.description}</Text> : null}
                  </View>
                  <Text style={[styles.td, styles.cNum]}>{cell(r.debit)}</Text>
                  <Text style={[styles.td, styles.cNum]}>{cell(r.credit)}</Text>
                </View>
              ))
            )}

            <View style={local.summaryRow} wrap={false}>
              <Text style={[styles.td, styles.cDate]} />
              <Text style={[styles.td, styles.cDoc, local.bold]}>{T.turnover}</Text>
              <Text style={[styles.td, styles.cNum, local.bold]}>{fmtMoney(act.debitTotal.toFixed(2), input.locale)}</Text>
              <Text style={[styles.td, styles.cNum, local.bold]}>{fmtMoney(act.creditTotal.toFixed(2), input.locale)}</Text>
            </View>
            <View style={local.summaryRow} wrap={false}>
              <Text style={[styles.td, styles.cDate]}>{toDay}</Text>
              <Text style={[styles.td, styles.cDoc, local.bold]}>{T.closing}</Text>
              {sideCells(act.closing)}
            </View>
          </View>
          {/* Verdict, signatures and the date stay together on one page. */}
          <View wrap={false}>
            <Text style={local.verdict}>
              {act.inFavourOf === "us"
                ? T.debtInFavour(usName, money(act.closing))
                : act.inFavourOf === "them"
                  ? T.debtInFavour(themName, money(-act.closing))
                  : T.noDebt}
            </Text>

            <View style={styles.signatures}>
              <View style={styles.sigCol}>
                <Text style={styles.td}>{T.signFor(usName)}</Text>
                <Text style={styles.sigName}>
                  {T.director}
                  {us.directorName ? ` ${us.directorName}` : ""}
                </Text>
                <Text style={local.stamp}>{T.stamp}</Text>
              </View>
              <View style={styles.sigCol}>
                <Text style={styles.td}>{T.signFor(themName)}</Text>
                <Text style={styles.sigName}>{T.director}</Text>
                <Text style={local.stamp}>{T.stamp}</Text>
              </View>
            </View>

            <Text style={[styles.meta, { marginTop: 18 }]}>
              {T.generatedAt}: {today}
            </Text>
          </View>
        </View>
      </Page>
    </Document>,
  );
}
