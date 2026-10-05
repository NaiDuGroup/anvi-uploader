/**
 * Studio mug/notebook/pen PATCH preparation: minimal upload-ready layout JSON
 * when the operator replaces the layout image file (no in-table canvas editor).
 */
import type {
  MugLayoutData,
  NotebookLayoutData,
  PenLayoutData,
} from "@/lib/validations";

export type WizardSlotLike = {
  id: string;
  sourceOrderLineId: string | null;
  file?: File;
};

export type SlotAssignLike = {
  productType: string;
  mugLayoutData?: MugLayoutData | null;
  notebookLayoutData?: NotebookLayoutData | null;
  penLayoutData?: PenLayoutData | null;
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

export function minimalUploadReadyPenLayout(): PenLayoutData {
  return {
    // Pen templates are their own set — `text_photo` is a mug/notebook id.
    templateId: "photo_only",
    text: "",
    fontFamily: "Roboto",
    textColor: "#000000",
    backgroundColor: "transparent",
    photoUrls: [],
    photoSettings: [],
  };
}

/** Which assign field each customizable product type keeps its layout JSON in. */
const LAYOUT_FIELD_BY_PRODUCT = {
  mug: "mugLayoutData",
  notebook: "notebookLayoutData",
  pen: "penLayoutData",
} as const satisfies Record<string, keyof SlotAssignLike>;

const MINIMAL_LAYOUT_BUILDERS = {
  mug: minimalUploadReadyMugLayout,
  notebook: minimalUploadReadyNotebookLayout,
  pen: minimalUploadReadyPenLayout,
} as const;

type CustomizableProduct = keyof typeof LAYOUT_FIELD_BY_PRODUCT;

function isCustomizableProduct(pt: string): pt is CustomizableProduct {
  return pt in LAYOUT_FIELD_BY_PRODUCT;
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
    if (!isCustomizableProduct(base.productType)) continue;

    const hasNewFile = group.some((slot) => Boolean(slot.file));
    if (!hasNewFile) continue;

    const field = LAYOUT_FIELD_BY_PRODUCT[base.productType];
    const minimal = MINIMAL_LAYOUT_BUILDERS[base.productType]();

    for (const slot of group) {
      const a = out[slot.id];
      if (!a) continue;
      out[slot.id] = { ...a, [field]: minimal } as TAssign;
    }
  }
  return out;
}
