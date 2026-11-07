import { describe, it, expect } from "vitest";
import { formatPaperTypeLabel } from "./paperTypeLabel";
import type { TranslationDictionary } from "./i18n/types";

const fakeUpload: TranslationDictionary["upload"] = {
  title: "", subtitle: "", dragDrop: "", browseFiles: "", addMore: "",
  phoneLabel: "", phonePlaceholder: "", phoneError: "", submitOrder: "",
  colorOption: "Color", bwOption: "B&W", colorModeLabel: "",
  stepFiles: "", stepDetails: "", stepConfirm: "", next: "", back: "",
  paperSize: "",
  paperA0: "A0", paperA1: "A1", paperA2: "A2", paperA3: "A3",
  paperA4: "A4", paperA5: "A5", paperA6: "A6", paperOther: "Other",
  fileKindStickerArtwork: "Sticker artwork", fileKindFront: "Front", fileKindBack: "Back",
  fileKindLargeFormat: "Large format", fileKindMugLayout: "Mug layout",
  fileKindNotebookLayout: "Notebook layout", fileKindPenLayout: "Pen layout", fileKindArtwork: "Artwork",
  widthCm: "Width (cm)", heightCm: "Height (cm)",
  notesLabel: "", notesPlaceholder: "", applyAll: "",
  sameSettings: "", differentSettings: "", copiesLabel: "",
  copiesQuickPresetsAria: "", gdprTitle: "", gdprBody: "",
  gdprConsentBefore: "", gdprConsentLink: "", gdprConsentAfter: "", gdprSubmit: "", dataNotice: "", uploadingFile: "",
  errorRateLimited: "", errorFileTooLarge: "", errorSubmitFailed: "",
  orPasteLink: "", linkPlaceholder: "", addLink: "", externalLink: "", invalidLink: "",
};

describe("formatPaperTypeLabel", () => {
  it("returns translated label for each standard paper size", () => {
    expect(formatPaperTypeLabel("A0", fakeUpload)).toBe("A0");
    expect(formatPaperTypeLabel("A3", fakeUpload)).toBe("A3");
    expect(formatPaperTypeLabel("A4", fakeUpload)).toBe("A4");
    expect(formatPaperTypeLabel("A6", fakeUpload)).toBe("A6");
  });

  it("returns translated 'other' label", () => {
    expect(formatPaperTypeLabel("other", fakeUpload)).toBe("Other");
  });

  it("returns dash for null/undefined/empty", () => {
    expect(formatPaperTypeLabel(null, fakeUpload)).toBe("—");
    expect(formatPaperTypeLabel(undefined, fakeUpload)).toBe("—");
    expect(formatPaperTypeLabel("", fakeUpload)).toBe("—");
  });

  it("keeps plain format names but never shows an internal tag", () => {
    expect(formatPaperTypeLabel("B5", fakeUpload)).toBe("B5");
    expect(formatPaperTypeLabel("A3+", fakeUpload)).toBe("A3+");
    expect(formatPaperTypeLabel("custom-size", fakeUpload)).toBe("Artwork");
    expect(formatPaperTypeLabel("some_new_layout", fakeUpload)).toBe("Artwork");
  });

  it("labels card faces, sticker artwork and layout tags", () => {
    expect(formatPaperTypeLabel("business_card_front", fakeUpload)).toBe("Front");
    expect(formatPaperTypeLabel("business_card_back", fakeUpload, "flyer")).toBe("Back");
    expect(formatPaperTypeLabel("business_card_front", fakeUpload, "sticker_sheet")).toBe("Sticker artwork");
    expect(formatPaperTypeLabel("large_format", fakeUpload)).toBe("Large format");
    expect(formatPaperTypeLabel("mug_layout", fakeUpload)).toBe("Mug layout");
    expect(formatPaperTypeLabel("notebook_layout", fakeUpload)).toBe("Notebook layout");
    expect(formatPaperTypeLabel("pen_layout", fakeUpload)).toBe("Pen layout");
  });

  it("returns formatted label for other:WxH custom dimensions", () => {
    expect(formatPaperTypeLabel("other:30x40", fakeUpload)).toBe("Other (30×40 cm)");
    expect(formatPaperTypeLabel("other:10.5x21", fakeUpload)).toBe("Other (10.5×21 cm)");
  });

  it("hides the internal DTF zone tag", () => {
    expect(formatPaperTypeLabel("dtf:zmvkcfxno1", fakeUpload)).toBe("DTF");
    expect(formatPaperTypeLabel("uv:u1x2", fakeUpload)).toBe("UV");
  });
});
