import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/** Amber badge on a DTF line without an artwork file (a site order may be placed without one). */
export function DtfNoFileBadge({ t, className }: { t: TranslationDictionary; className?: string }) {
  return (
    <p className={cn("inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800", className)}>
      {t.dtf.noFileYet}
    </p>
  );
}
