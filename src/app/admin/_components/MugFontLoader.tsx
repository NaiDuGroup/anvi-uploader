"use client";

import { useEffect } from "react";

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  "family=Roboto:wght@400;700" +
  "&family=Playfair+Display:wght@400;700" +
  "&family=Pacifico" +
  "&family=Montserrat:wght@400;700" +
  "&family=Lobster" +
  "&subset=latin,cyrillic" +
  "&display=swap";

const LINK_ID = "mug-fonts-admin";

const CSS_VARS = `
:root {
  --font-mug-roboto: 'Roboto', sans-serif;
  --font-mug-playfair: 'Playfair Display', serif;
  --font-mug-pacifico: 'Pacifico', cursive;
  --font-mug-montserrat: 'Montserrat', sans-serif;
  --font-mug-lobster: 'Lobster', cursive;
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
