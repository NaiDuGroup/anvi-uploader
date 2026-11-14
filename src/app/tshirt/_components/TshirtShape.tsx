"use client";

import { garmentCm, type TshirtSide } from "@/lib/tshirt/tshirtRules";

/**
 * Flat t-shirt drawing for the live preview (stand-in until real photos).
 * Scale: 5 view units per cm. The shirt is drawn at the real size of the
 * chosen t-shirt size (Roly chart), around a print area that stays the same
 * size — so the client sees how big the print is on XS vs XXXL.
 * In preview mode a mannequin wears it: white for dark shirts, black for light ones.
 */
export const SHIRT_VIEW = { w: 600, h: 590 } as const;
export const SHIRT_UNITS_PER_CM = 5;
/** Collar top centre (view units) — origin of the design coordinates. */
export const SHIRT_COLLAR = { x: 300, y: 135 } as const;
const COLLAR = SHIRT_COLLAR;
/** Top of the print area below the collar (view units). */
export const SHIRT_PRINT_TOP: Record<"front" | "back", number> = { front: COLLAR.y + 62, back: COLLAR.y + 44 };

/** Base drawing: chest 52 cm (260 units), length ≈ 75 cm, collar top at (240, 30). */
/** Base drawing: chest 52 cm (260 units); the lowest point of the curved hem (y 407) is the length. */
const BASE = { chestCm: 52, lengthCm: 75.4, x: 240, y: 30 };
const BODY = "M125 42 L195 30 C210 72 270 72 285 30 L355 42 L452 118 L410 172 L370 146 L372 402 Q240 412 108 402 L110 146 L70 172 L28 118 Z";
const BODY_BACK = "M125 42 L195 30 C212 46 268 46 285 30 L355 42 L452 118 L410 172 L370 146 L372 402 Q240 412 108 402 L110 146 L70 172 L28 118 Z";

/** Perceived lightness 0–255. */
export function lightness(hex: string | null): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return 255;
  const n = parseInt(m[1]!, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

export type ShirtDrawOptions = {
  side: TshirtSide;
  color: string;
  /** T-shirt size the drawing is scaled to. */
  size: string | null;
  /** Show the mannequin wearing the shirt (preview). */
  mannequin: boolean;
};

/** SVG markup of the shirt (also drawn into the mockup PNG). */
export function shirtSvgMarkup({ side, color, size, mannequin }: ShirtDrawOptions): string {
  const light = lightness(color) > 140;
  const stroke = light ? "#c9c9c9" : "rgba(255,255,255,0.18)";
  const shade = light ? "0.10" : "0.28";
  const g = garmentCm(size);
  const sx = g.chest / BASE.chestCm;
  const sy = g.length / BASE.lengthCm;
  const body = side === "front" ? BODY : BODY_BACK;
  const fit = `translate(${COLLAR.x} ${COLLAR.y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-BASE.x} ${-BASE.y})`;
  const collar =
    side === "front"
      ? '<path d="M195 30 C210 72 270 72 285 30" fill="none" stroke-width="7" stroke="rgba(0,0,0,0.12)"/>'
      : '<path d="M195 30 C212 46 268 46 285 30" fill="none" stroke-width="6" stroke="rgba(0,0,0,0.12)"/>';

  // Mannequin: white for a dark shirt, black for a white one.
  const skin = light ? "#2b2b2b" : "#ededed";
  const skinEdge = light ? "#1a1a1a" : "#cfcfcf";
  const skinShade = light ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const arms = mannequin
    ? `<g transform="${fit}" stroke-linecap="round">
<line x1="100" y1="78" x2="12" y2="212" stroke="${skinEdge}" stroke-width="40"/>
<line x1="100" y1="78" x2="12" y2="212" stroke="${skin}" stroke-width="37"/>
<line x1="380" y1="78" x2="468" y2="212" stroke="${skinEdge}" stroke-width="40"/>
<line x1="380" y1="78" x2="468" y2="212" stroke="${skin}" stroke-width="37"/>
<path d="M120 392 L118 470 Q240 482 362 470 L360 392 Z" fill="${skin}" stroke="${skinEdge}" stroke-width="1.5"/>
</g>`
    : "";
  const head = mannequin
    ? `<g>
<rect x="${COLLAR.x - 30}" y="${COLLAR.y - 48}" width="60" height="70" rx="22" fill="${skin}" stroke="${skinEdge}" stroke-width="1.5"/>
<ellipse cx="${COLLAR.x}" cy="${COLLAR.y - 72}" rx="40" ry="50" fill="${skin}" stroke="${skinEdge}" stroke-width="1.5"/>
<ellipse cx="${COLLAR.x - 12}" cy="${COLLAR.y - 86}" rx="18" ry="24" fill="${skinShade}"/>
</g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHIRT_VIEW.w} ${SHIRT_VIEW.h}">
<defs>
<linearGradient id="fold" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#000" stop-opacity="${shade}"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/>
<stop offset="0.82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${shade}"/>
</linearGradient>
<linearGradient id="light" x1="0" x2="0" y1="0" y2="1">
<stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/>
</linearGradient>
</defs>
${arms}
${head}
<g transform="${fit}">
<path d="${body}" fill="${color}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
<path d="${body}" fill="url(#fold)"/>
<path d="${body}" fill="url(#light)"/>
<path d="M110 146 L125 42 M370 146 L355 42" stroke="rgba(0,0,0,0.08)" stroke-width="2" fill="none"/>
${collar}
</g>
</svg>`;
}

export function TshirtShape({ className, ...opts }: ShirtDrawOptions & { className?: string }) {
  return (
    <div
      className={className}
      aria-hidden
      // Static markup built above from a fixed template + a validated hex colour.
      dangerouslySetInnerHTML={{ __html: shirtSvgMarkup(opts) }}
    />
  );
}
