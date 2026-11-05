import { describe, expect, it } from "vitest";
import { renderShopEmail } from "./templates";

describe("corporate_received e-mail", () => {
  it("«Am primit cererea» in ro / ru / en with the request number", () => {
    const d = { origin: "https://anvi.md", name: "Maria Ionescu", orderNumber: 12 };
    const ro = renderShopEmail("corporate_received", "ro", d);
    expect(ro.subject).toBe("Am primit cererea nr. 12");
    expect(ro.text).toContain("Bună, Maria!");
    expect(ro.text).toContain("Vezi catalogul: https://anvi.md");
    expect(renderShopEmail("corporate_received", "ru", d).subject).toBe("Мы получили заявку № 12");
    const en = renderShopEmail("corporate_received", "en", d);
    expect(en.subject).toBe("We've received request no. 12");
    expect(en.html).toContain('lang="en"');
    expect(en.html).not.toContain("{number}");
  });
});
