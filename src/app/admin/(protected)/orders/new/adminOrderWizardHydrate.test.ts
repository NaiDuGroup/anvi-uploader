import { describe, expect, it } from "vitest";
import { wizardRowFilesForLine } from "./adminOrderWizardHydrate";

const front = { id: "bbbb", paperType: "business_card_front" } as const;
const back = { id: "aaaa", paperType: "business_card_back" } as const;

describe("wizardRowFilesForLine", () => {
  it("restores a double-sided business-card run as one row", () => {
    const { rowFiles, businessCardBack } = wizardRowFilesForLine(
      "business_card",
      [front, back],
    );
    expect(rowFiles).toEqual([front]);
    expect(businessCardBack).toEqual(back);
  });

  it("restores a single-sided run as one row with no reverse", () => {
    expect(wizardRowFilesForLine("business_card", [front])).toEqual({
      rowFiles: [front],
      businessCardBack: null,
    });
  });

  it("restores a double-sided flyer run as one row", () => {
    expect(wizardRowFilesForLine("flyer", [back, front])).toEqual({
      rowFiles: [front],
      businessCardBack: back,
    });
  });

  it("keeps a row per file for every other product", () => {
    const a = { id: "a", paperType: "A4" };
    const b = { id: "b", paperType: "A4" };
    expect(wizardRowFilesForLine("paper_print", [a, b])).toEqual({
      rowFiles: [a, b],
      businessCardBack: null,
    });
  });

  it("still yields one row for cards saved before the side tags existed", () => {
    const first = { id: "aaaa", paperType: null };
    const second = { id: "bbbb", paperType: null };
    expect(wizardRowFilesForLine("business_card", [first, second])).toEqual({
      rowFiles: [first],
      businessCardBack: second,
    });
  });

  describe("DTF on apparel", () => {
    const zones = ["z1", "z2"];

    it("restores a two-zone line as one row with the second zone's file alongside", () => {
      const front = { id: "f", paperType: "dtf:z1" };
      const back = { id: "b", paperType: "dtf:z2" };
      expect(wizardRowFilesForLine("dtf_apparel", [back, front], { dtfZoneIds: zones })).toEqual({
        rowFiles: [front],
        businessCardBack: null,
        dtfZoneFiles: [{ zoneId: "z2", file: back }],
        dtfRowZoneId: "z1",
      });
    });

    it("keeps the row file's own zone when no file is on the first zone", () => {
      const back = { id: "b", paperType: "dtf:z2" };
      const untagged = { id: "u", paperType: null };
      expect(wizardRowFilesForLine("dtf_apparel", [back, untagged], { dtfZoneIds: zones })).toEqual({
        rowFiles: [back],
        businessCardBack: null,
        dtfZoneFiles: [{ zoneId: "z1", file: untagged }],
        dtfRowZoneId: "z2",
      });
    });

    it("fills a zone without a file with an untagged extra file", () => {
      const front = { id: "f", paperType: "dtf:z1" };
      const legacy = { id: "l", paperType: null };
      const r = wizardRowFilesForLine("dtf_apparel", [front, legacy], { dtfZoneIds: zones });
      expect(r.rowFiles).toEqual([front]);
      expect(r.dtfZoneFiles).toEqual([{ zoneId: "z2", file: legacy }]);
    });

    it("keeps extra files as their own rows once every zone has a file", () => {
      const front = { id: "f", paperType: "dtf:z1" };
      const extra = { id: "x", paperType: "dtf:z1" };
      const legacy = { id: "l", paperType: null };
      const r = wizardRowFilesForLine("dtf_apparel", [front, extra, legacy], { dtfZoneIds: ["z1"] });
      expect(r.rowFiles).toEqual([front, extra, legacy]);
      expect(r.dtfZoneFiles).toEqual([]);
    });

    it("keeps one row per file when the zones are unknown", () => {
      const a = { id: "a", paperType: "dtf:z1" };
      const b = { id: "b", paperType: "dtf:z2" };
      expect(wizardRowFilesForLine("dtf_apparel", [a, b])).toEqual({ rowFiles: [a, b], businessCardBack: null });
    });
  });
});
