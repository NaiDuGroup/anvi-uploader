import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { ro } from "@/lib/i18n/ro";
import { ru } from "@/lib/i18n/ru";
import type { UvPublicSummary } from "@/lib/uv/uvPublicSummary";
import { uvLineSummaryText } from "./UvLineSummary";

/** The dealer's box lid: item 34×27, logo 12×12 on the front. */
const LID: UvPublicSummary = {
  source: "client",
  item: null,
  clientItemDescription: "Lid",
  clientItemSize: { widthCm: 34, heightCm: 27 },
  quantity: 2,
  zones: [{ placement: "front", placementLabel: null, widthCm: 12, heightCm: 12, varnish: false }],
};

describe("uvLineSummaryText", () => {
  it("prints the size unit in the UI language", () => {
    const r = uvLineSummaryText(LID, ru, "ru");
    expect(r.itemSize).toBe(ru.uv.workshop.itemSize("34×27 см"));
    expect(r.zones).toBe(`${ru.uv.placements.front} 12×12 см`);

    for (const [t, locale] of [[ro, "ro"], [en, "en"]] as const) {
      const s = uvLineSummaryText(LID, t, locale);
      expect(s.itemSize).toBe(t.uv.workshop.itemSize("34×27 cm"));
      expect(s.zones).toBe(`${t.uv.placements.front} 12×12 cm`);
      expect(`${s.itemSize} ${s.zones}`).not.toContain("см");
    }
  });

  it("no item size line when the summary has none", () => {
    expect(uvLineSummaryText({ ...LID, clientItemSize: null }, en, "en").itemSize).toBeNull();
  });
});
