import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";
import { ISSUE_REASON_CODES } from "@/lib/issueReasonCode";
import type { ReasonLabelSets } from "./pure";

/**
 * Every label the ISSUE picker ever saved as `Order.issueReason`, per key, in
 * all three locales (old rows have no `issueReasonCode`). Server-only use:
 * imports the full dictionaries.
 */
export function issueReasonLabelSets(): ReasonLabelSets {
  const out: ReasonLabelSets = {};
  for (const code of ISSUE_REASON_CODES) {
    out[code] = [ru, ro, en].map((d) => d.admin.issueReasons[code]);
  }
  return out;
}
