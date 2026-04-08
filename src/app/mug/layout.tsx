import {
  Roboto,
  Playfair_Display,
  Pacifico,
  Montserrat,
  Lobster,
} from "next/font/google";

const roboto = Roboto({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], variable: "--font-mug-roboto" });
const playfair = Playfair_Display({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], variable: "--font-mug-playfair" });
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-mug-pacifico" });
const montserrat = Montserrat({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], variable: "--font-mug-montserrat" });
const lobster = Lobster({ subsets: ["latin", "cyrillic"], weight: "400", variable: "--font-mug-lobster" });

export default function MugLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${roboto.variable} ${playfair.variable} ${pacifico.variable} ${montserrat.variable} ${lobster.variable}`}
    >
      {children}
    </div>
  );
}
