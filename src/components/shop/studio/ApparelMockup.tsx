"use client";

import { forwardRef, useId, type ReactNode } from "react";
import type { ApparelShape, ApparelZoneId } from "@/lib/studio/apparel";
import { apparelViewBox, type ApparelPrintBox, type ApparelView } from "@/lib/studio/apparelMockup";

/**
 * Drawn garment mockups (T-shirt, polo with collar and placket, 5-panel cap)
 * in real centimetres, tinted with the garment colour and shaded (side
 * shadows, folds, seams, stitching, a little fabric grain), with each
 * transfer placed at its real size and press position (`apparelPrintBox`).
 *
 * Why drawn, not photos: the supplier photos are not tagged front / back, not
 * every colour has them, and each would need its own print-box calibration;
 * a drawing is the same for every colour, exact in scale, light and sharp on
 * any screen, and exports to the cart thumbnail without CORS trouble.
 */

export interface ApparelMockupPrint {
  zone: ApparelZoneId;
  box: ApparelPrintBox;
  /** Data URL of the transfer as printed (transparent PNG); null = not drawn (yet). */
  src: string | null;
}

type Seg = { c1: [number, number]; c2: [number, number]; to: [number, number] } | { to: [number, number] };

/** A symmetric outline from its right half (from the top of the centre line down to the bottom of it). */
function mirrored(start: [number, number], right: Seg[]): string {
  const f = (p: [number, number]) => `${p[0]} ${p[1]}`;
  const neg = (p: [number, number]): [number, number] => [-p[0], p[1]];
  let d = `M ${f(start)}`;
  for (const s of right) d += "c1" in s ? ` C ${f(s.c1)}, ${f(s.c2)}, ${f(s.to)}` : ` L ${f(s.to)}`;
  const pts: [number, number][] = [start, ...right.map((s) => s.to)];
  for (let i = right.length - 1; i >= 0; i--) {
    const s = right[i]!;
    const to = neg(pts[i]!);
    d += "c1" in s ? ` C ${f(neg(s.c2))}, ${f(neg(s.c1))}, ${f(to)}` : ` L ${f(to)}`;
  }
  return `${d} Z`;
}

/** Below-the-collar outline shared by the T-shirt and the polo (shoulder → sleeve → side → hem). */
function topBody(neckStart: [number, number], neck: Seg, sleeve: { outer: [number, number]; inner: [number, number] }): string {
  return mirrored(neckStart, [
    neck,
    // Shoulders slope down to the sleeve seam.
    { to: [22.6, 4] },
    { c1: [27.6, 6.6], c2: [33, 10.6], to: sleeve.outer },
    { to: sleeve.inner },
    { c1: [sleeve.inner[0] - 1.2, sleeve.inner[1] - 1.8], c2: [27.3, 24.6], to: [27, 22.6] },
    // A slight waist, then the hem with a soft curve.
    { c1: [26.5, 38], c2: [27.2, 58], to: [27.8, 73] },
    { c1: [18, 74.6], c2: [8, 74.9], to: [0, 74.9] },
  ]);
}

const TEE_SLEEVE = { outer: [38.2, 16.6] as [number, number], inner: [29.4, 29.6] as [number, number] };
const POLO_SLEEVE = { outer: [36.6, 15.2] as [number, number], inner: [29, 27.6] as [number, number] };

const SHAPES = {
  teeFront: topBody([0, 9], { c1: [5.2, 9], c2: [8.8, 5], to: [9.5, 0] }, TEE_SLEEVE),
  teeBack: topBody([0, 2.5], { c1: [5, 2.5], c2: [8.6, 1.4], to: [9.5, 0] }, TEE_SLEEVE),
  poloFront: topBody([0, 7], { c1: [5, 7], c2: [8.8, 4], to: [9.5, 0] }, POLO_SLEEVE),
  poloBack: topBody([0, 3.2], { c1: [5, 3.2], c2: [8.6, 1.8], to: [9.5, 0] }, POLO_SLEEVE),
  // Sleeveless bodysuit (y = 0 at the neckline's bottom): straps, armholes, the snap crotch.
  body: mirrored([0, 0], [
    { c1: [3, 0], c2: [5.2, -1.8], to: [5.6, -4.2] },
    { to: [9, -4.2] },
    { c1: [9.2, 0.5], c2: [10.4, 4.5], to: [12.3, 6] },
    { c1: [12.6, 14], c2: [12.6, 22], to: [12, 27] },
    { c1: [11, 33], c2: [7, 36.5], to: [3.2, 38.6] },
    { to: [0, 38.6] },
  ]),
};

function hexRgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "ffffff";
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance 0…1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mix with black (k < 0) or white (k > 0). */
function shade(hex: string, k: number): string {
  const [r, g, b] = hexRgb(hex);
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const m = (c: number) => Math.round(c + (t - c) * a);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export const ApparelMockup = forwardRef<SVGSVGElement, {
  shape: ApparelShape;
  view: ApparelView;
  color: string;
  prints: readonly ApparelMockupPrint[];
  /** Dashed outline of a zone's format on the garment (the editor shows where the transfer lands). */
  outline?: ApparelPrintBox | null;
  className?: string;
  label?: string;
}>(function ApparelMockup({ shape, view, color, prints, outline = null, className = "", label }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n: string) => `am${uid}${n}`;
  const [vx, vy, vw, vh] = apparelViewBox(shape);
  const dark: boolean = luminance(color) < 0.12;
  const mid: boolean = !dark && luminance(color) < 0.45;
  // Shadows read on light cloth; dark cloth shows its form through highlights.
  const shadowOp: number = dark ? 0.45 : mid ? 0.32 : 0.2;
  const lightOp: number = dark ? 0.1 : 0.16;
  const stitch: string = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";
  const line: string = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.2)";
  const mine = prints.filter((p) => p.box.view === view && p.src);
  const printImages = mine.map((p) => (
    <image key={p.zone} href={p.src!} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} preserveAspectRatio="none" data-apparel-print={p.zone} />
  ));
  const outlineRect =
    outline && outline.view === view ? (
      <rect x={outline.x} y={outline.y} width={outline.w} height={outline.h} fill="none" stroke={dark ? "rgba(255,255,255,0.7)" : "rgba(20,33,61,0.55)"} strokeWidth={0.22} strokeDasharray="0.8 0.5" data-apparel-outline />
    ) : null;

  const defs = (
    <defs>
      {/* Across the whole width (sleeves too): darker under the arms and at the sleeve tips, light in the middle. */}
      <linearGradient id={id("side")} gradientUnits="userSpaceOnUse" x1="-44" x2="44" y1="0" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity={shadowOp * 0.55} />
        <stop offset="0.12" stopColor="#000" stopOpacity={shadowOp * 0.12} />
        <stop offset="0.185" stopColor="#000" stopOpacity={shadowOp * 0.9} />
        <stop offset="0.3" stopColor="#000" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fff" stopOpacity={lightOp * 0.6} />
        <stop offset="0.7" stopColor="#000" stopOpacity="0" />
        <stop offset="0.815" stopColor="#000" stopOpacity={shadowOp * 0.9} />
        <stop offset="0.88" stopColor="#000" stopOpacity={shadowOp * 0.12} />
        <stop offset="1" stopColor="#000" stopOpacity={shadowOp * 0.55} />
      </linearGradient>
      <linearGradient id={id("down")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity={lightOp * 0.7} />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity={shadowOp * 0.55} />
      </linearGradient>
      <radialGradient id={id("dome")} cx="0.38" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#fff" stopOpacity={lightOp * 1.6} />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity={shadowOp * 1.1} />
      </radialGradient>
      <filter id={id("blur")} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.1" />
      </filter>
      <radialGradient id={id("shadow")}>
        <stop offset="0" stopColor="#14213d" stopOpacity="0.26" />
        <stop offset="1" stopColor="#14213d" stopOpacity="0" />
      </radialGradient>
      <filter id={id("soft")} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.6" />
      </filter>
      <filter id={id("drop")} filterUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
        <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#14213d" floodOpacity="0.18" />
      </filter>
      <filter id={id("grain")} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="3" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
      </filter>
    </defs>
  );

  let body: ReactNode;
  if (shape === "cap") {
    // A 5-panel baseball cap, straight from the front: a tall rounded crown (one wide front panel,
    // the side panels' seams, eyelets, the button), the peak below it curving down and back at its
    // ends (narrower than the crown, its underside showing along the edge), a soft shadow under it.
    const crown = "M -9.9 12 C -10.5 5 -6.6 0.5 0 0.35 C 6.6 0.5 10.5 5 9.9 12 C 9.6 12.6 9 12.8 8.4 12.7 L -8.4 12.7 C -9 12.8 -9.6 12.6 -9.9 12 Z";
    const peak = "M -8.7 11.3 C -5 12.6 5 12.6 8.7 11.3 C 10 11.9 9.6 15.4 6.3 16.7 C 4.3 17.4 2 17.6 0 17.6 C -2 17.6 -4.3 17.4 -6.3 16.7 C -9.6 15.4 -10 11.9 -8.7 11.3 Z";
    const underside = "M 8.7 11.3 C 10 11.9 9.6 15.4 6.3 16.7 C 4.3 17.4 2 17.6 0 17.6 C -2 17.6 -4.3 17.4 -6.3 16.7 C -9.6 15.4 -10 11.9 -8.7 11.3 C -9.1 12.4 -8.3 15 -5.9 15.9 C -3.9 16.5 -2 16.65 0 16.65 C 2 16.65 3.9 16.5 5.9 15.9 C 8.3 15 9.1 12.4 8.7 11.3 Z";
    body = (
      <g filter={`url(#${id("drop")})`}>
        <ellipse cx="0" cy="18" rx="10" ry="1.3" fill={`url(#${id("shadow")})`} />
        <clipPath id={id("clip")}>
          <path d={crown} />
        </clipPath>
        <path d={crown} fill={color} />
        <g clipPath={`url(#${id("clip")})`}>
          {printImages}
          <rect x="-11" y="0" width="22" height="14" fill={`url(#${id("dome")})`} style={{ mixBlendMode: "multiply" }} />
          <rect x="-11" y="0" width="22" height="14" filter={`url(#${id("grain")})`} opacity="0.06" style={{ mixBlendMode: "multiply" }} />
          {/* Side panels darker (they turn away), their seams and the front panel's. */}
          <path d="M -10.5 13 L -10.5 0 L -8.6 0 C -9 4 -9.3 8 -9.2 13 Z M 10.5 13 L 10.5 0 L 8.6 0 C 9 4 9.3 8 9.2 13 Z" fill="#000" opacity={shadowOp * 0.55} />
          <path d="M -6.6 11.8 C -6.4 6.4 -4 2 -0.7 0.45 M 6.6 11.8 C 6.4 6.4 4 2 0.7 0.45" fill="none" stroke={line} strokeWidth="0.16" />
          <path d="M -6.1 11.9 C -5.9 6.6 -3.7 2.3 -0.5 0.8 M 6.1 11.9 C 5.9 6.6 3.7 2.3 0.5 0.8" fill="none" stroke={stitch} strokeWidth="0.07" strokeDasharray="0.3 0.22" />
          <path d="M -9.3 12.6 C -9.4 7.6 -7.4 3.2 -1.2 0.5 M 9.3 12.6 C 9.4 7.6 7.4 3.2 1.2 0.5" fill="none" stroke={line} strokeWidth="0.12" opacity="0.7" />
          <circle cx="-7.9" cy="4.6" r="0.34" fill={shade(color, -0.35)} stroke={line} strokeWidth="0.08" />
          <circle cx="7.9" cy="4.6" r="0.34" fill={shade(color, -0.35)} stroke={line} strokeWidth="0.08" />
        </g>
        <path d={crown} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.12" />
        <ellipse cx="0" cy="0.45" rx="1.05" ry="0.45" fill={shade(color, dark ? 0.12 : -0.14)} stroke="rgba(0,0,0,0.3)" strokeWidth="0.08" />
        {outlineRect}
        {/* The peak: its top lit, a seam row of stitching, the darker underside along the curved edge. */}
        <path d={peak} fill={shade(color, dark ? 0.06 : -0.04)} />
        <path d={peak} fill={`url(#${id("down")})`} style={{ mixBlendMode: "multiply" }} />
        <path d="M -8.1 12.1 C -4.8 13.3 4.8 13.3 8.1 12.1 M -7.7 12.9 C -4.6 14.1 4.6 14.1 7.7 12.9 M -7.1 13.7 C -4.4 14.8 4.4 14.8 7.1 13.7" fill="none" stroke={stitch} strokeWidth="0.07" strokeDasharray="0.3 0.22" />
        <path d={underside} fill="#000" opacity={dark ? 0.45 : 0.3} />
        <path d={peak} fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth="0.12" />
        <path d="M -8.7 11.3 C -5 12.6 5 12.6 8.7 11.3" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.14" />
      </g>
    );
  } else if (shape === "body") {
    body = (
      <g filter={`url(#${id("drop")})`}>
        <clipPath id={id("clip")}>
          <path d={SHAPES.body} />
        </clipPath>
        <path d={SHAPES.body} fill={color} />
        <g clipPath={`url(#${id("clip")})`}>
          {printImages}
          <rect x="-17" y="-5" width="34" height="47" fill={`url(#${id("down")})`} style={{ mixBlendMode: "multiply" }} opacity="0.8" />
          <rect x="-17" y="-5" width="34" height="47" filter={`url(#${id("grain")})`} opacity={dark ? 0.08 : 0.05} style={{ mixBlendMode: dark ? "screen" : "multiply" }} />
        </g>
        <path d={SHAPES.body} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.16" />
        <path d="M -5.6 -4.2 C -5.2 -1.8 -3 0 0 0 C 3 0 5.2 -1.8 5.6 -4.2" fill="none" stroke={stitch} strokeWidth="0.08" strokeDasharray="0.3 0.22" />
        {outlineRect}
      </g>
    );
  } else {
    const polo: boolean = shape === "polo";
    const outlinePath: string = view === "front" ? (polo ? SHAPES.poloFront : SHAPES.teeFront) : polo ? SHAPES.poloBack : SHAPES.teeBack;
    const sleeve = polo ? POLO_SLEEVE : TEE_SLEEVE;
    // Inside of the back seen through the front neck (T-shirt).
    const insideBack = "M -9.5 0 C -8.6 1.4 -5 2.5 0 2.5 C 5 2.5 8.6 1.4 9.5 0 C 8.8 5 5.2 9 0 9 C -5.2 9 -8.8 5 -9.5 0 Z";
    const frontNeck = "M -9.5 0 C -8.8 5 -5.2 9 0 9 C 5.2 9 8.8 5 9.5 0";
    const backNeck = "M -9.5 0 C -8.6 1.4 -5 2.5 0 2.5 C 5 2.5 8.6 1.4 9.5 0";
    // Sleeve hem / cuff: a band along the opening.
    const [ox, oy] = sleeve.outer;
    const [ix, iy] = sleeve.inner;
    const ux = (ix - ox) / Math.hypot(ix - ox, iy - oy);
    const uy = (iy - oy) / Math.hypot(ix - ox, iy - oy);
    // Inward normal (towards the shoulder).
    const nx = -uy;
    const ny = ux;
    const band = polo ? 2.2 : 1.8;
    const hemLine = (sx: number) =>
      `M ${sx * (ox + nx * band)} ${oy + ny * band} L ${sx * (ix + nx * band)} ${iy + ny * band}`;
    body = (
      <g filter={`url(#${id("drop")})`}>
        <clipPath id={id("clip")}>
          <path d={outlinePath} />
        </clipPath>
        {view === "front" && !polo ? <path d={insideBack} fill={shade(color, dark ? 0.14 : -0.22)} /> : null}
        <path d={outlinePath} fill={color} />
        <g clipPath={`url(#${id("clip")})`}>
          {printImages}
          {/* Cloth: side shadows, light from above, folds, grain. */}
          <rect x="-44" y="-4" width="88" height="82" fill={`url(#${id("side")})`} style={{ mixBlendMode: dark ? "screen" : "multiply" }} />
          <rect x="-44" y="-4" width="88" height="82" fill={`url(#${id("down")})`} style={{ mixBlendMode: "multiply" }} opacity="0.8" />
          <g filter={`url(#${id("blur")})`} opacity={dark ? 0.5 : 0.85} style={{ mixBlendMode: "multiply" }}>
            <path d="M 19 27 C 18 40 20.5 55 19.5 72 M -19 27 C -18 40 -20.5 55 -19.5 72" fill="none" stroke="#000" strokeOpacity={shadowOp * 0.22} strokeWidth="3.4" />
            <path d="M 24.5 9 C 25.8 14 26.2 18 26.8 22.6 M -24.5 9 C -25.8 14 -26.2 18 -26.8 22.6" fill="none" stroke="#000" strokeOpacity={shadowOp * 0.6} strokeWidth="1.4" />
            <path d="M 6 60 C 9 64 13 66 17 70 M -8 62 C -11 66 -14 68 -18 71" fill="none" stroke="#000" strokeOpacity={shadowOp * 0.25} strokeWidth="1.6" />
          </g>
          <g filter={`url(#${id("soft")})`} style={{ mixBlendMode: "screen" }}>
            <path d="M 13 26 C 12.5 40 13.5 54 13 68 M -13 26 C -12.5 40 -13.5 54 -13 68" fill="none" stroke="#fff" strokeOpacity={lightOp * (dark ? 0.45 : 0.7)} strokeWidth="7" />
            <path d="M -16 4 C -8 6 8 6 16 4" fill="none" stroke="#fff" strokeOpacity={lightOp * 0.6} strokeWidth="4" />
          </g>
          <rect x="-44" y="-4" width="88" height="82" filter={`url(#${id("grain")})`} opacity={dark ? 0.08 : 0.05} style={{ mixBlendMode: dark ? "screen" : "multiply" }} />
          {/* Seams and stitching. */}
          <path d="M 22.6 4 C 24.8 12 26 18 27 22.6 M -22.6 4 C -24.8 12 -26 18 -27 22.6" fill="none" stroke={line} strokeWidth="0.16" />
          <path d={`${hemLine(1)} ${hemLine(-1)}`} fill="none" stroke={stitch} strokeWidth="0.09" strokeDasharray="0.35 0.25" />
          <path d="M -27.7 71.2 C -18 72.8 -8 73.1 0 73.1 C 8 73.1 18 72.8 27.7 71.2" fill="none" stroke={stitch} strokeWidth="0.09" strokeDasharray="0.35 0.25" />
          {polo ? (
            <>
              {/* Rib cuffs and side vents. */}
              <path d={`${hemLine(1)} ${hemLine(-1)}`} fill="none" stroke={line} strokeWidth="0.14" />
              <path d="M 27.9 71 L 27.9 74 M -27.9 71 L -27.9 74" fill="none" stroke={line} strokeWidth="0.2" />
            </>
          ) : view === "front" ? (
            <path d={frontNeck} fill="none" stroke={shade(color, dark ? 0.1 : -0.07)} strokeWidth="3.2" />
          ) : (
            <path d={backNeck} fill="none" stroke={shade(color, dark ? 0.06 : -0.07)} strokeWidth="3" />
          )}
          {!polo ? (
            <path d={view === "front" ? "M -9.2 1.3 C -8.4 5.9 -5 10.4 0 10.4 C 5 10.4 8.4 5.9 9.2 1.3" : "M -9.3 1.3 C -8.4 2.7 -5 3.9 0 3.9 C 5 3.9 8.4 2.7 9.3 1.3"} fill="none" stroke={stitch} strokeWidth="0.09" strokeDasharray="0.35 0.25" />
          ) : null}
        </g>
        <path d={outlinePath} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.2" />
        {polo && view === "front" ? <PoloCollarFront color={color} dark={dark} line={line} stitch={stitch} /> : null}
        {polo && view === "back" ? (
          <path d="M -10.2 0.5 C -8 -1 8 -1 10.2 0.5 L 9.6 3.9 C 6 2.9 -6 2.9 -9.6 3.9 Z" fill={shade(color, dark ? 0.06 : -0.05)} stroke="rgba(0,0,0,0.3)" strokeWidth="0.14" />
        ) : null}
        {outlineRect}
      </g>
    );
  }

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={className}
      role="img"
      aria-label={label}
      data-apparel-mockup={`${shape}:${view}`}
    >
      {defs}
      {body}
    </svg>
  );
});

