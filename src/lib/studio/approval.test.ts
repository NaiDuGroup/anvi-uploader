import { describe, expect, it } from "vitest";
import { shopDesignApprovalProblem, shopLineDesignSchema } from "@/lib/shop/designLine";
import { checkoutLine, parseCart, serializeCart } from "@/lib/storefront/cart";
import {
  checkoutDesign,
  designCartLine,
  parseLineDesign,
  studioEditorPath,
  type ShopDesignLayout,
  type ShopLineStudio,
} from "@/lib/storefront/design";

const LAYOUT: ShopDesignLayout = {
  templateId: "studio:xmas-snow",
  text: "Crăciun fericit",
  fontFamily: "Playfair Display",
  textColor: "#14213d",
  backgroundColor: "transparent",
  photoUrls: [],
  photoSettings: [],
};
const STUDIO: ShopLineStudio = {
  v: 1,
  docId: "dabc123",
  approvedAt: "2026-11-05T10:00:00.000Z",
  checks: ["text", "edges", "quality", "product"],
  preview: "data:image/jpeg;base64,AAAA",
  templateId: "xmas-snow",
};

function line(studio?: ShopLineStudio) {
  return designCartLine({
    kind: "mug",
    slug: "cana-alba",
    variantId: "v1",
    quantity: 2,
    file: { fileKey: "uploads/1730000000000-mug.png", fileName: "mug.png" },
    layout: LAYOUT,
    preview: "data:image/jpeg;base64,BBBB",
    title: "Cană",
    optionsText: "Albă",
    image: null,
    lastTotal: 200,
    id: "line1",
    addedAt: 1,
    ...(studio ? { studio } : {}),
  });
}

describe("Studio approval on the cart line", () => {
  it("keeps the approval through localStorage and sends it to checkout", () => {
    const back = parseCart(serializeCart([line(STUDIO)]))[0]!;
    expect(back.design?.studio).toEqual(STUDIO);
    const sent = checkoutLine(back);
    expect(sent.design).toEqual({ editor: "mug", layout: LAYOUT, studio: STUDIO });
    expect(shopLineDesignSchema.safeParse(sent.design).success).toBe(true);
  });

  it("drops a malformed approval but keeps the design", () => {
    const quote = { kind: "mug" as const, productId: "v1", quantity: 1 };
    const bad = (studio: unknown) => parseLineDesign({ editor: "mug", layout: LAYOUT, studio }, quote);
    expect(bad({ ...STUDIO, approvedAt: "yesterday" })?.studio).toBeUndefined();
    expect(bad({ ...STUDIO, checks: ["text", "hack"] })?.studio).toBeUndefined();
    expect(bad({ ...STUDIO, docId: "x".repeat(61) })?.studio).toBeUndefined();
    expect(bad({ ...STUDIO, preview: `data:image/jpeg;base64,${"A".repeat(70_000)}` })?.studio).toEqual({ v: 1, docId: "dabc123", approvedAt: STUDIO.approvedAt, checks: STUDIO.checks, templateId: "xmas-snow" });
    expect(bad(undefined)?.layout).toEqual(LAYOUT);
  });

  it("old editor lines are unchanged (no studio key)", () => {
    const old = { ...line(), design: { editor: "mug" as const, layout: { ...LAYOUT, templateId: "photo_text" } } };
    expect(checkoutDesign(old.design)).toEqual({ editor: "mug", layout: old.design.layout });
  });

  it("links Studio lines back to the Studio", () => {
    expect(studioEditorPath("mug", { slug: "cana", variant: "v1", edit: "line1" })).toBe("/shop/studio/mug?slug=cana&variant=v1&edit=line1");
  });
});

describe("server: a Studio line needs the approval", () => {
  const parse = (d: unknown) => shopLineDesignSchema.parse(d);
  it("refuses a Studio layout without approval", () => {
    expect(shopDesignApprovalProblem(parse({ editor: "mug", layout: LAYOUT }))).toBe("studio_not_approved");
    expect(shopDesignApprovalProblem(parse({ editor: "mug", layout: { ...LAYOUT, templateId: "studio" } }))).toBe("studio_not_approved");
  });
  it("accepts it with approval, and old editor lines without", () => {
    expect(shopDesignApprovalProblem(parse({ editor: "mug", layout: LAYOUT, studio: STUDIO }))).toBeNull();
    expect(shopDesignApprovalProblem(parse({ editor: "mug", layout: { ...LAYOUT, templateId: "photo_text" } }))).toBeNull();
    expect(shopDesignApprovalProblem(undefined)).toBeNull();
  });
  it("bounds the approval payload", () => {
    const ok = (s: unknown) => shopLineDesignSchema.safeParse({ editor: "mug", layout: LAYOUT, studio: s }).success;
    expect(ok(STUDIO)).toBe(true);
    expect(ok({ ...STUDIO, approvedAt: "not a date" })).toBe(false);
    expect(ok({ ...STUDIO, checks: ["nope"] })).toBe(false);
    expect(ok({ ...STUDIO, preview: "javascript:alert(1)" })).toBe(false);
    expect(ok({ ...STUDIO, preview: `data:image/jpeg;base64,${"A".repeat(60_001)}` })).toBe(false);
  });
});
