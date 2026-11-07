import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardDesignCartLine } from "@/lib/studio/cardLine";
import { flyerDefaultOptions, flyerDesignCartLine, flyerPrint, flyerQuoteLine } from "@/lib/studio/flyer";
import { emptyStudioDoc } from "@/lib/studio/document";
import { CARD_BACK_ID, initialSurfaceBases, studioSurfaces, surfaceBase } from "@/lib/studio/surfaces";
import { addedLineView, cartSummary } from "@/lib/studio/addedScreen";
import { CART_STORAGE_KEY, checkoutLine, leanCart, parseCart, serializeCart, storedCartLine, type CartLine } from "./cart";
import { designCartLine } from "./design";

/**
 * Cart lines in `localStorage`: a design preview that is also the line image
 * is stored once (old lines with both keep working), the checkout body is
 * unchanged, and a full storage refuses the new line with a notice instead of
 * keeping it for this page view only.
 */

const jpeg = (tag: string, n = 100) => `data:image/jpeg;base64,${tag}${"A".repeat(n)}`;
const LAYOUT = { templateId: "studio:x", text: "", fontFamily: "Montserrat", textColor: "#14213d", backgroundColor: "#ffffff", photoUrls: [], photoSettings: [] };
const studio = (preview?: string) => ({
  v: 1 as const,
  docId: "d_1",
  approvedAt: "2026-11-07T10:00:00.000Z",
  checks: ["text", "edges", "quality", "product"],
  ...(preview ? { preview } : {}),
});

function flyerLine(): CartLine {
  const specs = studioSurfaces("flyer", flyerPrint("a5"));
  const d = emptyStudioDoc("flyer", initialSurfaceBases(specs));
  const b = specs.find((s) => s.id === CARD_BACK_ID)!;
  const doc = { ...d, surfaces: [...d.surfaces, { ...surfaceBase(b), layers: [] }] };
  return flyerDesignCartLine({
    id: "l_flyer",
    addedAt: 1,
    quote: flyerQuoteLine(doc, flyerDefaultOptions("a5")),
    front: { fileKey: "uploads/f.png", fileName: "flyer-front.png", thumb: jpeg("FT") },
    back: { fileKey: "uploads/b.png", fileName: "flyer-back.png", thumb: jpeg("BT") },
    layout: LAYOUT,
    preview: jpeg("IMG"),
    studio: studio(jpeg("APPROVAL")),
    title: "Flyere",
    optionsText: "A5 148×210 · 150 g/m² · Față + verso",
    lastTotal: 450,
    fallbackImage: "/flyer.jpg",
  });
}

function cardLine(): CartLine {
  return cardDesignCartLine({
    id: "l_card",
    addedAt: 2,
    quote: { kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 100 },
    front: { fileKey: "uploads/cf.png", fileName: "card-front.png", thumb: jpeg("CF") },
    back: { fileKey: "uploads/cb.png", fileName: "card-back.png", thumb: jpeg("CB") },
    layout: LAYOUT,
    preview: jpeg("CIMG"),
    studio: studio(jpeg("CAPPROVAL")),
    title: "Cărți de vizită",
    optionsText: "Față + verso",
    lastTotal: 300,
    fallbackImage: "/card.jpg",
  });
}

function mugLine(preview: string, approval?: string): CartLine {
  return designCartLine({
    kind: "mug",
    slug: "cana-alba",
    variantId: "v1",
    quantity: 2,
    file: { fileKey: "uploads/m.png", fileName: "mug.png" },
    layout: LAYOUT,
    preview,
    title: "Cană albă",
    optionsText: "330 ml",
    image: "/mug.jpg",
    lastTotal: 240,
    id: "l_mug",
    addedAt: 3,
    studio: studio(approval),
  });
}

