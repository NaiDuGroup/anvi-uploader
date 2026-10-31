import * as THREE from "three";

/**
 * Tileable normal maps for product materials, computed in JS (no download, no
 * DOM — also works in tests): leather pebble grain, cardboard fibres, and a
 * fine ceramic speckle for matte glaze.
 */

export type GrainKind = "leather" | "cardboard" | "speckle";

/** Real size of one texture tile (cm). */
export const GRAIN_TILE_CM: Record<GrainKind, number> = { leather: 2.5, cardboard: 4, speckle: 1.2 };

const SIZE = 256;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on a grid of `period` cells, wrapping at the tile edge. */
function valueNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i: number, j: number) => hash(((x0 + i) % px + px) % px, ((y0 + j) % py + py) % py, seed);
  const a = w(0, 0) + (w(1, 0) - w(0, 0)) * sx;
  const b = w(0, 1) + (w(1, 1) - w(0, 1)) * sx;
  return a + (b - a) * sy;
}

/** Cellular (Worley) F2 − F1: low along the creases between pebbles. */
function worleyEdge(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = ((gx % cells) + cells) % cells;
      const wy = ((gy % cells) + cells) % cells;
      const px = gx + hash(wx, wy, seed);
      const py = gy + hash(wx, wy, seed + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  }
  return f2 - f1;
}

function heightAt(kind: GrainKind, u: number, v: number): number {
  switch (kind) {
    case "leather": {
      // Rounded pebbles with soft creases, plus a little irregularity.
      const e = Math.min(1, worleyEdge(u, v, 18, 3) / 0.35);
      return e * e * (3 - 2 * e) * 0.8 + valueNoise(u, v, 40, 40, 5) * 0.2;
    }
    case "cardboard":
      // Fibres: stretched noise along one direction, plus fine grit.
      return valueNoise(u, v, 6, 90, 11) * 0.55 + valueNoise(u, v, 64, 64, 13) * 0.45;
    case "speckle":
      return valueNoise(u, v, 48, 48, 17) * 0.6 + valueNoise(u, v, 128, 128, 19) * 0.4;
  }
}

const cache = new Map<GrainKind, THREE.DataTexture>();

function baseNormalTexture(kind: GrainKind): THREE.DataTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = heightAt(kind, x / SIZE, y / SIZE);
  }
  const data = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => h[(((y + SIZE) % SIZE) * SIZE) + ((x + SIZE) % SIZE)]!;
  const strength = 3;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cache.set(kind, tex);
  return tex;
}

/**
 * A normal map of `kind` tiled `repeatU × repeatV` times over the UV range
 * (shares the generated image; dispose the returned clone when done).
 */
export function grainNormalMap(kind: GrainKind, repeatU: number, repeatV: number): THREE.Texture {
  const t = baseNormalTexture(kind).clone();
  t.repeat.set(repeatU, repeatV);
  t.needsUpdate = true;
  return t;
}
