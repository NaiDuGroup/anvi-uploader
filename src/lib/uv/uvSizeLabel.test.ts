import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { ro } from "@/lib/i18n/ro";
import { ru } from "@/lib/i18n/ru";
import { uvSizeCmLabel } from "./uvSizeLabel";

describe("uvSizeCmLabel", () => {
  const fmt = (locale: string) => (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

  it("uses the admin language's cm unit", () => {
    expect(uvSizeCmLabel(14.5, 21, ru.uv.editor.cm, fmt("ru-RU"))).toBe("14,5×21 см");
    expect(uvSizeCmLabel(14.5, 21, ro.uv.editor.cm, fmt("ro-RO"))).toBe("14,5×21 cm");
    expect(uvSizeCmLabel(14.5, 21, en.uv.editor.cm, fmt("en-US"))).toBe("14.5×21 cm");
  });

  it("plain numbers without a formatter", () => {
    expect(uvSizeCmLabel(6, 4, "cm")).toBe("6×4 cm");
  });
});
