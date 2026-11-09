import { describe, expect, it } from "vitest";
import { wizardLineZoneIds, wizardRowFilesForLine } from "./adminOrderWizardHydrate";
import { UV_LINE_DATA_VERSION } from "@/lib/uv/types";

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
      expect(wizardRowFilesForLine("dtf_apparel", [back, front], { zoneIds: zones })).toEqual({
        rowFiles: [front],
        businessCardBack: null,
        zoneFiles: [{ zoneId: "z2", file: back }],
        rowZoneId: "z1",
      });
    });

    it("keeps the row file's own zone when no file is on the first zone", () => {
      const back = { id: "b", paperType: "dtf:z2" };
      const untagged = { id: "u", paperType: null };
      expect(wizardRowFilesForLine("dtf_apparel", [back, untagged], { zoneIds: zones })).toEqual({
        rowFiles: [back],
        businessCardBack: null,
        zoneFiles: [{ zoneId: "z1", file: untagged }],
        rowZoneId: "z2",
      });
    });

    it("fills a zone without a file with an untagged extra file", () => {
      const front = { id: "f", paperType: "dtf:z1" };
      const legacy = { id: "l", paperType: null };
      const r = wizardRowFilesForLine("dtf_apparel", [front, legacy], { zoneIds: zones });
      expect(r.rowFiles).toEqual([front]);
      expect(r.zoneFiles).toEqual([{ zoneId: "z2", file: legacy }]);
    });

    it("keeps extra files as their own rows once every zone has a file", () => {
      const front = { id: "f", paperType: "dtf:z1" };
      const extra = { id: "x", paperType: "dtf:z1" };
      const legacy = { id: "l", paperType: null };
      const r = wizardRowFilesForLine("dtf_apparel", [front, extra, legacy], { zoneIds: ["z1"] });
      expect(r.rowFiles).toEqual([front, extra, legacy]);
      expect(r.zoneFiles).toEqual([]);
    });

    it("keeps one row per file when the zones are unknown", () => {
      const a = { id: "a", paperType: "dtf:z1" };
      const b = { id: "b", paperType: "dtf:z2" };
      expect(wizardRowFilesForLine("dtf_apparel", [a, b])).toEqual({ rowFiles: [a, b], businessCardBack: null });
    });
  });

  describe("UV", () => {
    const zones = ["z1", "z2"];

    it("restores a two-side mug line as one row with the second side's file alongside", () => {
      const side1 = { id: "a", paperType: "uv:z1" };
      const side2 = { id: "b", paperType: "uv:z2" };
      expect(wizardRowFilesForLine("uv_print", [side2, side1], { zoneIds: zones })).toEqual({
        rowFiles: [side1],
        businessCardBack: null,
        zoneFiles: [{ zoneId: "z2", file: side2 }],
        rowZoneId: "z1",
      });
    });

    it("does not read DTF tags on a UV line", () => {
      const a = { id: "a", paperType: "uv:z1" };
      const b = { id: "b", paperType: "dtf:z1" };
      const r = wizardRowFilesForLine("uv_print", [a, b], { zoneIds: ["z1"] });
      expect(r.rowFiles).toEqual([a, b]);
      expect(r.zoneFiles).toEqual([]);
    });
  });
});

describe("wizardLineZoneIds", () => {
  const uvLineData = (zoneIds: string[]) => ({
    version: UV_LINE_DATA_VERSION,
    source: "stock",
    quantity: 1,
    zones: zoneIds.map((id) => ({ id, whiteLayers: 1 })),
    consumption: {},
    pricing: {},
    costs: {},
  });

  it("gives a UV line's zones", () => {
    expect(wizardLineZoneIds({ productType: "uv_print", uvLineData: uvLineData(["z1", "z2"]) })).toEqual(["z1", "z2"]);
  });

  it("keeps a ready gift set one row per print place", () => {
    // A ready set's UV line holds the set's places (thermos, notebook…) as zones, a file each.
    const line = { productType: "uv_print", setGroupId: "set-1", uvLineData: uvLineData(["thermos", "notebook"]) };
    const zoneIds = wizardLineZoneIds(line);
    expect(zoneIds).toEqual([]);
    const thermos = { id: "t", paperType: "uv:thermos" };
    const notebook = { id: "n", paperType: "uv:notebook" };
    expect(wizardRowFilesForLine(line.productType, [thermos, notebook], { zoneIds })).toEqual({
      rowFiles: [thermos, notebook],
      businessCardBack: null,
    });
  });

  it("is empty for other products and unreadable data", () => {
    expect(wizardLineZoneIds({ productType: "paper_print" })).toEqual([]);
    expect(wizardLineZoneIds({ productType: "uv_print", uvLineData: null })).toEqual([]);
  });
});
