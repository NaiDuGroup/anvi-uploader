"use client";

import { useEffect } from "react";
import { buildFontCssVars, buildGoogleFontsUrl } from "@/lib/editor/editorPalette";

const LINK_ID = "design-fonts";
const STYLE_ID = "design-font-vars";

/**
 * Loads every editor font (Google Fonts `<link>`) and injects the matching
 * CSS variables. Both the stylesheet URL and the variable block are generated
 * from `FONT_OPTIONS`, so adding a font to the catalog is a one-line change.
 *
 * Safe to mount multiple times — deduplicates by element id.
 */
export default function DesignFontLoader() {
  useEffect(() => {
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      link.href = buildGoogleFontsUrl();
      document.head.appendChild(link);
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = buildFontCssVars();
      document.head.appendChild(style);
    }
  }, []);

  return null;
}
