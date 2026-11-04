import { describe, expect, it } from "vitest";
import { productEditorKind, shopEditorPath } from "./design";
import { shopT, SHOP_LANGS } from "./i18n";
import { shopHref } from "./shopHost";

describe("shop-mode editor links", () => {
  it("knows the editor of a product from its studio editor link and kind", () => {
    expect(productEditorKind({ editorHref: "/mug", simpleKind: "mug" })).toBe("mug");
    expect(productEditorKind({ editorHref: "/notebook", simpleKind: "notebook" })).toBe("notebook");
    expect(productEditorKind({ editorHref: "/pen", simpleKind: "pen" })).toBe("pen");
    // A UV item or a product without an editor gets none.
    expect(productEditorKind({ editorHref: "/mug", simpleKind: "uvItem" })).toBeNull();
    expect(productEditorKind({ editorHref: null, simpleKind: "mug" })).toBeNull();
    expect(productEditorKind({ editorHref: "/tshirt", simpleKind: null })).toBeNull();
  });

  it("opens the editor on the picked option, on both hosts", () => {
    const p = shopEditorPath("mug", { slug: "cana-alba", variant: "v 1" });
    expect(p).toBe("/shop/editor/mug?slug=cana-alba&variant=v+1");
    expect(shopHref("", p)).toBe("/editor/mug?slug=cana-alba&variant=v+1");
    expect(shopHref("/shop", p)).toBe(p);
    expect(shopEditorPath("notebook", { slug: "carnet-a5", variant: "n", edit: "line-1" })).toBe(
      "/shop/editor/notebook?slug=carnet-a5&variant=n&edit=line-1",
    );
    expect(shopEditorPath("pen")).toBe("/shop/editor/pen");
  });
});

describe("editor strings", () => {
  const keys = [
    "editorTitle",
    "editorBackProduct",
    "editorBackCart",
    "editorStepTemplate",
    "editorStepDesign",
    "editorStepPreview",
    "editorSaving",
    "editorSaveFailed",
    "editorPrintArea",
    "editorPhotosLost",
    "editorUnavailable",
    "editDesign",
    "editorNote",
  ] as const;
  it("exist in ro, ru and en, translated", () => {
    for (const lang of SHOP_LANGS) {
      const t = shopT(lang);
      for (const k of keys) expect(t(k).trim().length, `${lang}.${k}`).toBeGreaterThan(0);
    }
    expect(shopT("ru")("editDesign")).toBe("Изменить дизайн");
    expect(shopT("en")("editDesign")).toBe("Edit design");
    expect(shopT("ro")("editDesign")).toBe("Editează designul");
    expect(shopT("ro")("editorTitle", { name: "Cană" })).toBe("Design: Cană");
    // The product card no longer says the editor has its own cart.
    for (const lang of SHOP_LANGS) expect(shopT(lang)("editorNote")).not.toMatch(/separat|отдельно|separately/);
  });
});
