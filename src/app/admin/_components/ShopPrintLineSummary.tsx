"use client";

import { Globe } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { parseShopPrintLine } from "@/lib/shop/printLine";
import { parseShopLang, shopT } from "@/lib/storefront/i18n";
import { cn } from "@/lib/utils";

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
  if (!parsed) return null;
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
            {r.total != null ? <span className="ml-1 font-semibold tabular-nums">· {r.total} MDL</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
