import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BusinessCardPage } from "./BusinessCardPage";

vi.mock("./BusinessCardView", () => ({ BusinessCardView: ({ editId }: { editId: string | null }) => h("div", { "data-upload-form": editId ?? "" }) }));

describe("business-card page gate (bc-7)", () => {
  it("customers without the card Studio get exactly the upload page", () => {
    const html = renderToStaticMarkup(h(BusinessCardPage, { lang: "ro", base: "", editId: null }));
    expect(html).toContain("data-upload-form");
    expect(html).not.toContain("data-bc-choice");
    expect(html).not.toContain("data-studio-card-cta");
    expect(html).not.toContain("Creează online");
  });

  it("gated viewers choose «Creează online» (Studio) or «Încarcă fișierul tău» (the same upload form)", () => {
    const html = renderToStaticMarkup(h(BusinessCardPage, { lang: "ro", base: "", editId: null, cardStudio: true }));
    expect(html).toContain('data-bc-tab="create"');
    expect(html).toContain('data-bc-tab="upload"');
    expect(html).toContain("Creează online");
    expect(html).toContain("Încarcă fișierul tău");
    expect(html).toMatch(/data-studio-card-cta[^>]*|href="[^"]*studio\/card/);
    expect(html).toContain("data-upload-form");
    // Editing an uploaded cart line opens on the upload form.
    const edit = renderToStaticMarkup(h(BusinessCardPage, { lang: "ro", base: "", editId: "l1", cardStudio: true }));
    expect(edit).toMatch(/aria-selected="true"[^>]*data-bc-tab="upload"/);
  });
});
