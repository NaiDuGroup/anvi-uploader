/**
 * `next/font/google` registrations for every editor font.
 *
 * Keep in sync with `FONT_OPTIONS` in `src/lib/editor/editorPalette.ts`:
 * the `variable` names here must match each option's `cssVar`. next/font
 * requires statically analyzable literal arguments, hence the explicit list
 * (it cannot be generated from `FONT_OPTIONS` at runtime).
 *
 * Used by the public `/mug` and `/notebook` layouts. Admin pages load the
 * same fonts via `MugFontLoader` / `DesignFontLoader` instead.
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
});
const openSans = Open_Sans({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-open-sans",
});
const montserrat = Montserrat({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-montserrat",
});
const oswald = Oswald({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-oswald",
});
const comfortaa = Comfortaa({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-comfortaa",
});
const josefinSans = Josefin_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-josefin-sans",
});
const quicksand = Quicksand({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-quicksand",
});
const jost = Jost({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-jost",
});
const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-playfair",
});
const merriweather = Merriweather({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-merriweather",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-mug-cormorant",
});
const marcellus = Marcellus({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-marcellus",
});
const lobster = Lobster({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: "400",
  variable: "--font-mug-lobster",
});
const pacifico = Pacifico({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-pacifico",
});
const caveat = Caveat({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-caveat",
});
const dancingScript = Dancing_Script({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mug-dancing-script",
});
const greatVibes = Great_Vibes({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-great-vibes",
});
const alexBrush = Alex_Brush({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-alex-brush",
});
const parisienne = Parisienne({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mug-parisienne",
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
