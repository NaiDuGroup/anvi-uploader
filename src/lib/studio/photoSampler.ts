import { layerBounds, rectsIntersect, type StudioDoc } from "./document";
import { renderPreviewCanvas } from "./exportClient";
import type { StudioRenderAssets } from "./render";
import type { StudioSurfaceSpec } from "./surfaces";

/**
 * Colour of the design under a point where a photo lies, for the text
 * contrast check (white text on a pale sky). Browser only: the design without
 * its texts and QR codes is drawn once into a small canvas (≤ 160 px, cheap on
 * phones) and averaged around the point. Null when no text sits on a photo.
 */
const SIDE_PX = 160;

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

export function studioPhotoSampler(
  doc: StudioDoc,
  specs: readonly StudioSurfaceSpec[],
  assets: StudioRenderAssets,
): ((surfaceId: string, px: number, py: number) => string | null) | null {
  if (typeof document === "undefined") return null;
  const surface = doc.surfaces[0];
  const spec: StudioSurfaceSpec | undefined = surface ? (specs.find((s) => s.id === surface.id) ?? specs[0]) : undefined;
  if (!surface || !spec) return null;
  const photos = surface.layers.filter((l) => l.kind === "image" && l.src && !l.hidden);
  const texts = surface.layers.filter((l) => l.kind === "text" && !l.hidden && l.text.trim());
  if (!texts.some((t) => photos.some((p) => rectsIntersect(layerBounds(t), layerBounds(p))))) return null;
  const bare: StudioDoc = {
    ...doc,
    surfaces: [{ ...surface, layers: surface.layers.filter((l) => l.kind !== "text" && l.kind !== "qr") }],
  };
  let data: Uint8ClampedArray;
  let w: number;
  let h: number;
  try {
    const c: HTMLCanvasElement = renderPreviewCanvas(bare, spec, assets, SIDE_PX);
    w = c.width;
    h = c.height;
    data = c.getContext("2d")!.getImageData(0, 0, w, h).data;
    c.width = 0;
    c.height = 0;
  } catch {
    return null;
  }
  const kx: number = w / spec.widthMm;
  const ky: number = h / spec.heightMm;
  return (surfaceId, px, py) => {
    if (surfaceId !== surface.id) return null;
    const cx: number = Math.round(px * kx);
    const cy: number = Math.round(py * ky);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i: number = (y * w + x) * 4;
        // A transparent pixel: nothing drawn there (the photo is still loading).
        if (data[i + 3]! < 200) continue;
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n++;
      }
    }
    return n ? `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}` : null;
  };
}
