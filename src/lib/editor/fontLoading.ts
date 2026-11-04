/**
 * Lazy font loading for the canvas editors (mug / notebook / pen, studio and
 * shop mode).
 *
 * The editor fonts are registered with `next/font` (`preload: false`) or a
 * Google Fonts stylesheet (admin), so the browser only knows their
 * `@font-face` rules and fetches a file when something uses it. Canvas 2D does
 * not wait for that: drawing with a face that is not loaded yet silently uses
 * the fallback. So before drawing text (first render, after a font change and
 * before export) the editors call `ensureFontsLoaded` for exactly the faces
 * the layout uses, then redraw.
 */

/** Weight / style of one face drawn on a canvas. */
export interface FontRequest {
  readonly family: string;
  readonly weight?: number | string;
  readonly style?: "normal" | "italic";
}

/** Subset of `FontFaceSet` the loader needs (mockable in tests). */
export interface FontFaceSetLike {
  load(font: string, text?: string): Promise<unknown[]>;
  check?(font: string, text?: string): boolean;
}

/** The mug / notebook / pen renderers draw the caption as `bold Npx "Family"`. */
export const EDITOR_TEXT_WEIGHT = 700;

/** Default upper bound for waiting on a font before drawing anyway. */
export const FONT_LOAD_TIMEOUT_MS = 4000;

/**
 * Fonts a mug / notebook / pen layout draws: the caption font in bold, and
 * nothing when the caption is empty or the template has no text.
 */
export function layoutFontRequests(layout: {
  readonly text?: string | null;
  readonly fontFamily?: string | null;
  readonly noText?: boolean;
}): FontRequest[] {
  const family = layout.fontFamily?.trim();
  if (!family || layout.noText || !layout.text?.trim()) return [];
  return [{ family, weight: EDITOR_TEXT_WEIGHT, style: "normal" }];
}

/** Remove duplicate faces (same family + weight + style). */
export function uniqueFontRequests(requests: readonly FontRequest[]): FontRequest[] {
  const seen = new Map<string, FontRequest>();
  for (const r of requests) seen.set(fontLoadSpec(r), r);
  return [...seen.values()];
}

/** CSS `font` shorthand for `FontFaceSet.load` (it needs a size; any works). */
export function fontLoadSpec(request: FontRequest, sizePx = 40): string {
  const family = request.family.replace(/^['"]|['"]$/g, "").replace(/"/g, "");
  return `${request.style ?? "normal"} ${request.weight ?? 400} ${sizePx}px "${family}"`;
}

/**
 * The characters that decide which `unicode-range` subsets (latin,
 * latin-ext, cyrillic…) get fetched. Sorted unique, so retyping the same
 * letters does not trigger a new load.
 */
export function fontSampleKey(text: string | null | undefined): string {
  const chars = new Set<string>(Array.from(text && text.length > 0 ? text : " "));
  chars.delete("\n");
  if (chars.size === 0) chars.add(" ");
  return [...chars].sort().join("");
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

export interface EnsureFontsOptions {
  /** Text drawn with these faces (picks the unicode-range subsets). */
  readonly text?: string | null;
  readonly timeoutMs?: number;
}

export interface FontLoader {
  /**
   * Load every requested face for `text`; resolves `true` when all of them
   * loaded, `false` on timeout / failure / unknown family (never rejects).
   * Each face + character set is requested only once.
   */
  ensure(requests: readonly FontRequest[], options?: EnsureFontsOptions): Promise<boolean>;
  /** True once `ensure` loaded this face for these characters. */
  isLoaded(request: FontRequest, text?: string | null): boolean;
}

/**
 * Loader over a `FontFaceSet` (`document.fonts`), deduplicating requests.
 * A request whose family has no matching `@font-face` yet (e.g. the admin
 * stylesheet is still downloading) is not cached, so a later call retries.
 */
export function createFontLoader(getFontSet: () => FontFaceSetLike | null | undefined): FontLoader {
  const pending = new Map<string, Promise<boolean>>();
  const loaded = new Set<string>();

  const keyOf = (r: FontRequest, text?: string | null) => `${fontLoadSpec(r)}|${fontSampleKey(text)}`;

  const loadOne = (fontSet: FontFaceSetLike, r: FontRequest, text: string | null | undefined): Promise<boolean> => {
    const key = keyOf(r, text);
    if (loaded.has(key)) return Promise.resolve(true);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const sample = fontSampleKey(text);
    const p = Promise.resolve()
      .then(() => fontSet.load(fontLoadSpec(r), sample))
      .then(
        (faces) => {
          const ok = Array.isArray(faces) && faces.length > 0;
          if (ok) loaded.add(key);
          return ok;
        },
        () => false,
      )
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };

  return {
    async ensure(requests, options = {}) {
      const fontSet = getFontSet();
      if (!fontSet) return true;
      const unique = uniqueFontRequests(requests);
      if (unique.length === 0) return true;
      const all = Promise.all(unique.map((r) => loadOne(fontSet, r, options.text))).then((oks) =>
        oks.every(Boolean),
      );
      return withTimeout(all, options.timeoutMs ?? FONT_LOAD_TIMEOUT_MS, false);
    },
    isLoaded(request, text) {
      return loaded.has(keyOf(request, text));
    },
  };
}

const browserLoader: FontLoader = createFontLoader(() =>
  typeof document !== "undefined" && document.fonts ? (document.fonts as unknown as FontFaceSetLike) : null,
);

/** Load the faces a canvas is about to draw (browser `document.fonts`). */
export function ensureFontsLoaded(
  requests: readonly FontRequest[],
  options?: EnsureFontsOptions,
): Promise<boolean> {
  return browserLoader.ensure(requests, options);
}

/**
 * Export-grade wait: like `ensureFontsLoaded`, but when a face is missing
 * (its `@font-face` stylesheet may still be downloading — admin Google Fonts
 * `<link>`) waits for `document.fonts.ready` (bounded) and tries once more.
 */
export async function ensureFontsLoadedForExport(
  requests: readonly FontRequest[],
  options?: EnsureFontsOptions,
): Promise<boolean> {
  if (requests.length === 0) return true;
  if (await ensureFontsLoaded(requests, options)) return true;
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
  }
  return ensureFontsLoaded(requests, options);
}

/**
 * Resolve the family name a canvas must use for an editor font: the value of
 * its `next/font` CSS variable (`--font-mug-lobster: 'Lobster', …`) as seen
 * from `el` (the variables live on the editor wrapper, not on `<html>`), else
 * the catalog family itself.
 */
export function resolveCanvasFontFamily(
  fontFamily: string,
  cssVar: string | undefined,
  readVar: (name: string) => string,
): string {
  if (!cssVar) return fontFamily;
  const varName = cssVar.replace("var(", "").replace(")", "").trim();
  const resolved = readVar(varName).trim();
  if (!resolved) return fontFamily;
  const primary = resolved.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "");
  return primary || fontFamily;
}