describe("cart line storage", () => {
  it("stores a design preview equal to the line image once and reads it back", () => {
    for (const line of [flyerLine(), cardLine(), mugLine(jpeg("MUG"), jpeg("MAPPROVAL"))]) {
      expect(line.design?.preview).toBe(line.image);
      const stored = JSON.stringify(storedCartLine(line));
      // The image is in the stored line once only.
      expect(stored.split(line.image!).length - 1).toBe(1);
      expect(stored).toContain('"previewIsImage":true');
      const [back] = parseCart(serializeCart([line]));
      expect(back).toEqual(line);
      // The checkout body (approval preview included) is exactly the one sent before.
      expect(checkoutLine(back!)).toEqual(checkoutLine(line));
    }
  });

  it("stores the Studio approval preview once when it is the line image (notebooks without a product look)", () => {
    const p = jpeg("SAME");
    const line = mugLine(p, p);
    const stored = JSON.stringify(storedCartLine(line));
    expect(stored.split(p).length - 1).toBe(1);
    const [back] = parseCart(serializeCart([line]));
    expect(back?.design?.studio?.preview).toBe(p);
    expect(checkoutLine(back!)).toEqual(checkoutLine(line));
  });

  it("keeps the approval preview sent to the order when it differs from the image", () => {
    const line = flyerLine();
    const [back] = parseCart(serializeCart([line]));
    expect(back?.design?.studio?.preview).toBe(jpeg("APPROVAL"));
    expect(checkoutLine(back!).design).toMatchObject({ studio: { preview: jpeg("APPROVAL") } });
  });

  it("reads old cart lines (preview stored twice, no flag) unchanged", () => {
    const line = flyerLine();
    const old = JSON.stringify({ v: 1, lines: [line] });
    expect(old).not.toContain("previewIsImage");
    const [back] = parseCart(old);
    expect(back).toEqual(line);
    // Saved again: now in the compact shape, same line after reading.
    expect(serializeCart([back!]).length).toBeLessThan(old.length);
    expect(parseCart(serializeCart([back!]))[0]).toEqual(line);
  });

  it("a flag without an image string is ignored (the line stays, without the preview)", () => {
    const line = flyerLine();
    const stored = storedCartLine(line) as unknown as Record<string, unknown>;
    const [back] = parseCart(JSON.stringify({ v: 1, lines: [{ ...stored, image: null }] }));
    expect(back?.image).toBeNull();
    expect(back?.design?.preview).toBeUndefined();
    expect(back?.design?.studio?.docId).toBe("d_1");
  });

  it("leanCart drops only the per-file thumbnails", () => {
    const [lean] = leanCart([flyerLine()]);
    expect(lean!.files.every((f) => f.thumb === undefined)).toBe(true);
    expect(lean!.files.map((f) => f.fileKey)).toEqual(["uploads/f.png", "uploads/b.png"]);
    expect(lean!.image).toBe(jpeg("IMG"));
  });
});

describe("«added to cart» screen data", () => {
  it("shows the front (line image) and the back thumbnail, name, options, quantity and price", () => {
    const v = addedLineView(flyerLine());
    expect(v).toMatchObject({ front: jpeg("IMG"), back: jpeg("BT"), title: "Flyere", optionsText: "A5 148×210 · 150 g/m² · Față + verso", total: 450 });
    expect(v.quantity).toBeGreaterThan(0);
    expect(addedLineView(mugLine(jpeg("MUG")))).toMatchObject({ front: jpeg("MUG"), back: null, quantity: 2 });
  });
  it("cart total only when every line has a known price", () => {
    expect(cartSummary([flyerLine(), cardLine()])).toEqual({ count: 2, total: 750 });
    expect(cartSummary([flyerLine(), { ...cardLine(), lastTotal: null }])).toEqual({ count: 2, total: null });
  });
});

describe("dispatchCart on a full storage", () => {
  let store: Record<string, string>;
  let limit: number;
  beforeEach(() => {
    vi.resetModules();
    store = {};
    limit = Infinity;
    const localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > limit) throw new DOMException("full", "QuotaExceededError");
        store[k] = v;
      },
      removeItem: (k: string) => void delete store[k],
    };
    vi.stubGlobal("window", { localStorage, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves without per-file thumbnails when only that fits", async () => {
    const { dispatchCart } = await import("./cartStore");
    const line = flyerLine();
    limit = serializeCart([line]).length - 10;
    expect(dispatchCart({ type: "add", line })).toBe(true);
    const [saved] = parseCart(store[CART_STORAGE_KEY]);
    expect(saved?.id).toBe("l_flyer");
    expect(saved?.files.every((f) => f.thumb === undefined)).toBe(true);
  });

  it("refuses the line (cart unchanged) when even that does not fit", async () => {
    const { dispatchCart } = await import("./cartStore");
    expect(dispatchCart({ type: "add", line: cardLine() })).toBe(true);
    const before = store[CART_STORAGE_KEY];
    limit = before!.length + 50;
    expect(dispatchCart({ type: "add", line: flyerLine() })).toBe(false);
    expect(store[CART_STORAGE_KEY]).toBe(before);
    expect(parseCart(store[CART_STORAGE_KEY]).map((l) => l.id)).toEqual(["l_card"]);
  });

  it("a blocked storage (not a quota error) keeps the line for this page view, as before", async () => {
    const { dispatchCart } = await import("./cartStore");
    (window.localStorage as { setItem: unknown }).setItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(dispatchCart({ type: "add", line: cardLine() })).toBe(true);
  });
});