/** Polo collar lying open over the shoulders, the placket with three buttons. */
function PoloCollarFront({ color, dark, line, stitch }: { color: string; dark: boolean; line: string; stitch: string }) {
  const collar = shade(color, dark ? 0.12 : -0.03);
  const wing = (s: 1 | -1) => {
    const x = (v: number) => v * s;
    return `M ${x(0)} -0.9 C ${x(4)} -1 ${x(8.6)} -0.7 ${x(10.6)} 0.5 C ${x(9.6)} 4.2 ${x(6.6)} 8.2 ${x(3.5)} 10.9 L ${x(1.75)} 7.6 C ${x(3)} 5.6 ${x(3.9)} 3.6 ${x(3.8)} 2.2 C ${x(2.6)} 2.5 ${x(1.3)} 2.6 ${x(0)} 2.6 Z`;
  };
  return (
    <g data-apparel-collar>
      <defs>
        <filter id="apparelCollarShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.45" />
        </filter>
        <pattern id="apparelRib" width="0.32" height="0.32" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <rect width="0.14" height="0.32" fill={dark ? "#fff" : "#000"} opacity="0.18" />
        </pattern>
      </defs>
      {/* Inside of the back between the collar points. */}
      <path d="M -3.8 2.2 C -2.6 2.5 2.6 2.5 3.8 2.2 L 1.75 7.6 L -1.75 7.6 Z" fill={shade(color, dark ? 0.1 : -0.24)} />
      <rect x="-1.75" y="7.4" width="3.5" height="10.4" fill={shade(color, dark ? 0.03 : -0.02)} stroke={line} strokeWidth="0.14" />
      <path d="M -1.35 7.6 L -1.35 17.4 M 1.35 7.6 L 1.35 17.4 M -1.75 17.4 L 1.75 17.4" fill="none" stroke={stitch} strokeWidth="0.08" strokeDasharray="0.3 0.22" />
      {[9.9, 12.8, 15.7].map((y) => (
        <g key={y}>
          <circle cx="0" cy={y} r="0.55" fill={shade(color, dark ? 0.2 : -0.18)} stroke="rgba(0,0,0,0.35)" strokeWidth="0.07" />
          <circle cx="-0.17" cy={y} r="0.07" fill="rgba(0,0,0,0.45)" />
          <circle cx="0.17" cy={y} r="0.07" fill="rgba(0,0,0,0.45)" />
        </g>
      ))}
      {/* The collar's shadow on the chest. */}
      <g filter="url(#apparelCollarShadow)" opacity={dark ? 0.9 : 0.55}>
        {([1, -1] as const).map((s) => (
          <path key={s} d={wing(s)} fill="#000" transform="translate(0 0.45)" />
        ))}
      </g>
      {([1, -1] as const).map((s) => (
        <g key={s}>
          <path d={wing(s)} fill={collar} stroke="rgba(0,0,0,0.4)" strokeWidth="0.16" />
          {/* Rib knit of the collar. */}
          <path d={wing(s)} fill="url(#apparelRib)" opacity={dark ? 0.5 : 0.35} />
          <path d={wing(s)} fill="none" stroke={stitch} strokeWidth="0.06" strokeDasharray="0.25 0.2" transform={`translate(${-0.25 * s} 0.2)`} opacity="0.7" />
        </g>
      ))}
    </g>
  );
}

/**
 * The mockup as a JPEG data URL (cart image, «added» screen): the live SVG
 * (transfers inline as data URLs) drawn on white, long side `maxSide`.
 */
export async function mockupJpeg(svg: SVGSVGElement, maxSide = 240, qualities: readonly number[] = [0.8, 0.68, 0.55]): Promise<string | null> {
  try {
    const vb = svg.viewBox.baseVal;
    const k: number = maxSide / Math.max(vb.width, vb.height);
    const w: number = Math.max(1, Math.round(vb.width * k));
    const h: number = Math.max(1, Math.round(vb.height * k));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    clone.querySelectorAll("[data-apparel-outline]").forEach((n) => n.remove());
    const xml: string = new XMLSerializer().serializeToString(clone);
    const url: string = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("mockup image"));
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#f4f5f7";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of qualities) {
        const out: string = c.toDataURL("image/jpeg", q);
        if (out.length <= 75_000) return out;
      }
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
