import { describe, expect, it } from "vitest";
import { isMagicMug as lookIsMagic } from "./mugLook";
import { isMagicMugText } from "./magicMug";
import { isMagicMug as viewsIsMagic } from "./mugViews";

describe("isMagicMugText", () => {
  const magic = ["cana-magica", "Cană magică neagră", "Cană termo-magic mată", "Кружка-хамелеон", "Кружка термомагическая", "Color changing mug", "S1-MAGIC-330"];
  const plain = ["cana-alba", "Cană albă 320ml", "S1-KB-320", "Classic white mug"];
  it("tells magic mugs from plain ones", () => {
    for (const t of magic) expect(isMagicMugText(t), t).toBe(true);
    for (const t of plain) expect(isMagicMugText(t), t).toBe(false);
  });
  it("is the one rule behind both helpers (look item and view bar texts)", () => {
    for (const t of [...magic, ...plain]) {
      expect(viewsIsMagic(t)).toBe(isMagicMugText(t));
      expect(lookIsMagic({ nameRo: t })).toBe(isMagicMugText(t));
    }
  });
});
