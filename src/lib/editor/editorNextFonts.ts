/**
 * `next/font/local` registrations for every editor font.
 *
 * The woff2 files live in `src/fonts/<family>/` (with each family's OFL.txt):
 * Google Fonts' variable fonts limited to the weights used here (400–700) and
 * subset to latin / latin-ext / cyrillic (per font, the subsets it used to
 * request from `next/font/google`). Bundling them keeps `next build` off the
 * network — `next/font/google` failed builds whenever Google answered oddly.
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
import localFont from "next/font/local";

const roboto = localFont({
  // Roboto — subsets latin, latin-ext, cyrillic
  src: "../../fonts/roboto/Roboto-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-roboto",
  preload: false,
});
const openSans = localFont({
  // Open Sans — subsets latin, latin-ext, cyrillic
  src: "../../fonts/opensans/OpenSans-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-open-sans",
  preload: false,
});
const montserrat = localFont({
  // Montserrat — subsets latin, latin-ext, cyrillic
  src: "../../fonts/montserrat/Montserrat-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-montserrat",
  preload: false,
});
const oswald = localFont({
  // Oswald — subsets latin, latin-ext, cyrillic
  src: "../../fonts/oswald/Oswald-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-oswald",
  preload: false,
});
const comfortaa = localFont({
  // Comfortaa — subsets latin, latin-ext, cyrillic
  src: "../../fonts/comfortaa/Comfortaa-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-comfortaa",
  preload: false,
});
const josefinSans = localFont({
  // Josefin Sans — subsets latin, latin-ext
  src: "../../fonts/josefinsans/JosefinSans-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-josefin-sans",
  preload: false,
});
const quicksand = localFont({
  // Quicksand — subsets latin, latin-ext
  src: "../../fonts/quicksand/Quicksand-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-quicksand",
  preload: false,
});
const jost = localFont({
  // Jost — subsets latin
  src: "../../fonts/jost/Jost-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-jost",
  preload: false,
  display: "swap",
});
const playfair = localFont({
  // Playfair Display — subsets latin, latin-ext, cyrillic
  src: "../../fonts/playfairdisplay/PlayfairDisplay-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-playfair",
  adjustFontFallback: "Times New Roman", // serif, as next/font/google did
  preload: false,
});
const merriweather = localFont({
  // Merriweather — subsets latin, latin-ext, cyrillic
  src: "../../fonts/merriweather/Merriweather-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-merriweather",
  adjustFontFallback: "Times New Roman", // serif, as next/font/google did
  preload: false,
});
const cormorant = localFont({
  // Cormorant Garamond — subsets latin, latin-ext, cyrillic
  src: [
    { path: "../../fonts/cormorantgaramond/CormorantGaramond-wght.woff2", style: "normal" },
    { path: "../../fonts/cormorantgaramond/CormorantGaramond-Italic-wght.woff2", style: "italic" },
  ],
  weight: "400 700",
  variable: "--font-mug-cormorant",
  adjustFontFallback: "Times New Roman", // serif, as next/font/google did
  preload: false,
});
const marcellus = localFont({
  // Marcellus — subsets latin, latin-ext
  src: "../../fonts/marcellus/Marcellus-Regular.woff2",
  weight: "400",
  variable: "--font-mug-marcellus",
  adjustFontFallback: "Times New Roman", // serif, as next/font/google did
  preload: false,
});
const lobster = localFont({
  // Lobster — subsets latin, latin-ext, cyrillic
  src: "../../fonts/lobster/Lobster-Regular.woff2",
  weight: "400",
  variable: "--font-mug-lobster",
  preload: false,
});
const pacifico = localFont({
  // Pacifico — subsets latin, latin-ext
  src: "../../fonts/pacifico/Pacifico-Regular.woff2",
  weight: "400",
  variable: "--font-mug-pacifico",
  preload: false,
});
const caveat = localFont({
  // Caveat — subsets latin, latin-ext, cyrillic
  src: "../../fonts/caveat/Caveat-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-caveat",
  preload: false,
});
const dancingScript = localFont({
  // Dancing Script — subsets latin, latin-ext
  src: "../../fonts/dancingscript/DancingScript-wght.woff2",
  weight: "400 700",
  variable: "--font-mug-dancing-script",
  preload: false,
});
const greatVibes = localFont({
  // Great Vibes — subsets latin, latin-ext
  src: "../../fonts/greatvibes/GreatVibes-Regular.woff2",
  weight: "400",
  variable: "--font-mug-great-vibes",
  preload: false,
});
const alexBrush = localFont({
  // Alex Brush — subsets latin, latin-ext
  src: "../../fonts/alexbrush/AlexBrush-Regular.woff2",
  weight: "400",
  variable: "--font-mug-alex-brush",
  preload: false,
});
const parisienne = localFont({
  // Parisienne — subsets latin, latin-ext
  src: "../../fonts/parisienne/Parisienne-Regular.woff2",
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
