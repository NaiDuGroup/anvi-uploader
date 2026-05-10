import {
  Roboto,
  Open_Sans,
  Montserrat,
  Oswald,
  Comfortaa,
  Playfair_Display,
  Merriweather,
  Lobster,
  Pacifico,
  Caveat,
} from "next/font/google";

const roboto = Roboto({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-roboto",
});
const openSans = Open_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-open-sans",
});
const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-montserrat",
});
const oswald = Oswald({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-oswald",
});
const comfortaa = Comfortaa({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-comfortaa",
});
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-playfair",
});
const merriweather = Merriweather({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-merriweather",
});
const lobster = Lobster({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-mug-lobster",
});
const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mug-pacifico",
});
const caveat = Caveat({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-mug-caveat",
});

export default function NotebookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        roboto.variable,
        openSans.variable,
        montserrat.variable,
        oswald.variable,
        comfortaa.variable,
        playfair.variable,
        merriweather.variable,
        lobster.variable,
        pacifico.variable,
        caveat.variable,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
