"use client";

import { useEffect } from "react";

/**
 * Keep this list in sync with `FONT_OPTIONS` in
 * `src/lib/editor/editorPalette.ts` and the `next/font` registrations in
 * `src/app/mug/layout.tsx` / `src/app/notebook/layout.tsx`. Adding a font in
 * one place but not the others gives the admin wizard a fallback system font
 * while the public editors render the real one — avoid that.
 */
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  "family=Roboto:wght@400;700" +
  "&family=Open+Sans:wght@400;700" +
  "&family=Montserrat:wght@400;700" +
  "&family=Oswald:wght@400;700" +
  "&family=Comfortaa:wght@400;700" +
  "&family=Playfair+Display:wght@400;700" +
  "&family=Merriweather:wght@400;700" +
  "&family=Lobster" +
  "&family=Pacifico" +
  "&family=Caveat:wght@400;700" +
  "&subset=latin,cyrillic" +
  "&display=swap";

const LINK_ID = "mug-fonts-admin";

const CSS_VARS = `
:root {
  --font-mug-roboto: 'Roboto', sans-serif;
  --font-mug-open-sans: 'Open Sans', sans-serif;
  --font-mug-montserrat: 'Montserrat', sans-serif;
  --font-mug-oswald: 'Oswald', sans-serif;
  --font-mug-comfortaa: 'Comfortaa', sans-serif;
  --font-mug-playfair: 'Playfair Display', serif;
  --font-mug-merriweather: 'Merriweather', serif;
  --font-mug-lobster: 'Lobster', cursive;
  --font-mug-pacifico: 'Pacifico', cursive;
  --font-mug-caveat: 'Caveat', cursive;
}`;

const STYLE_ID = "mug-font-vars-admin";

/**
 * Injects Google Fonts stylesheet + CSS variable definitions when mounted.
 * Safe to mount multiple times — deduplicates by element ID.
 */
export default function MugFontLoader() {
  useEffect(() => {
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      link.href = GOOGLE_FONTS_URL;
      document.head.appendChild(link);
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS_VARS;
      document.head.appendChild(style);
    }
  }, []);

  return null;
}
