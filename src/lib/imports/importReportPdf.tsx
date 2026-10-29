// Server-only: the import costing report (photos, purchase and landed cost per
// piece, current prices) that the owner takes to the head office. Imported
// lazily by /api/admin/imports/[id]/report.

import path from "node:path";
import sharp from "sharp";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ImportDetailJson, ImportLineJson } from "./dto";
import type { ImportsDictionary } from "@/lib/i18n/imports/types";
import type { Locale } from "@/lib/i18n/types";
import { resolveCompanyLogoBuffer } from "@/lib/companyLogo";

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

export interface ReportPrices {
  sellPrice: number | null;
  dealerPrice: number | null;
}

const PHOTO = 30;

const s = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 8, color: "#111827", paddingTop: 24, paddingBottom: 30, paddingHorizontal: 24, lineHeight: 1.3 },
  title: { fontSize: 14, fontWeight: "bold", lineHeight: 1.5, marginBottom: 2 },
  meta: { fontSize: 9, color: "#374151", marginBottom: 8 },
  costsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  costBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6 },
  costBoxTotal: { borderColor: "#111827" },
  costLabel: { fontSize: 7, color: "#6b7280" },
  costValue: { fontSize: 10, fontWeight: "bold" },
  costExcluded: { fontSize: 10, color: "#9ca3af", textDecoration: "line-through" },
  table: { borderWidth: 1, borderColor: "#d1d5db" },
  headRow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingVertical: 3 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", minHeight: PHOTO + 4 },
  totalRow: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 4 },
  th: { fontSize: 7, fontWeight: "bold", color: "#374151", paddingHorizontal: 3 },
  td: { fontSize: 8, paddingHorizontal: 3 },
  muted: { fontSize: 7, color: "#6b7280" },
  bold: { fontWeight: "bold" },
  photo: { width: PHOTO, height: PHOTO, objectFit: "contain" },
  note: { marginTop: 8, fontSize: 8, color: "#374151" },
  // From the top: `bottom` drops the fixed footer on landscape pages (@react-pdf 4).
  footer: { position: "absolute", top: 572, left: 24, right: 24, textAlign: "right", fontSize: 7, color: "#6b7280" },
});

// Column widths (landscape A4 ≈ 794pt usable).
const W = { photo: PHOTO + 6, code: 72, qty: 36, pu: 48, pt: 56, lu: 52, lt: 60, sell: 50, dealer: 50 } as const;
const r = { textAlign: "right" as const };

