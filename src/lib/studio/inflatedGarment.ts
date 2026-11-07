/**
 * "Inflated photo" 3D garment (prototype): the garment's cut-out from the
 * supplier's front photo is turned into a closed, pillow-shaped mesh — front
 * half textured with the front photo, back half with the back photo — so the
 * real (photographed) garment can be turned around with the print on it.
 * No 3D model to license or calibrate: the shape comes from the photo mask.
 * Pure.
 */

export interface InflatedMesh {
  /** xyz per vertex: front vertices first, then the back copies. */
  positions: Float32Array;
  /** uv per vertex: front vertices map the front photo, back vertices the back photo. */
  uvs: Float32Array;
  /** 0 = front material, 1 = back material: `indices` [0, frontCount) front, rest back. */
  indices: Uint32Array;
  frontIndexCount: number;
  /** Size of the shape in scene units (width = 1). */
  height: number;
}

/** Chamfer (3-4) distance to the nearest outside cell, in cells. */
function distanceInside(mask: Uint8Array, n: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= n || y >= n ? 0 : d[y * n + x]!);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i: number = y * n + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = n - 1; y >= 0; y--)
    for (let x = n - 1; x >= 0; x--) {
      const i: number = y * n + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

function rowExtents(mask: Uint8Array, n: number): Array<[number, number] | null> {
  const out: Array<[number, number] | null> = [];
  for (let y = 0; y < n; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < n; x++)
      if (mask[y * n + x]) {
        if (l < 0) l = x;
        r = x;
      }
    out.push(l < 0 ? null : [l, r]);
  }
  return out;
}

/**
 * `front` / `back`: n × n garment masks (1 inside) of the front and back
 * photos (square photos, same framing). `thickness`: half-depth at the
 * thickest point, share of the width (a T-shirt ~0.09, a cap ~0.25);
 * `round`: how far in (share of n) the pillow edge rounds off.
 */
export function buildInflatedGarment(front: Uint8Array, back: Uint8Array, n: number, opts: { thickness?: number; round?: number } = {}): InflatedMesh {
  const thickness: number = opts.thickness ?? 0.09;
  const round: number = Math.max(1, (opts.round ?? 0.12) * n);
  const grown: Uint8Array = front;
  const dist: Float32Array = distanceInside(front, n);
  const fr = rowExtents(front, n);
  const br = rowExtents(back, n);
  const index = new Int32Array(n * n).fill(-1);
  const pos: number[] = [];
  const uvF: number[] = [];
  const uvB: number[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!grown[y * n + x]) continue;
      index[y * n + x] = pos.length / 3;
      const t: number = Math.min(1, Math.max(0, dist[y * n + x]! - 1) / round);
      // Circular profile: steep at the edge, flat on the body.
      const z: number = thickness * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      pos.push(x / (n - 1) - 0.5, 0.5 - y / (n - 1), z);
      uvF.push(x / (n - 1), 1 - y / (n - 1));
      // Seen from behind the garment is mirrored; map this row's front extent onto the back photo's.
      const f = fr[y];
      const b = br[y] ?? f;
      let u: number = 1 - x / (n - 1);
      if (f && b) {
        const k: number = f[1] === f[0] ? 0.5 : (x - f[0]) / (f[1] - f[0]);
        u = (b[1] - k * (b[1] - b[0])) / (n - 1);
      }
      uvB.push(u, 1 - y / (n - 1));
    }
  const count: number = pos.length / 3;
  // The cut-out edge follows the grid in stair steps: smooth the outline
  // vertices along the outline (a few Laplacian passes in x / y).
  const onEdge = (x: number, y: number): boolean => {
    if (!front[y * n + x]) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx: number = x + dx;
        const yy: number = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n || !front[yy * n + xx]) return true;
      }
    return false;
  };
  const edge: Array<{ v: number; nb: number[] }> = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!onEdge(x, y)) continue;
      const nb: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx: number = x + dx;
          const yy: number = y + dy;
          if (xx >= 0 && yy >= 0 && xx < n && yy < n && onEdge(xx, yy)) nb.push(index[yy * n + xx]!);
        }
      edge.push({ v: index[y * n + x]!, nb });
    }
  for (let pass = 0; pass < 4; pass++) {
    const next: number[] = edge.map(({ v, nb }) => {
      if (!nb.length) return pos[v * 3]!;
      let sx = 0;
      for (const j of nb) sx += pos[j * 3]!;
      return pos[v * 3]! * 0.5 + (sx / nb.length) * 0.5;
    });
    const nextY: number[] = edge.map(({ v, nb }) => {
      if (!nb.length) return pos[v * 3 + 1]!;
      let sy = 0;
      for (const j of nb) sy += pos[j * 3 + 1]!;
      return pos[v * 3 + 1]! * 0.5 + (sy / nb.length) * 0.5;
    });
    edge.forEach(({ v }, k) => {
      pos[v * 3] = next[k]!;
      pos[v * 3 + 1] = nextY[k]!;
    });
  }
  for (const { v } of edge) pos[v * 3 + 2] = 0;
  const tris: number[] = [];
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const a: number = index[y * n + x]!;
      const b: number = index[y * n + x + 1]!;
      const c: number = index[(y + 1) * n + x]!;
      const d: number = index[(y + 1) * n + x + 1]!;
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      tris.push(a, c, b, b, c, d);
    }
  const frontIndexCount: number = tris.length;
  // Back: the same vertices mirrored in z, opposite winding.
  const positions = new Float32Array(count * 6);
  const uvs = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    positions.set([pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!], i * 3);
    positions.set([pos[i * 3]!, pos[i * 3 + 1]!, -pos[i * 3 + 2]!], (count + i) * 3);
    uvs.set([uvF[i * 2]!, uvF[i * 2 + 1]!], i * 2);
    uvs.set([uvB[i * 2]!, uvB[i * 2 + 1]!], (count + i) * 2);
  }
  const indices = new Uint32Array(tris.length * 2);
  indices.set(tris);
  for (let i = 0; i < tris.length; i += 3) {
    indices[frontIndexCount + i] = tris[i]! + count;
    indices[frontIndexCount + i + 1] = tris[i + 2]! + count;
    indices[frontIndexCount + i + 2] = tris[i + 1]! + count;
  }
  return { positions, uvs, indices, frontIndexCount, height: 1 };
}
