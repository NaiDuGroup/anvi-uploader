/**
 * `next/font/google` registrations for every editor font.
 *
 * Keep in sync with `FONT_OPTIONS` in `src/lib/editor/editorPalette.ts`:
 * the `variable` names here must match each option's `cssVar`. next/font
 * requires statically analyzable literal arguments, hence the explicit list
 * (it cannot be generated from `FONT_OPTIONS` at runtime).
 *
 * Used by the public `/mug`, `/notebook`, `/pen` layouts and the shop editor.
 * Admin pages load the same fonts via `MugFontLoader` / `DesignFontLoader`.
 *
 * `preload: false` on every font: only the `@font-face` rules ship with the
 * page, so the browser fetches a file when something actually uses it — the
 * canvas caption font (`useCanvasFonts` loads it explicitly before drawing /
 * exporting) and the font-picker previews (`useFontPreviewsActive`, on
 * demand). Preloading all of them cost ~50 woff2 files (~1.5 MB) per editor
 * page load.
 */
import {
  Roboto,
  Open_Sans,
  Montserrat,
  Oswald,
  Comfortaa,
  Josefin_Sans,
  Quicksand,
  Jost,
  Playfair_Display,
  Merriweather,
  Cormorant_Garamond,
  Marcellus,
  Lobster,
  Pacifico,
  Caveat,
  Dancing_Script,
  Great_Vibes,
  Alex_Brush,
  Parisienne,
} from "next/font/google";

const roboto = Roboto({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-roboto",
  preload: false,
});
const openSans = Open_Sans({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-open-sans",
  preload: false,
});
const montserrat = Montserrat({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-montserrat",
  preload: false,
});
const oswald = Oswald({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-oswald",
  preload: false,
});
const comfortaa = Comfortaa({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-comfortaa",
  preload: false,
});
const josefinSans = Josefin_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-josefin-sans",
  preload: false,
});
const quicksand = Quicksand({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-quicksand",
  preload: false,
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mug-jost",
  preload: false,
  display: "swap",
});
const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-playfair",
  preload: false,
});
const merriweather = Merriweather({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-merriweather",
  preload: false,
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-mug-cormorant",
  preload: false,
});
const marcellus = Marcellus({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-marcellus",
  preload: false,
});
const lobster = Lobster({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: "400",
  variable: "--font-mug-lobster",
  preload: false,
});
const pacifico = Pacifico({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-pacifico",
  preload: false,
});
const caveat = Caveat({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-caveat",
  preload: false,
});
const dancingScript = Dancing_Script({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-dancing-script",
  preload: false,
});
const greatVibes = Great_Vibes({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-great-vibes",
  preload: false,
});
const alexBrush = Alex_Brush({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-alex-brush",
  preload: false,
});
const parisienne = Parisienne({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-parisienne",
  preload: false,
});

/** Class names that expose every editor font CSS variable. */
export const EDITOR_FONT_VARIABLE_CLASSES: readonly string[] = [
  roboto.variable,
  openSans.variable,
  montserrat.variable,
  oswald.variable,
  comfortaa.variable,
  josefinSans.variable,
  quicksand.variable,
  jost.variable,
  playfair.variable,
  merriweather.variable,
  cormorant.variable,
  marcellus.variable,
  lobster.variable,
  pacifico.variable,
  caveat.variable,
  dancingScript.variable,
  greatVibes.variable,
  alexBrush.variable,
  parisienne.variable,
];