function tag(locale: Locale): string {
  return locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "ro-RO";
}
function money(n: number, locale: Locale): string {
  return n.toLocaleString(tag(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qty(n: number, locale: Locale): string {
  return n.toLocaleString(tag(locale), { maximumFractionDigits: 3 });
}
function dateOf(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return locale === "en" ? `${y}-${m}-${d}` : `${d}.${m}.${y}`;
}

/** Small JPEG of the stock item photo, else the supplier photo; null when neither loads. */
async function photoFor(line: ImportLineJson): Promise<Buffer | null> {
  for (const src of [line.variant?.imageUrl, line.supplierImageUrl]) {
    if (!src) continue;
    const raw: Buffer | null = await Promise.race([
      resolveCompanyLogoBuffer(src),
      new Promise<null>((done) => setTimeout(() => done(null), 6000)),
    ]);
    if (!raw) continue;
    try {
      return await sharp(raw).resize(120, 120, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
    } catch {
      // Not an image (or a format sharp cannot read): try the next source.
    }
  }
  return null;
}

async function loadPhotos(lines: readonly ImportLineJson[]): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < lines.length) {
      const line: ImportLineJson = lines[next++]!;
      const buf: Buffer | null = await photoFor(line);
      if (buf) out.set(line.id, buf);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

function ReportDocument({
  data,
  prices,
  photos,
  t,
  costKinds,
  locale,
}: {
  data: ImportDetailJson;
  prices: Map<string, ReportPrices>;
  photos: Map<string, Buffer>;
  t: ImportsDictionary["report"];
  costKinds: ImportsDictionary["costKinds"];
  locale: Locale;
}) {
  const costing = new Map(data.costing.lines.map((c) => [c.id, c]));
  const order: string = data.supplierOrderNo ?? data.proformaNo ?? "";
  const metaParts: string[] = [
    data.supplierName,
    data.proformaNo && data.proformaNo !== order ? `${t.proforma} ${data.proformaNo}` : null,
    dateOf(data.arrivedAt, locale) ? `${t.arrivedAt} ${dateOf(data.arrivedAt, locale)}` : null,
  ].filter((p): p is string => !!p);
  const totals = data.lines.reduce(
    (a, l) => {
      const c = costing.get(l.id);
      return { qty: a.qty + l.quantity, amount: a.amount + l.amount, purchase: a.purchase + (c?.purchaseTotalMdl ?? 0), landed: a.landed + (c?.landedTotalMdl ?? 0) };
    },
    { qty: 0, amount: 0, purchase: 0, landed: 0 },
  );
  const excluded = data.costs.filter((c) => c.excluded);
  const cur: string = data.currency;

  return (
    <Document title={`${t.title} ${order}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${t.title} ${order} · ${t.page(pageNumber, totalPages)}`}
        />
        <Text style={s.title}>
          {t.title} {order}
        </Text>
        <Text style={s.meta}>{metaParts.join(" · ")}</Text>

        <View style={s.costsRow}>
          {data.costs.map((c) => (
            <View key={c.id} style={s.costBox}>
              <Text style={s.costLabel}>
                {costKinds[c.kind as keyof typeof costKinds] ?? c.kind}
                {c.excluded ? ` · ${t.excluded}` : c.isProvisional ? ` · ${t.provisional}` : ""}
              </Text>
              <Text style={c.excluded ? s.costExcluded : s.costValue}>{money(c.amountMdl, locale)} MDL</Text>
            </View>
          ))}
          <View style={[s.costBox, s.costBoxTotal]}>
            <Text style={s.costLabel}>{t.totalCosts}</Text>
            <Text style={s.costValue}>{money(data.costing.totalCostsMdl, locale)} MDL</Text>
          </View>
          <View style={s.costBox}>
            <Text style={s.costLabel}>{t.goodsAmount}</Text>
            <Text style={s.costValue}>
              {money(data.costing.goodsAmount, locale)} {cur}
            </Text>
          </View>
          <View style={s.costBox}>
            <Text style={s.costLabel}>{t.rate(cur)}</Text>
            <Text style={s.costValue}>
              {money(data.costing.purchasePerCurrencyUnit, locale)} / {money(data.costing.landedPerCurrencyUnit, locale)}
            </Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.headRow} fixed>
            <Text style={[s.th, { width: W.photo }]}>{t.cols.photo}</Text>
            <Text style={[s.th, { width: W.code }]}>{t.cols.code}</Text>
            <Text style={[s.th, { flex: 1 }]}>{t.cols.description}</Text>
            <Text style={[s.th, r, { width: W.qty }]}>{t.cols.qty}</Text>
            <Text style={[s.th, r, { width: W.pu }]}>{t.cols.purchaseUnit}</Text>
            <Text style={[s.th, r, { width: W.pt }]}>{t.cols.purchaseTotal}</Text>
            <Text style={[s.th, r, { width: W.lu }]}>{t.cols.landedUnit}</Text>
            <Text style={[s.th, r, { width: W.lt }]}>{t.cols.landedTotal}</Text>
            <Text style={[s.th, r, { width: W.sell }]}>{t.cols.sell}</Text>
            <Text style={[s.th, r, { width: W.dealer }]}>{t.cols.dealer}</Text>
          </View>
          {data.lines.map((l) => {
            const c = costing.get(l.id);
            const p: ReportPrices | undefined = l.variant ? prices.get(l.variant.id) : undefined;
            const photo: Buffer | undefined = photos.get(l.id);
            const name: string | null = l.variant ? [l.variant.name, l.variant.label].filter(Boolean).join(" · ") : null;
            return (
              <View key={l.id} style={s.row} wrap={false}>
                <View style={{ width: W.photo, paddingHorizontal: 3 }}>
                  {photo ? (
                    // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image is not an HTML img; it accepts a Buffer as src
                    <Image style={s.photo} src={photo as unknown as string} />
                  ) : null}
                </View>
                <Text style={[s.td, { width: W.code }]}>{l.supplierCode}</Text>
                <View style={{ flex: 1, paddingHorizontal: 3 }}>
                  <Text>{l.description}</Text>
                  {name ? <Text style={s.muted}>{name}</Text> : null}
                  {l.skip ? <Text style={s.muted}>{t.skipped}</Text> : null}
                </View>
                <Text style={[s.td, r, { width: W.qty }]}>{qty(l.quantity, locale)}</Text>
                <Text style={[s.td, r, { width: W.pu }]}>{money(c?.purchaseUnitMdl ?? 0, locale)}</Text>
                <Text style={[s.td, r, { width: W.pt }]}>{money(c?.purchaseTotalMdl ?? 0, locale)}</Text>
                <Text style={[s.td, r, s.bold, { width: W.lu }]}>{money(c?.landedUnitMdl ?? 0, locale)}</Text>
                <Text style={[s.td, r, { width: W.lt }]}>{money(c?.landedTotalMdl ?? 0, locale)}</Text>
                <Text style={[s.td, r, { width: W.sell }]}>{p?.sellPrice != null ? money(p.sellPrice, locale) : "—"}</Text>
                <Text style={[s.td, r, { width: W.dealer }]}>{p?.dealerPrice != null ? money(p.dealerPrice, locale) : "—"}</Text>
              </View>
            );
          })}
          <View style={s.totalRow} wrap={false}>
            <Text style={[s.td, s.bold, { width: W.photo + W.code }]}>{t.total}</Text>
            <Text style={[s.td, s.muted, { flex: 1 }]}>{t.positions(data.lines.length)}</Text>
            <Text style={[s.td, r, s.bold, { width: W.qty }]}>{qty(totals.qty, locale)}</Text>
            <Text style={[s.td, { width: W.pu }]} />
            <Text style={[s.td, r, s.bold, { width: W.pt }]}>{money(totals.purchase, locale)}</Text>
            <Text style={[s.td, { width: W.lu }]} />
            <Text style={[s.td, r, s.bold, { width: W.lt }]}>{money(totals.landed, locale)}</Text>
            <Text style={[s.td, { width: W.sell + W.dealer }]} />
          </View>
        </View>

        <Text style={s.note}>{t.method}</Text>
        {excluded.length > 0 ? (
          <Text style={s.note}>
            {t.excludedNote(excluded.map((c) => `${costKinds[c.kind as keyof typeof costKinds] ?? c.kind} ${money(c.amountMdl, locale)} MDL`).join(", "))}
          </Text>
        ) : null}
        {data.costing.provisional ? <Text style={s.note}>{t.provisionalNote}</Text> : null}

      </Page>
    </Document>
  );
}

export async function renderImportReportPdf(input: {
  data: ImportDetailJson;
  prices: Map<string, ReportPrices>;
  dictionary: ImportsDictionary;
  locale: Locale;
}): Promise<Buffer> {
  ensureFontsRegistered();
  const photos = await loadPhotos(input.data.lines);
  return renderToBuffer(
    <ReportDocument
      data={input.data}
      prices={input.prices}
      photos={photos}
      t={input.dictionary.report}
      costKinds={input.dictionary.costKinds}
      locale={input.locale}
    />,
  );
}
