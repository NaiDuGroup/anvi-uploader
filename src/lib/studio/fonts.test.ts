import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioTextLayer } from "./document";

const layer: StudioTextLayer = {
  id: "t", kind: "text", x: 0, y: 0, w: 40, h: 10, rotation: 0, text: "Compania ta", fontFamily: "Playfair Display", bold: true,
  sizePt: 24, color: "#14213d", align: "center", lineHeight: 1.2,
};

/** A `document.fonts` whose faces can be «re-created» (unloaded again), like after a page refresh. */
function fakeFonts() {
  const listeners = new Set<() => void>();
  const state = { ready: false, loads: 0 };
  const set = {
    check: () => state.ready,
    load: vi.fn(async () => {
      state.loads++;
      state.ready = true;
      for (const l of listeners) l();
      return [{}];
    }),
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  return { set, state, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("studio fonts", () => {
  it("loads a face again when the browser lost it (page refresh after the language switch)", async () => {
    const f = fakeFonts();
    vi.stubGlobal("document", { fonts: f.set, querySelector: () => null, documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    const { loadTextFonts } = await import("./fonts");
    expect(await loadTextFonts([layer])).toBe(true);
    const first = f.set.load.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    // Same faces, still ready: nothing loads.
    expect(await loadTextFonts([layer])).toBe(true);
    expect(f.set.load.mock.calls.length).toBe(first);
    // The @font-face rules were re-created: the shared loader thinks they are loaded, the browser does not.
    f.state.ready = false;
    expect(await loadTextFonts([layer])).toBe(true);
    expect(f.set.load.mock.calls.length).toBe(first + 1);
    expect(f.state.ready).toBe(true);
  });

  it("tells the editor when font files arrive late (redraw)", async () => {
    const f = fakeFonts();
    vi.stubGlobal("document", { fonts: f.set, querySelector: () => null, documentElement: {} });
    const { onStudioFontsLoaded } = await import("./fonts");
    const fn = vi.fn();
    const off = onStudioFontsLoaded(fn);
    for (const l of f.listeners) l();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    expect(f.listeners.size).toBe(0);
  });
});
