import { describe, expect, it } from "vitest";
import { parseUvLineData } from "./parseUvLineData";
import { toUvPublicSummary } from "./uvPublicSummary";
import {
  emptyUvDraft,
  quoteUvDraft,
  uvDraftFromLineData,
  uvDraftToInput,
  withUvItem,
  type UvDraft,
} from "./uvDraft";
import { uvInputFromLineData } from "./uvInputFromLineData";
import { uvLineInputSchema } from "./uvLineInput";
import { uvQuoteSchema } from "./uvAdminSchemas";
import { uvZoneFilePaperType, uvZoneIdFromPaperType } from "./uvConstants";
import { A6, CATALOG, LOGO, PEN } from "./uvTestFixtures";

function priced(draft: UvDraft) {
  const q = quoteUvDraft(draft, "retail", CATALOG);
  if (!q.ok) throw new Error(q.code);
  return q.data;
}

describe("UV draft", () => {
  it("starts on the first stock item with one front zone on the first preset", () => {
    const d = emptyUvDraft(CATALOG);
    expect(d).toMatchObject({ source: "stock", variantId: PEN.id, quantityStr: "1" });
    expect(d.zones).toHaveLength(1);
    expect(d.zones[0]).toMatchObject({ placement: "front", presetId: LOGO, whiteLayers: 0, varnish: false });
    expect(emptyUvDraft({ ...CATALOG, items: [] }).source).toBe("client");
  });

  it("is incomplete until the client item is described, a custom size typed and «other» named", () => {
    const base = withUvItem(emptyUvDraft(CATALOG), CATALOG, "client", null);
    expect(quoteUvDraft(base, "retail", CATALOG)).toEqual({ ok: false, code: "uv_incomplete" });
    const described = { ...base, description: "кружка" };
    expect(quoteUvDraft(described, "retail", CATALOG).ok).toBe(true);
    const custom = { ...described, zones: [{ ...described.zones[0]!, presetId: null, widthStr: "8", heightStr: "" }] };
    expect(uvDraftToInput(custom)).toBeNull();
    expect(uvDraftToInput({ ...custom, zones: [{ ...custom.zones[0]!, heightStr: "4,5" }] })?.zones[0]).toMatchObject({
      presetId: null,
      widthCm: 8,
      heightCm: 4.5,
    });
    const other = { ...described, zones: [{ ...described.zones[0]!, placement: "other" as const }] };
    expect(uvDraftToInput(other)).toBeNull();
    expect(uvDraftToInput({ ...other, zones: [{ ...other.zones[0]!, placementLabel: "дно" }] })?.zones[0]?.placementLabel).toBe("дно");
  });

  it("reports pricing errors with their code", () => {
    expect(quoteUvDraft(emptyUvDraft(CATALOG), "retail", { ...CATALOG, presets: [] })).toEqual({
      ok: false,
      code: "uv_price_list_empty",
    });
  });

  it("round-trips a saved line through the editor and the update input", () => {
    const draft: UvDraft = {
      ...emptyUvDraft(CATALOG),
      quantityStr: "12",
      zones: [
        { ...emptyUvDraft(CATALOG).zones[0]!, id: "a", whiteLayers: 2, varnish: true },
        { id: "b", placement: "other", placementLabel: "колпачок", presetId: null, widthStr: "4", heightStr: "1", whiteLayers: 0, varnish: false },
      ],
    };
    const data = priced(draft);
    expect(data.zones[1]).toMatchObject({ customSize: true, presetId: LOGO, placementLabel: "колпачок" });
    const back = uvDraftFromLineData(data);
    expect(back).toEqual({ ...draft, description: "", notes: "" });
    const input = uvInputFromLineData(data)!;
    expect(uvLineInputSchema.parse(input)).toEqual(input);
    expect(priced(back)).toEqual(data);
  });

  it("client line round-trips its description and notes", () => {
    const draft: UvDraft = {
      ...withUvItem(emptyUvDraft(CATALOG), CATALOG, "client", null),
      description: "бутылка стеклянная 0,5 л",
      notes: "прозрачная",
      zones: [{ ...emptyUvDraft(CATALOG).zones[0]!, id: "z", presetId: A6 }],
    };
    const data = priced(draft);
    expect(data.clientItem).toEqual({ description: "бутылка стеклянная 0,5 л", notes: "прозрачная" });
    expect(uvInputFromLineData(data)?.clientItem).toEqual({ description: "бутылка стеклянная 0,5 л", notes: "прозрачная" });
    expect(uvDraftFromLineData(data)).toMatchObject({ source: "client", description: "бутылка стеклянная 0,5 л", notes: "прозрачная" });
  });
});

describe("parseUvLineData", () => {
  it("accepts a priced snapshot and rejects foreign shapes", () => {
    const data = priced(emptyUvDraft(CATALOG));
    expect(parseUvLineData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(parseUvLineData(null)).toBeNull();
    expect(parseUvLineData([])).toBeNull();
    expect(parseUvLineData({ ...data, version: 2 })).toBeNull();
    expect(parseUvLineData({ ...data, source: "x" })).toBeNull();
    expect(parseUvLineData({ ...data, zones: undefined })).toBeNull();
  });

  it("public summary has no prices or costs", () => {
    const s = toUvPublicSummary(priced(emptyUvDraft(CATALOG)))!;
    expect(s).toMatchObject({ source: "stock", quantity: 1, clientItemDescription: null });
    expect(JSON.stringify(s)).not.toMatch(/Mdl|cost/i);
  });
});

describe("UV input schemas", () => {
  const zone = { id: "z", placement: "front", presetId: LOGO };

  it("defaults white layers / varnish and validates sources", () => {
    const parsed = uvLineInputSchema.parse({ source: "stock", variantId: PEN.id, quantity: 2, zones: [zone] });
    expect(parsed.zones[0]).toMatchObject({ whiteLayers: 0, varnish: false });
    expect(uvLineInputSchema.safeParse({ source: "stock", quantity: 2, zones: [zone] }).success).toBe(false);
    expect(uvLineInputSchema.safeParse({ source: "client", quantity: 2, zones: [zone] }).success).toBe(false);
    expect(
      uvLineInputSchema.safeParse({ source: "client", clientItem: { description: "  " }, quantity: 2, zones: [zone] }).success,
    ).toBe(false);
    expect(uvLineInputSchema.safeParse({ source: "client", clientItem: { description: "x" }, quantity: 0, zones: [zone] }).success).toBe(
      false,
    );
    expect(
      uvLineInputSchema.safeParse({
        source: "client",
        clientItem: { description: "x" },
        quantity: 1,
        zones: [{ ...zone, whiteLayers: 4 }],
      }).success,
    ).toBe(false);
    expect(
      uvLineInputSchema.safeParse({ source: "client", clientItem: { description: "x" }, quantity: 1, zones: [zone, zone] }).success,
    ).toBe(false);
  });

  it("quote body defaults to retail", () => {
    const body = uvQuoteSchema.parse({ uv: { source: "client", clientItem: { description: "x" }, quantity: 1, zones: [zone] } });
    expect(body.customerType).toBe("retail");
  });

  it("zone file tags", () => {
    expect(uvZoneFilePaperType("abc")).toBe("uv:abc");
    expect(uvZoneIdFromPaperType("uv:abc")).toBe("abc");
    expect(uvZoneIdFromPaperType("dtf:abc")).toBeNull();
    expect(uvZoneIdFromPaperType("uv:")).toBeNull();
  });
});
