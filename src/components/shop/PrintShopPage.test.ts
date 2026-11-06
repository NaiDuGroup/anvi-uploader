import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PrintShopPage } from "./PrintShopPage";

vi.mock("./PrintShopView", () => ({
  PrintShopView: ({ productId, editId }: { productId: string; editId: string | null }) => h("div", { "data-upload-view": productId, "data-edit": editId ?? "" }),
}));
vi.mock("./UvStickersView", () => ({ UvStickersView: () => h("div", { "data-uv-view": "" }) }));

const page = (productId: "flyers" | "postcards", opts: { editId?: string | null; flyerStudio?: boolean } = {}) =>
  renderToStaticMarkup(h(PrintShopPage, { lang: "ro", base: "", editId: opts.editId ?? null, page: { kind: "product", productId }, flyerStudio: opts.flyerStudio }));

describe("flyer page gate", () => {
  it("customers without the flyer Studio get exactly the upload page", () => {
    const html = page("flyers");
    expect(html).toContain('data-upload-view="flyers"');
    expect(html).not.toContain("data-bc-choice");
    expect(html).not.toContain("data-studio-flyer-cta");
    expect(html).not.toContain("Creează online");
  });

  it("gated viewers choose «Creează online» (the flyer Studio) or «Încarcă fișierul tău» (the same upload view)", () => {
    const html = page("flyers", { flyerStudio: true });
    expect(html).toContain('data-bc-choice="flyer"');
    expect(html).toContain('data-bc-tab="create"');
    expect(html).toContain('data-bc-tab="upload"');
    expect(html).toContain("Creează online");
    expect(html).toContain("Încarcă fișierul tău");
    expect(html).toMatch(/href="[^"]*studio\/flyer\?new=1"[^>]*data-studio-flyer-cta|data-studio-flyer-cta[^>]*href="[^"]*studio\/flyer/);
    expect(html).not.toContain("data-studio-card-cta");
    expect(html).toContain('data-upload-view="flyers"');
    // Editing an uploaded cart line opens on the upload view.
    const edit = page("flyers", { flyerStudio: true, editId: "l1" });
    expect(edit).toMatch(/aria-selected="true"[^>]*data-bc-tab="upload"/);
    expect(edit).toContain('data-edit="l1"');
  });

  it("only flyers get the choice (postcards stay upload-only)", () => {
    const html = page("postcards", { flyerStudio: true });
    expect(html).toContain('data-upload-view="postcards"');
    expect(html).not.toContain("data-bc-choice");
  });
});
