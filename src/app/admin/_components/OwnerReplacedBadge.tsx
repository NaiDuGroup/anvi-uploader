"use client";

import { FileUp } from "lucide-react";
import type { LayoutIssueDictionary } from "@/lib/i18n/layoutIssue/types";
import { formatLayoutFixedTime } from "@/lib/layoutIssueClient";

/**
 * «Файл заменён дилером 14:20» on a line card (workshop board, studio orders
 * list): the cabinet owner replaced the file of the line before it started
 * (step 4, `OrderLine.ownerReplacedAt`). An already downloaded file is stale.
 */
export function OwnerReplacedBadge({
  at,
  role,
  li,
  testId,
}: {
  at: string;
  role: string | null | undefined;
  li: LayoutIssueDictionary;
  testId?: string;
}) {
  const label = li.ownerReplacedAt(role === "dealer", formatLayoutFixedTime(at));
  return (
    <span
      data-testid={testId}
      title={label}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
    >
      <FileUp className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
