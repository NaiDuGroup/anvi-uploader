"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FONT_OPTIONS } from "./editorPalette";
import {
  ensureFontsLoaded,
  ensureFontsLoadedForExport,
  fontSampleKey,
  layoutFontRequests,
  resolveCanvasFontFamily,
} from "./fontLoading";

const FONT_VAR_MAP = new Map<string, string>(FONT_OPTIONS.map((f) => [f.family, f.cssVar]));

/** Canvas family name for an editor font (see `resolveCanvasFontFamily`). */
function resolveFamily(fontFamily: string): string {
  if (typeof window === "undefined") return fontFamily;
  const root = getComputedStyle(document.documentElement);
  return resolveCanvasFontFamily(fontFamily, FONT_VAR_MAP.get(fontFamily), (name) =>
    root.getPropertyValue(name),
  );
}

export interface CanvasFonts {
  /** Family to hand to the renderer. */
  readonly resolvedFont: string;
  /** Changes whenever a font finished loading: include it in the render deps. */
  readonly fontsTick: number;
  /**
   * Await the layout's font (with a timeout), retrying once after pending
   * stylesheets settle. Call right before exporting, then redraw.
   */
  prepare(): Promise<boolean>;
}

/**
 * Loads only the font the canvas layout draws (bold caption font, for the
 * characters typed) and re-renders once it is there — on first paint, on a
 * font pick and on new characters (Cyrillic needs another subset file).
 */
export function useCanvasFonts(fontFamily: string, text: string): CanvasFonts {
  const resolvedFont = useMemo(() => resolveFamily(fontFamily), [fontFamily]);
  const sample = fontSampleKey(text);
  const [fontsTick, setTick] = useState(0);
  const latest = useRef({ resolvedFont, text });
  useEffect(() => {
    latest.current = { resolvedFont, text };
  });

  useEffect(() => {
    let cancelled = false;
    const requests = layoutFontRequests({ fontFamily: resolvedFont, text: sample });
    void ensureFontsLoaded(requests, { text: sample }).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedFont, sample]);

  // Any face finishing later (slow network, admin stylesheet arriving) → redraw.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const fonts = document.fonts;
    const bump = () => setTick((t) => t + 1);
    fonts.addEventListener?.("loadingdone", bump);
    return () => fonts.removeEventListener?.("loadingdone", bump);
  }, []);

  const prepare = useCallback(async (): Promise<boolean> => {
    const { resolvedFont: family, text: current } = latest.current;
    const requests = layoutFontRequests({ fontFamily: family, text: current });
    return ensureFontsLoadedForExport(requests, { text: current });
  }, []);

  return { resolvedFont, fontsTick, prepare };
}

/**
 * Font-picker previews (each button label in its own font) are on demand:
 * they switch on when the user points at / focuses the picker, or once the
 * picker is on screen after the page finished loading and the browser is
 * idle. Until then the labels use the page font, so ~19 preview files are
 * not fetched with the editor. Pass `attach` as the picker container's `ref` (a
 * callback ref, so a picker that mounts later — template switch — works).
 */
export function useFontPreviewsActive(): { attach: (el: HTMLElement | null) => void; active: boolean } {
  const [active, setActive] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (active || !el) return;
    let visible = false;
    let idle = false;
    let idleHandle: number | null = null;
    const activate = () => setActive(true);
    const maybe = () => {
      if (visible && idle) activate();
    };
    const whenIdle = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      const done = () => {
        idle = true;
        maybe();
      };
      if (w.requestIdleCallback) idleHandle = w.requestIdleCallback(done, { timeout: 2000 });
      else idleHandle = window.setTimeout(done, 300);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        maybe();
      });
      io.observe(el);
    } else {
      visible = true;
    }
    el.addEventListener("pointerenter", activate);
    el.addEventListener("focusin", activate);
    el.addEventListener("touchstart", activate, { passive: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      if (idleHandle != null) {
        const w = window as Window & { cancelIdleCallback?: (h: number) => void };
        if (w.cancelIdleCallback) w.cancelIdleCallback(idleHandle);
        window.clearTimeout(idleHandle);
      }
      io?.disconnect();
      el.removeEventListener("pointerenter", activate);
      el.removeEventListener("focusin", activate);
      el.removeEventListener("touchstart", activate);
    };
  }, [el, active]);
  return { attach: setEl, active };
}
