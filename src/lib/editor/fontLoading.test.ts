import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { designDocFontRequests, designDocText } from "@/lib/design/fonts";
import { designDocSchema } from "@/lib/design/doc";
import { FONT_OPTIONS } from "./editorPalette";
import {
  createFontLoader,
  fontLoadSpec,
  fontSampleKey,
  layoutFontRequests,
  resolveCanvasFontFamily,
  uniqueFontRequests,
  type FontFaceSetLike,
} from "./fontLoading";

function mockFontSet(impl?: (font: string, text?: string) => Promise<unknown[]>) {
  const load = vi.fn(impl ?? (async () => [{}]));
  const set: FontFaceSetLike = { load };
  return { set, load };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("layoutFontRequests", () => {
  it("asks for the caption font in bold (what the renderers draw)", () => {
    expect(layoutFontRequests({ text: "Mama", fontFamily: "Lobster" })).toEqual([
      { family: "Lobster", weight: 700, style: "normal" },
    ]);
  });

  it("asks for nothing when there is no caption", () => {
    expect(layoutFontRequests({ text: "", fontFamily: "Lobster" })).toEqual([]);
    expect(layoutFontRequests({ text: "   ", fontFamily: "Lobster" })).toEqual([]);
    expect(layoutFontRequests({ text: "Hi", fontFamily: "Lobster", noText: true })).toEqual([]);
    expect(layoutFontRequests({ text: "Hi", fontFamily: "" })).toEqual([]);
  });
});

describe("designDocFontRequests (studio)", () => {
  const base = { x: 0, y: 0, width: 100, height: 40, fontSizePx: 40, color: "#000000" };
  const doc = designDocSchema.parse({
    version: 1,
    background: { color: "transparent" },
    elements: [
      { kind: "text", id: "a", ...base, text: "Ana", fontId: "lobster" },
      { kind: "text", id: "b", ...base, text: "Мама", fontId: "lobster" },
      { kind: "text", id: "c", ...base, text: "x", fontId: "cormorant", fontWeight: 700, italic: true },
      { kind: "text", id: "d", ...base, text: "up", fontId: "roboto", uppercase: true },
    ],
  });

  it("collects each family / weight / style once", () => {
    expect(designDocFontRequests(doc)).toEqual([
      { family: "Lobster", weight: 400, style: "normal" },
      { family: "Cormorant Garamond", weight: 700, style: "italic" },
      { family: "Roboto", weight: 400, style: "normal" },
    ]);
  });

  it("collects the drawn characters (uppercase applied)", () => {
    expect(designDocText(doc)).toBe("AnaМамаxUP");
  });
});

describe("fontLoadSpec / fontSampleKey / uniqueFontRequests", () => {
  it("builds a FontFaceSet.load shorthand", () => {
    expect(fontLoadSpec({ family: "Great Vibes", weight: 700 })).toBe('normal 700 40px "Great Vibes"');
    expect(fontLoadSpec({ family: "'Lobster'", style: "italic" }, 12)).toBe('italic 400 12px "Lobster"');
  });

  it("reduces text to sorted unique characters", () => {
    expect(fontSampleKey("baba")).toBe("ab");
    expect(fontSampleKey("")).toBe(" ");
    expect(fontSampleKey(null)).toBe(" ");
    expect(fontSampleKey("Ма\nма")).toBe(["М", "а", "м"].sort().join(""));
  });

  it("drops duplicate faces", () => {
    expect(
      uniqueFontRequests([
        { family: "Roboto", weight: 700 },
        { family: "Roboto", weight: 700, style: "normal" },
        { family: "Roboto", weight: 400 },
      ]),
    ).toHaveLength(2);
  });
});

describe("createFontLoader", () => {
  it("loads only the requested faces, with the drawn text", async () => {
    const { set, load } = mockFontSet();
    const loader = createFontLoader(() => set);
    const ok = await loader.ensure([{ family: "Lobster", weight: 700 }], { text: "Мама" });
    expect(ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('normal 700 40px "Lobster"', fontSampleKey("Мама"));
    expect(loader.isLoaded({ family: "Lobster", weight: 700 }, "Мама")).toBe(true);
  });

  it("requests each face + character set once (also while in flight)", async () => {
    const { set, load } = mockFontSet();
    const loader = createFontLoader(() => set);
    const req = [{ family: "Caveat", weight: 700 }];
    await Promise.all([loader.ensure(req, { text: "ab" }), loader.ensure(req, { text: "ba" })]);
    await loader.ensure(req, { text: "abab" });
    await loader.ensure([...req, ...req], { text: "ab" });
    expect(load).toHaveBeenCalledTimes(1);
    // New characters (e.g. Cyrillic → another unicode-range file) load again.
    await loader.ensure(req, { text: "Жж" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache a family with no @font-face yet, so a later call retries", async () => {
    let faces: unknown[] = [];
    const { set, load } = mockFontSet(async () => faces);
    const loader = createFontLoader(() => set);
    expect(await loader.ensure([{ family: "Lobster" }])).toBe(false);
    faces = [{}];
    expect(await loader.ensure([{ family: "Lobster" }])).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resolves false on a rejected load (never throws)", async () => {
    const { set } = mockFontSet(async () => {
      throw new Error("network");
    });
    const loader = createFontLoader(() => set);
    await expect(loader.ensure([{ family: "Lobster" }])).resolves.toBe(false);
  });

  it("gives up after the timeout so export is never stuck", async () => {
    vi.useFakeTimers();
    const { set } = mockFontSet(() => new Promise<unknown[]>(() => {}));
    const loader = createFontLoader(() => set);
    const p = loader.ensure([{ family: "Lobster" }], { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe(false);
  });

  it("is a no-op without a FontFaceSet (SSR) or without requests", async () => {
    expect(await createFontLoader(() => null).ensure([{ family: "Lobster" }])).toBe(true);
    const { set, load } = mockFontSet();
    expect(await createFontLoader(() => set).ensure([])).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("resolveCanvasFontFamily", () => {
  it("uses the primary family of the CSS variable", () => {
    const vars: Record<string, string> = { "--font-mug-lobster": " 'Lobster', 'Lobster Fallback'" };
    expect(resolveCanvasFontFamily("Lobster", "var(--font-mug-lobster)", (n) => vars[n] ?? "")).toBe("Lobster");
    vars["--font-mug-lobster"] = "'__Lobster_abc', cursive";
    expect(resolveCanvasFontFamily("Lobster", "var(--font-mug-lobster)", (n) => vars[n] ?? "")).toBe("__Lobster_abc");
  });

  it("falls back to the catalog family", () => {
    expect(resolveCanvasFontFamily("Lobster", undefined, () => "x")).toBe("Lobster");
    expect(resolveCanvasFontFamily("Lobster", "var(--font-mug-lobster)", () => "")).toBe("Lobster");
  });
});

describe("editorNextFonts registrations", () => {
  const src = readFileSync(path.join(__dirname, "editorNextFonts.ts"), "utf8");
  const calls = src.split(/= [A-Z][A-Za-z_]+\(\{/).slice(1);

  it("registers every catalog font", () => {
    expect(calls).toHaveLength(FONT_OPTIONS.length);
    for (const f of FONT_OPTIONS) {
      expect(src).toContain(`variable: "${f.cssVar.slice("var(".length, -1)}"`);
    }
  });

  it("never preloads editor fonts (they load lazily)", () => {
    for (const call of calls) expect(call.split("});")[0]).toContain("preload: false");
  });
});
