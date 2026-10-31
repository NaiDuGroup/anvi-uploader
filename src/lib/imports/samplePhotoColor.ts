import sharp from "sharp";

/**
 * Colour of the middle of a product photo (server only). Supplier shots show
 * the item centred on white, so the central patch is the cover itself; the
 * median ignores a strap or a logo crossing it. Null when the photo can't be read
 * or the patch is background white.
 */
export async function samplePhotoCenterColor(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const N = 60;
    const { data } = await sharp(buf).resize(N, N, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const r: number[] = [];
    const g: number[] = [];
    const b: number[] = [];
    // Central 30 % × 30 %, a little above the middle (away from a ribbon at the bottom).
    for (let y = Math.round(N * 0.3); y < Math.round(N * 0.6); y++) {
      for (let x = Math.round(N * 0.35); x < Math.round(N * 0.65); x++) {
        const i = (y * N + x) * 3;
        r.push(data[i]!);
        g.push(data[i + 1]!);
        b.push(data[i + 2]!);
      }
    }
    const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]!;
    const [R, G, B] = [med(r), med(g), med(b)];
    if (R > 250 && G > 250 && B > 250) return null;
    return `#${[R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

/**
 * Whether a product photo shows a spiral / ring binding: the band just inside
 * the item's left edge alternates ring – gap – ring all the way down, while a
 * hardcover spine is one solid edge. Null when the photo can't be read.
 */
export async function photoShowsSpiralBinding(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return spiralFromImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Ring–gap alternations along the left edge; ≥ 12 means a spiral. Exported for tests. */
export async function spiralFromImage(buf: Buffer): Promise<boolean> {
  const W = 300;
  const { data, info } = await sharp(buf).resize({ width: W }).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const H = info.height;
  const fg = (x: number, y: number) => data[y * W + x]! < 225;
  let left = W;
  let top = H;
  let bottom = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (fg(x, y)) {
        if (x < left) left = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (left >= W || bottom - top < 20) return false;
  const band = Math.max(3, Math.round(W * 0.025));
  let transitions = 0;
  let prev: boolean | null = null;
  for (let y = Math.round(top + (bottom - top) * 0.1); y < Math.round(bottom - (bottom - top) * 0.1); y++) {
    let any = false;
    for (let x = left; x < left + band; x++) if (fg(x, y)) any = true;
    if (prev != null && any !== prev) transitions++;
    prev = any;
  }
  return transitions >= 12;
}
