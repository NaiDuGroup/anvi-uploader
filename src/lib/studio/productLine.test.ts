import { describe, expect, it } from "vitest";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { applyShopDesign, shopDesignApprovalProblem, shopLineDesignSchema } from "@/lib/shop/designLine";
import { checkoutLine, parseCart, serializeCart } from "@/lib/storefront/cart";
import { designCartLine, designLineVariantId, parseLineDesign, productStudioKind, type ShopLineStudio } from "@/lib/storefront/design";
import type { ShopProduct, ShopVariant } from "@/lib/storefront/types";
import type { AdminOrderLineInput } from "@/lib/validations";
import { isStudioCartLine, studioLineQuantity, studioQuoteLine, studioUvItem, studioUvPrintCm } from "./productLine";

const LAYOUT = { templateId: "studio", text: "", fontFamily: "Montserrat", textColor: "#000000", backgroundColor: "#ffffff", photoUrls: [], photoSettings: [] };
const STUDIO: ShopLineStudio = { v: 1, docId: "d-abc", approvedAt: "2026-11-06T10:00:00.000Z", checks: ["text", "edges", "quality", "product"] };
const FILE = { fileKey: "uploads/1793900000000-pen-layout.png", fileName: "pen-layout.png" };

const uvPen = {
  slug: "pix-talbot",
  name: "TALBOT",
  simpleKind: "uvItem",
  editorHref: null,
  studioKind: "pen",
  printAreaCm: { widthCm: 4, heightCm: 0.6 },
} as Pick<ShopProduct, "slug" | "name" | "simpleKind" | "editorHref" | "studioKind" | "printAreaCm" | "studioColorInside">;
const uvVariant: Pick<ShopVariant, "id" | "hex" | "uvNorms" | "uvZone" | "uvPrintCm"> = {
  id: "0f8b5c2e-6b1a-4c55-9a51-2b7d3c1e9a10",
  hex: "#1f2a4d",
  uvNorms: { whiteLayers: 1, varnish: false, primer: false, transfer: false },
  uvZone: { widthCm: 4, heightCm: 0.6 },
  uvPrintCm: { widthCm: 4, heightCm: 0.6 },
};

describe("productStudioKind", () => {
  it("opens the Studio on old-editor products and on `studioKind` ones (UV or same kind) only", () => {
    expect(productStudioKind({ editorHref: "/mug", simpleKind: "mug" })).toBe("mug");
    expect(productStudioKind({ editorHref: null, simpleKind: "mug", studioKind: "mug" })).toBe("mug");
    expect(productStudioKind({ editorHref: null, simpleKind: "uvItem", studioKind: "pen" })).toBe("pen");
    expect(productStudioKind({ editorHref: null, simpleKind: "uvItem" })).toBeNull();
    expect(productStudioKind({ editorHref: null, simpleKind: "notebook", studioKind: "mug" })).toBeNull();
    expect(productStudioKind({ editorHref: null, simpleKind: "sublItem", studioKind: "mug" })).toBeNull();
  });
});

