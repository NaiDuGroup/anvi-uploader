"use client";

import { Globe } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { parseShopPrintLine } from "@/lib/shop/printLine";
import { parseShopLang, shopT } from "@/lib/storefront/i18n";
import { cn } from "@/lib/utils";
import { isPsQuoteLine } from "@/lib/storefront/printShop/pricing";
import { psLineOptions, psLineTitle } from "@/lib/storefront/printShop/text";

/**
 * Storefront photo / document printing line (`shopLineData.kind = "print"`)
 * in the admin: every file with its options — format or photo size, colour,
 * one-sided / double-sided, pages, finish, copies — and its price. The `File`
 * rows carry copies / colour / format / pages like a print.anvi.md upload;
 * duplex and finish exist only here.
 */
export function ShopPrintLineSummary({ dataRaw, className }: { dataRaw: unknown; className?: string }) {
  const locale = useLanguageStore((s) => s.locale);
  const t = shopT(parseShopLang(locale));
  const parsed = parseShopPrintLine(dataRaw, t);
  if (!parsed) return <ShopPrintShopPaperLineSummary dataRaw={dataRaw} className={className} />;
  return (
    <div className={cn("rounded-md border border-indigo-100 bg-indigo-50/50 px-2 py-1.5 text-[11px] text-gray-700", className)}>
      <p className="mb-1 flex items-center gap-1 font-semibold text-indigo-900">
        <Globe className="h-3 w-3" aria-hidden />
        {parsed.mode === "doc" ? t("printDocTitle") : t("printPhotoTitle")}
      </p>
      <ol className="m-0 list-decimal space-y-0.5 pl-4">
        {parsed.rows.map((r, i) => (
          <li key={i}>
            <span className="font-medium text-gray-900">{r.fileName}</span>
            <span className="text-gray-400"> — </span>
            {r.text}
            {r.pagesByCustomer ? (
              <span className="ml-1 rounded bg-amber-100 px-1 font-semibold text-amber-800" title={t("printPagesByCustomer")}>
                {" "}
                {t("printPagesByCustomer")}
              </span>
            ) : null}
            {r.total != null ? <span className="font-semibold tabular-nums">{` · ${r.total} MDL`}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Print-shop paper line (`shopLineData.kind = "sheetShop"` on a `paper_print`
 * line — sticker sheets, desk calendars): product, format and options, the run
 * and the price. The `File` row carries the format, copies and page count.
 */
function ShopPrintShopPaperLineSummary({ dataRaw, className }: { dataRaw: unknown; className?: string }) {
  const locale = useLanguageStore((s) => s.locale);
  const lang = parseShopLang(locale);
  if (dataRaw == null || typeof dataRaw !== "object") return null;
  const d = dataRaw as Record<string, unknown>;
  if (d.kind !== "sheetShop" || !isPsQuoteLine(d.quote)) return null;
  const q = d.quote;
  return (
    <div className={cn("rounded-md border border-violet-100 bg-violet-50/50 px-2 py-1.5 text-[11px] text-gray-700", className)}>
      <p className="m-0 flex flex-wrap items-center gap-1 font-semibold text-violet-900">
        <Globe className="h-3 w-3" aria-hidden />
        {psLineTitle(q, lang)}
        <span className="font-normal text-gray-700">· {psLineOptions(q, lang)}</span>
        <span className="font-semibold tabular-nums">· ×{q.quantity}</span>
        {typeof d.total === "number" ? <span className="font-semibold tabular-nums">{` · ${d.total} MDL`}</span> : null}
      </p>
    </div>
  );
}
