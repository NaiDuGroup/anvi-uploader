"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isImportStatus, type RequiredImportDocument } from "@/lib/imports/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  ordered: "bg-gray-100 text-gray-700",
  in_transit: "bg-sky-50 text-sky-800",
  customs: "bg-amber-50 text-amber-800",
  received: "bg-indigo-50 text-indigo-800",
  posted: "bg-emerald-50 text-emerald-800",
};

export function ImportStatusBadge({ status, postedMode }: { status: string; postedMode: string | null }) {
  const ti = useLanguageStore((s) => s.t.imports);
  const label: string = isImportStatus(status) ? ti.statuses[status] : status;
  const mode: string | null = postedMode === "normal" || postedMode === "historical" ? ti.postedModes[postedMode] : null;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status] ?? STATUS_STYLE.ordered)}>
      {label}
      {mode && status === "posted" ? ` · ${mode}` : ""}
    </span>
  );
}

/** Red «Не хватает: декларация, оплата» or a green tick when everything is there. */
export function MissingDocumentsBadge({ missing }: { missing: readonly RequiredImportDocument[] }) {
  const ti = useLanguageStore((s) => s.t.imports);
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {ti.allDocuments}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {ti.missing(missing.map((m) => ti.requiredDocs[m]).join(", "))}
    </span>
  );
}