describe("Studio quote line", () => {
  it("prices a UV product as a UV stock line with its zone, other products by productId", () => {
    expect(studioQuoteLine("pen", uvPen, uvVariant, 10)).toEqual({
      kind: "uv",
      source: "stock",
      variantId: "0f8b5c2e-6b1a-4c55-9a51-2b7d3c1e9a10",
      quantity: 10,
      zones: [{ id: "main", placement: "front", widthCm: 4, heightCm: 0.6, whiteLayers: 1, varnish: false, primer: false }],
    });
    expect(studioQuoteLine("mug", { simpleKind: "mug" }, { id: "m1" }, 2.4)).toEqual({ kind: "mug", productId: "m1", quantity: 2 });
    expect(studioQuoteLine("mug", { simpleKind: "mug" }, { id: "m1" }, 0)).toEqual({ kind: "mug", productId: "m1", quantity: 1 });
  });

  it("takes the UV print size from the variant (card or fallback), never for other products", () => {
    expect(studioUvPrintCm(uvPen, uvVariant)).toEqual({ widthCm: 4, heightCm: 0.6 });
    expect(studioUvPrintCm(uvPen, { uvPrintCm: { widthCm: 21, heightCm: 9.6 } })).toEqual({ widthCm: 21, heightCm: 9.6 });
    expect(studioUvPrintCm(uvPen, undefined)).toEqual({ widthCm: 4, heightCm: 0.6 });
    expect(studioUvPrintCm({ simpleKind: "mug", printAreaCm: { widthCm: 20, heightCm: 9 } }, undefined)).toBeNull();
  });

  it("builds a UV mug stand-in item: white body with a coloured inside, or the colour all over", () => {
    const mug = { ...uvPen, slug: "cana-radek", simpleKind: "uvItem", studioKind: "mug", studioColorInside: true } as typeof uvPen;
    const v = { ...uvVariant, hex: "#ffe400", uvPrintCm: { widthCm: 21, heightCm: 9.6 }, uvZone: undefined };
    const inside = studioUvItem("mug", mug, v, null)!;
    expect(inside).toMatchObject({ id: v.id, printWidthCm: 21, printHeightCm: 9.6, bodyColorHex: "#ffffff", innerColorHex: "#ffe400" });
    expect(inside.printDpi).toBeGreaterThan(0);
    const all = studioUvItem("mug", { ...mug, studioColorInside: undefined }, v, null)!;
    expect(all).toMatchObject({ bodyColorHex: "#ffe400", innerColorHex: "#ffe400" });
    // A listed item keeps its look, the size is the priced one.
    const listed = { id: v.id, printWidthCm: 4, printHeightCm: 1.5, printDpi: 600, bodyColorHex: "#123456" };
    expect(studioUvItem("pen", uvPen, uvVariant, listed)).toEqual({ ...listed, printWidthCm: 4, printHeightCm: 0.6 });
    // Not a UV product: unchanged.
    expect(studioUvItem("mug", { ...mug, simpleKind: "mug" }, v, listed)).toBe(listed);
  });
});

describe("Studio UV line through cart and checkout", () => {
  const quote = studioQuoteLine("pen", uvPen, uvVariant, 50);
  const line = designCartLine({
    kind: "pen",
    slug: "pix-talbot",
    variantId: uvVariant.id,
    quantity: 50,
    file: FILE,
    layout: LAYOUT,
    preview: null,
    title: "TALBOT",
    optionsText: "Bleumarin",
    image: null,
    lastTotal: null,
    id: "l1",
    addedAt: 1,
    studio: STUDIO,
    quote,
  });

  it("keeps the UV quote, the print file and the Studio approval in the cart", () => {
    expect(line.quote).toEqual(quote);
    const [back] = parseCart(serializeCart([line]));
    expect(back?.quote).toEqual(quote);
    expect(back?.design?.studio?.docId).toBe("d-abc");
    expect(isStudioCartLine(back!, "pen")).toBe(true);
    expect(isStudioCartLine(back!, "mug")).toBe(false);
    expect(studioLineQuantity(back!.quote)).toBe(50);
    expect(designLineVariantId(back!.quote)).toBe("0f8b5c2e-6b1a-4c55-9a51-2b7d3c1e9a10");
  });

  it("drops a design on a UV line the Studio did not make (no approval)", () => {
    expect(parseLineDesign({ editor: "pen", layout: LAYOUT }, quote)).toBeNull();
    expect(parseLineDesign({ editor: "pen", layout: LAYOUT, studio: STUDIO }, quote)).not.toBeNull();
    expect(parseLineDesign({ editor: "pen", layout: LAYOUT }, { kind: "pen", productId: "p", quantity: 1 })).not.toBeNull();
    expect(parseLineDesign({ editor: "mug", layout: LAYOUT, studio: STUDIO }, { kind: "pen", productId: "p", quantity: 1 })).toBeNull();
  });

  it("sends a body the checkout accepts: valid UV quote, design with approval, order line left a UV line", () => {
    const body = checkoutLine(line);
    expect(body.files).toEqual([{ fileKey: FILE.fileKey, fileName: FILE.fileName }]);
    const q = parsePublicQuoteLine(body.quote);
    expect(q.ok).toBe(true);
    const design = shopLineDesignSchema.parse(body.design);
    expect(shopDesignApprovalProblem(design)).toBeNull();
    expect(shopDesignApprovalProblem({ ...design, studio: undefined })).toBe("studio_not_approved");
    const input = { productType: "uv", files: [{ fileName: "a.png", fileUrl: FILE.fileKey, copies: 1, color: "color" }] } as unknown as AdminOrderLineInput;
    expect(applyShopDesign(input, design)).toBe(input);
  });
});
