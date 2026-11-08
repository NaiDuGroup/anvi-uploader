/**
 * «Набор» C (ready set) rows → order lines: one line per row (print place).
 * Notebook → `notebook` line, pen → `pen` line (both «другой»: the set's own
 * items, never our stock), anything else (thermos) → a UV client-item line
 * with the place as its one zone. The server names / prices them and writes
 * the set item off once per set. Pure — the wizard and the tests share it.
 */
import type { AdminOrderLineInput } from "@/lib/validations";
import { readyZoneLineType, type GiftSetTemplate } from "@/lib/giftSet/giftSet";
import { readySetUvInput } from "@/lib/giftSet/giftSetReadyLines";
import { giftSetLineInput, type GiftSetRowAssign } from "@/lib/giftSet/giftSetWizard";
import { uvZoneFilePaperType } from "@/lib/uv/uvConstants";
import { minimalUploadReadyNotebookLayout, minimalUploadReadyPenLayout } from "./adminWizardLayoutPrepare";

export type ReadySetLineFields = Omit<AdminOrderLineInput, "files">;

/** Line fields (all but files) of one ready-set row; throws when the row's set / zone / colour is unknown. */
export function readySetRowLine(
  template: GiftSetTemplate | undefined,
  gs: GiftSetRowAssign,
  customerType: "retail" | "dealer",
  colourLabel: string | null,
): { line: ReadySetLineFields; paperType: string | undefined } {
  const zone = template?.zones.find((z) => z.id === gs.zoneId);
  if (!template || !zone || !gs.readyVariantId) throw new Error("gift_set_template_unknown");
  const set = giftSetLineInput(gs);
  const type = readyZoneLineType(zone.id);
  if (type === "notebook") {
    return {
      line: { productType: "notebook", notebookLayoutData: minimalUploadReadyNotebookLayout(), notebookOther: true, customerType, set },
      paperType: undefined,
    };
  }
  if (type === "pen") {
    return {
      line: { productType: "pen", penLayoutData: minimalUploadReadyPenLayout(), penOther: true, customerType, set },
      paperType: undefined,
    };
  }
  return {
    line: { productType: "uv_print", customerType, uv: readySetUvInput(zone, gs.quantity, colourLabel), set },
    paperType: uvZoneFilePaperType(zone.id),
  };
}
