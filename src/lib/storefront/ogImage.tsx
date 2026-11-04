import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Branded link-preview image (Viber, Facebook, Telegram…): navy #14213d,
 * gold accents, the round ANVI logo and the page title. Used by the
 * storefront's `opengraph-image` routes. Always Romanian: preview bots send
 * no language cookie. Noto Sans (from /public/fonts) covers ă, â, î, ș, ț.
 */

export const SHOP_OG_SIZE = { width: 1200, height: 630 };
export const SHOP_OG_CONTENT_TYPE = "image/png";

const NAVY = "#14213d";
const GOLD = "#cdac21";

async function asset(rel: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "public", rel));
}

export async function shopOgImage(o: { title: string; subtitle?: string; eyebrow?: string }): Promise<ImageResponse> {
  const [bold, regular, logo] = await Promise.all([
    asset("fonts/NotoSans-Bold.ttf"),
    asset("fonts/NotoSans-Regular.ttf"),
    asset("logo.png"),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const titleSize: number = o.title.length > 40 ? 64 : o.title.length > 24 ? 76 : 92;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          color: "#ffffff",
          padding: "64px 72px",
          fontFamily: "Noto Sans",
          borderBottom: `14px solid ${GOLD}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* The logo PNG has a flat light background: crop to its gold circle. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
          <img src={logoSrc} width={156} height={156} alt="" style={{ clipPath: "circle(41% at 50% 50%)", margin: -12 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>ANVI</span>
            <span style={{ fontSize: 26, color: GOLD, fontWeight: 700 }}>anvi.md</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {o.eyebrow ? (
            <span style={{ fontSize: 28, color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: 3 }}>
              {o.eyebrow}
            </span>
          ) : null}
          <span style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.08 }}>{o.title}</span>
          {o.subtitle ? (
            <span style={{ fontSize: 32, color: "#c9d1de", lineHeight: 1.3, fontWeight: 400 }}>{o.subtitle}</span>
          ) : null}
        </div>
      </div>
    ),
    {
      ...SHOP_OG_SIZE,
      fonts: [
        { name: "Noto Sans", data: bold, weight: 700, style: "normal" },
        { name: "Noto Sans", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
