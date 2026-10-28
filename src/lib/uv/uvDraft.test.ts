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
import { CATALOG, PEN } from "./uvTestFixtures";
import { DEFAULT_UV_SETTINGS } from "@/lib/printMethods/uvSettings";

function priced(draft: UvDraft) {
  const q = quoteUvDraft(draft, "retail", CATALOG);
  if (!q.ok) throw new Error(q.code);
  return q.data;
}

describe("UV draft", () => {
  it("starts on the first stock item with one front zone sized by the item's print parameters", () => {
    const d = emptyUvDraft(CATALOG);
    expect(d).toMatchObject({ source: "stock", variantId: PEN.id, quantityStr: "1" });
    expect(d.zones).toHaveLength(1);
    expect(d.zones[0]).toMatchObject({ placement: "front", widthStr: "5", heightStr: "0.6", whiteLayers: 1, varnish: false, primer: false });
    expect(emptyUvDraft({ ...CATALOG, items: [] }).source).toBe("client");
  });

  it("prices a client item before it is described, but saves only described; size and «other» name required", () => {
    const base = withUvItem(emptyUvDraft(CATALOG), CATALOG, "client", null);
    const sized = { ...base, zones: [{ ...base.zones[0]!, widthStr: "5", heightStr: "5" }] };
    expect(quoteUvDraft(sized, "retail", CATALOG).ok).toBe(true);
    expect(uvDraftToInput(sized)).toBeNull();
    const described = { ...sized, description: "кружка" };
    expect(quoteUvDraft(described, "retail", CATALOG).ok).toBe(true);
    expect(uvDraftToInput(described)).not.toBeNull();
    const custom = { ...described, zones: [{ ...described.zones[0]!, widthStr: "8", heightStr: "" }] };
    expect(uvDraftToInput(custom)).toBeNull();
    expect(uvDraftToInput({ ...custom, zones: [{ ...custom.zones[0]!, heightStr: "4,5" }] })?.zones[0]).toMatchObject({
      widthCm: 8,
      heightCm: 4.5,
    });
    const other = { ...described, zones: [{ ...described.zones[0]!, placement: "other" as const }] };
    expect(uvDraftToInput(other)).toBeNull();
    expect(uvDraftToInput({ ...other, zones: [{ ...other.zones[0]!, placementLabel: "дно" }] })?.zones[0]?.placementLabel).toBe("дно");
  });

  it("stock main zone needs no typed size; switching items takes the new item's print parameters", () => {
    const stock = emptyUvDraft(CATALOG);
    const blank = { ...stock, zones: [{ ...stock.zones[0]!, widthStr: "", heightStr: "" }] };
    expect(uvDraftToInput(blank)).not.toBeNull();
    const notebook = { ...PEN, id: "00000000-0000-4000-8000-000000000099", printArea: { widthCm: 14.5, heightCm: 21 } };
    const catalog = { ...CATALOG, items: [PEN, notebook] };
    expect(withUvItem(stock, catalog, "stock", notebook.id).zones[0]).toMatchObject({ widthStr: "14.5", heightStr: "21" });
  });

  it("picking an item takes its print norms; re-pricing the same item keeps the operator's choice", () => {
    const metal = { ...PEN, id: "00000000-0000-4000-8000-000000000098", printNorms: { whiteLayers: 2, varnish: true, primer: true } };
    const catalog = { ...CATALOG, items: [PEN, metal] };
    const picked = withUvItem(emptyUvDraft(catalog), catalog, "stock", metal.id);
    expect(picked.zones[0]).toMatchObject({ whiteLayers: 2, varnish: true, primer: true });
    const edited = { ...picked, zones: [{ ...picked.zones[0]!, primer: false }] };
    expect(withUvItem(edited, catalog, "stock", metal.id).zones[0]?.primer).toBe(false);
    // A client item starts with one underbase layer.
    expect(withUvItem(emptyUvDraft({ ...CATALOG, items: [] }), CATALOG, "client", null).zones[0]?.whiteLayers).toBe(1);
  });

  it("reports pricing errors with their code", () => {
    const client = { ...withUvItem(emptyUvDraft(CATALOG), CATALOG, "client", null), description: "доска" };
    expect(quoteUvDraft(client, "retail", { ...CATALOG, settings: DEFAULT_UV_SETTINGS })).toEqual({
      ok: false,
      code: "uv_price_not_set",
    });
  });

  it("round-trips a saved line through the editor and the update input", () => {
    const draft: UvDraft = {
      ...emptyUvDraft(CATALOG),
      quantityStr: "12",
      zones: [
        { ...emptyUvDraft(CATALOG).zones[0]!, id: "a", whiteLayers: 2, varnish: true },
        { id: "b", placement: "other", placementLabel: "колпачок", widthStr: "4", heightStr: "1", whiteLayers: 0, varnish: false, primer: false },
      ],
    };
    const data = priced(draft);
    expect(data.zones[0]).toMatchObject({ customSize: false, includedInItem: true, widthCm: 5, heightCm: 0.6 });
    expect(data.zones[1]).toMatchObject({ customSize: true, includedInItem: false, unitPrintPriceMdl: 15, placementLabel: "колпачок" });
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
      zones: [{ ...emptyUvDraft(CATALOG).zones[0]!, id: "z", widthStr: "10", heightStr: "15" }],
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
  const zone = { id: "z", placement: "front", widthCm: 10, heightCm: 10 };

  it("defaults white layers / varnish and validates sources", () => {
    const parsed = uvLineInputSchema.parse({ source: "stock", variantId: PEN.id, quantity: 2, zones: [zone] });
    expect(parsed.zones[0]).toMatchObject({ whiteLayers: 1, varnish: false, primer: false });
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
        zones: [{ ...zone, whiteLayers: 6 }],
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
