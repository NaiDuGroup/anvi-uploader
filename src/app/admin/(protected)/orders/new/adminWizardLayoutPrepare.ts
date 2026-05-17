/**
 * Studio mug/notebook PATCH preparation: minimal upload-ready layout JSON when
 * the operator replaces the layout image file (no in-table canvas editor).
 */
import type { MugLayoutData, NotebookLayoutData } from "@/lib/validations";

export type WizardSlotLike = {
  id: string;
  sourceOrderLineId: string | null;
  file?: File;
};

export type SlotAssignLike = {
  productType: string;
  mugLayoutData?: MugLayoutData | null;
  notebookLayoutData?: NotebookLayoutData | null;
};

export function wizardLineKey(slot: {
  id: string;
  sourceOrderLineId: string | null;
}): string {
  return slot.sourceOrderLineId ?? slot.id;
}

export function minimalUploadReadyMugLayout(): MugLayoutData {
  return {
    templateId: "text_photo",
    text: "",
    fontFamily: "Roboto",
    textColor: "#000000",
    backgroundColor: "transparent",
    photoUrls: [],
    photoSettings: [],
  };
}

export function minimalUploadReadyNotebookLayout(): NotebookLayoutData {
  return {
    templateId: "text_photo",
    text: "",
    fontFamily: "Roboto",
    textColor: "#000000",
    backgroundColor: "transparent",
    photoUrls: [],
    photoSettings: [],
  };
}

/**
 * When any slot in an order-line group has a new local `file`, reset layout JSON
 * for all assigns in that group to minimal upload-ready metadata so PATCH stays
 * consistent with a freshly uploaded PNG.
 */
export function applyMinimalLayoutJsonWhenNewUpload<
  TSlot extends WizardSlotLike,
  TAssign extends SlotAssignLike,
>(slots: TSlot[], assignBySlot: Record<string, TAssign>): Record<string, TAssign> {
  const out: Record<string, TAssign> = { ...assignBySlot };
  let i = 0;
  while (i < slots.length) {
    const s0 = slots[i]!;
    const group: TSlot[] = [s0];
    const lid = s0.sourceOrderLineId;
    i++;
    if (lid != null) {
      while (i < slots.length && slots[i]!.sourceOrderLineId === lid) {
        group.push(slots[i]!);
        i++;
      }
    }

    const base = out[group[0]!.id];
    if (!base) continue;
    if (base.productType !== "mug" && base.productType !== "notebook") continue;

    const hasNewFile = group.some((slot) => Boolean(slot.file));
    if (!hasNewFile) continue;

    const minimal =
      base.productType === "mug"
        ? minimalUploadReadyMugLayout()
        : minimalUploadReadyNotebookLayout();

    for (const slot of group) {
      const a = out[slot.id];
      if (!a) continue;
      if (base.productType === "mug") {
        out[slot.id] = {
          ...a,
          mugLayoutData: minimal,
        } as TAssign;
      } else {
        out[slot.id] = {
          ...a,
          notebookLayoutData: minimal,
        } as TAssign;
      }
    }
  }
  return out;
}
