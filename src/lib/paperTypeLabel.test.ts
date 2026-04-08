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
  widthCm: "Width (cm)", heightCm: "Height (cm)",
  notesLabel: "", notesPlaceholder: "", applyAll: "",
  sameSettings: "", differentSettings: "", copiesLabel: "",
  copiesQuickPresetsAria: "", gdprTitle: "", gdprBody: "",
  gdprConsent: "", gdprSubmit: "", dataNotice: "", uploadingFile: "",
  orPasteLink: "", linkPlaceholder: "", addLink: "", externalLink: "",
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

  it("returns raw string for unknown paper types", () => {
    expect(formatPaperTypeLabel("B5", fakeUpload)).toBe("B5");
    expect(formatPaperTypeLabel("custom-size", fakeUpload)).toBe("custom-size");
  });

  it("returns formatted label for other:WxH custom dimensions", () => {
    expect(formatPaperTypeLabel("other:30x40", fakeUpload)).toBe("Other (30×40 cm)");
    expect(formatPaperTypeLabel("other:10.5x21", fakeUpload)).toBe("Other (10.5×21 cm)");
  });
});
