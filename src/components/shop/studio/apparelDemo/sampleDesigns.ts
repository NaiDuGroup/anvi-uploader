/**
 * Sample artwork for the apparel visual prototype: drawn with plain Canvas 2D
 * calls, so the same code paints in the browser and in Node (`@napi-rs/canvas`).
 * Transparent background, sized by the caller (the aspect of the print box).
 */

/** The subset of Canvas 2D used here (browser and `@napi-rs/canvas` both have it). */
type Ctx = CanvasRenderingContext2D;

export type SampleDesign = "sunset" | "backText" | "badge" | "capLockup" | "babySun";

const SUN = ["#FFD23F", "#FF9F1C", "#FF5E5B", "#D7266D", "#7B2CBF"];

function sunsetDisc(ctx: Ctx, cx: number, cy: number, r: number, stripes = true): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  SUN.forEach((c, i) => g.addColorStop(i / (SUN.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  if (stripes) {
    // Retro cut-outs in the lower half, widening downwards.
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 6; i++) {
      const y: number = cy + r * (0.05 + i * 0.17);
      const hh: number = r * (0.025 + i * 0.016);
      ctx.fillRect(cx - r, y, 2 * r, hh);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

function mountains(ctx: Ctx, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.18, y + h * 0.35);
  ctx.lineTo(x + w * 0.3, y + h * 0.6);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.68, y + h * 0.5);
  ctx.lineTo(x + w * 0.8, y + h * 0.3);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  // Snow caps.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.56, y + h * 0.17);
  ctx.lineTo(x + w * 0.5, y + h * 0.12);
  ctx.lineTo(x + w * 0.45, y + h * 0.2);
  ctx.lineTo(x + w * 0.42, y + h * 0.16);
  ctx.closePath();
  ctx.fill();
}

/** Sets `ctx.font` at `px`, shrunk so `text` (with `spacing` per gap) is at most `maxW` wide. */
function fit(ctx: Ctx, text: string, weight: number, px: number, maxW: number, font: string, spacing = 0): void {
  ctx.font = `${weight} ${Math.round(px)}px ${font}`;
  const w: number = ctx.measureText(text).width + spacing * Math.max(0, [...text].length - 1);
  if (w > maxW) ctx.font = `${weight} ${Math.floor(px * (maxW / w))}px ${font}`;
}

function spaced(ctx: Ctx, text: string, cx: number, y: number, spacing: number): void {
  const chars: string[] = [...text];
  const widths: number[] = chars.map((c) => ctx.measureText(c).width);
  const total: number = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x: number = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i]! + spacing;
  });
}

/**
 * Paints a sample design over the whole `w × h` canvas. `ink` = the main text
 * colour (white on dark garments, navy on light ones); `font` = a CSS family.
 */
export function drawSampleDesign(ctx: Ctx, kind: SampleDesign, w: number, h: number, ink: string, font: string): void {
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";
  const accent = "#FF5E5B";
  if (kind === "sunset") {
    const r: number = w * 0.4;
    const cy: number = h * 0.33;
    sunsetDisc(ctx, w / 2, cy, r);
    mountains(ctx, w * 0.06, cy + r * 0.15, w * 0.88, r * 0.85, "#1B998B");
    ctx.fillStyle = ink;
    fit(ctx, "ANVI", 900, w * 0.33, w * 0.9, font);
    ctx.textAlign = "center";
    ctx.fillText("ANVI", w / 2, h * 0.86);
    fit(ctx, "PRINT STUDIO · CHIȘINĂU", 700, w * 0.06, w * 0.86, font, w * 0.008);
    ctx.fillStyle = accent;
    spaced(ctx, "PRINT STUDIO · CHIȘINĂU", w / 2, h * 0.955, w * 0.008);
    return;
  }
  if (kind === "backText") {
    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    fit(ctx, "EST. 2015 — CHIȘINĂU", 700, h * 0.08, w * 0.8, font, w * 0.015);
    spaced(ctx, "EST. 2015 — CHIȘINĂU", w / 2, h * 0.12, w * 0.015);
    fit(ctx, "ANVI", 900, h * 0.4, w * 0.94, font);
    ctx.lineWidth = w * 0.008;
    ctx.strokeStyle = ink;
    ctx.textAlign = "center";
    ctx.strokeText("ANVI", w / 2, h * 0.5);
    fit(ctx, "CREW", 900, h * 0.4, w * 0.94, font);
    ctx.fillStyle = ink;
    ctx.fillText("CREW", w / 2, h * 0.86);
    fit(ctx, "PRINT IT LOUD", 700, h * 0.07, w * 0.7, font, w * 0.03);
    ctx.fillStyle = "#FFD23F";
    spaced(ctx, "PRINT IT LOUD", w / 2, h * 0.98, w * 0.03);
    return;
  }
  if (kind === "badge") {
    const r: number = Math.min(w, h) * 0.48;
    const cx: number = w / 2;
    const cy: number = h / 2;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2, true);
    ctx.fill();
    sunsetDisc(ctx, cx, cy - r * 0.12, r * 0.55);
    ctx.fillStyle = ink;
    fit(ctx, "ANVI", 900, r * 0.42, r * 1.3, font);
    ctx.textAlign = "center";
    ctx.fillText("ANVI", cx, cy + r * 0.68);
    return;
  }
  if (kind === "capLockup") {
    const r: number = h * 0.42;
    sunsetDisc(ctx, h * 0.5, h * 0.5, r);
    ctx.fillStyle = ink;
    fit(ctx, "ANVI", 900, h * 0.62, w - h * 1.08, font);
    ctx.textAlign = "left";
    ctx.fillText("ANVI", h * 1.02, h * 0.72);
    return;
  }
  // babySun: a smiling sun + «mic & vesel».
  const cx: number = w / 2;
  const cy: number = h * 0.4;
  const r: number = w * 0.24;
  ctx.strokeStyle = "#FF9F1C";
  ctx.lineCap = "round";
  ctx.lineWidth = w * 0.035;
  for (let i = 0; i < 12; i++) {
    const a: number = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25);
    ctx.lineTo(cx + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 1.55);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#FFE680");
  g.addColorStop(1, "#FFB627");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3D2C2E";
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.12, r * 0.09, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.35, cy - r * 0.12, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3D2C2E";
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, r * 0.42, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "#FF8FA3";
  ctx.beginPath();
  ctx.arc(cx - r * 0.58, cy + r * 0.2, r * 0.13, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.58, cy + r * 0.2, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  fit(ctx, "mic & vesel", 800, w * 0.15, w * 0.95, font);
  ctx.textAlign = "center";
  ctx.fillText("mic & vesel", cx, h * 0.93);
}
