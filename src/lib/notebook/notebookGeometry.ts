import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SPIRAL_HOLE_MARGIN_CM, type NotebookLook } from "./notebookLook";

/**
 * Builds a notebook from its look (size, binding, strap, ribbon, pen) instead
 * of loading one 21 MB GLB for every notebook.
 *
 * It lies flat like the old model: X across the cover (binding at −X), Z along
 * the height (top edge at −Z, away from the camera), Y up. All transforms are
 * baked into the geometry, so `position` is in notebook space — the cover
 * shader uses it for the accent zone (cork bottom, kraft strip).
 */

/** Scene units per cm (a 21 cm A5 notebook is 0.21 high). */
export const NOTEBOOK_UNIT_PER_CM = 0.01;

export const NB_MESH_COVER = "nb_cover";
export const NB_MESH_FRONT = "nb_front";
export const NB_MESH_PAPER = "nb_paper";
export const NB_MESH_STRAP = "nb_strap";
export const NB_MESH_BOOKMARK = "nb_bookmark";
export const NB_MESH_WIRE = "nb_wire";
export const NB_MESH_PEN = "nb_pen";
export const NB_MESH_PEN_TIP = "nb_pen_tip";

const HARD_BOARD_CM = 0.25;
const SOFT_BOARD_CM = 0.12;
const HARD_OVERHANG_CM = 0.25;

export type NotebookPrintArea = { widthCm: number; heightCm: number };

export type NotebookLabelPlacement = {
  /** Plane centre in notebook space (scene units) and size. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
};

export type BuiltNotebook = {
  group: THREE.Group;
  label: NotebookLabelPlacement;
  /** Accent zone for the front-cover shader, in scene units. */
  accent: { axis: "x" | "z"; from: number } | null;
  /** Radius of the footprint the camera must keep in frame while it spins. */
  footprintRadius: number;
  /** Total height (thickness) in scene units. */
  thickness: number;
};

const U = NOTEBOOK_UNIT_PER_CM;

function mesh(geom: THREE.BufferGeometry, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom);
  m.name = name;
  return m;
}

/** Rectangle in the XZ plane with per-side corner radii, as a THREE.Shape (x, −z). */
function coverShape(w: number, h: number, rLeft: number, rRight: number): THREE.Shape {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + rLeft, y0);
  s.lineTo(x1 - rRight, y0);
  if (rRight > 0) s.quadraticCurveTo(x1, y0, x1, y0 + rRight);
  s.lineTo(x1, y1 - rRight);
  if (rRight > 0) s.quadraticCurveTo(x1, y1, x1 - rRight, y1);
  s.lineTo(x0 + rLeft, y1);
  if (rLeft > 0) s.quadraticCurveTo(x0, y1, x0, y1 - rLeft);
  s.lineTo(x0, y0 + rLeft);
  if (rLeft > 0) s.quadraticCurveTo(x0, y0, x0 + rLeft, y0);
  return s;
}

/** Flat board W×H (cm) lying in XZ, from y0 to y0+t (cm). */
function board(wCm: number, hCm: number, tCm: number, y0Cm: number, rLeft: number, rRight: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(coverShape(wCm * U, hCm * U, rLeft * U, rRight * U), {
    depth: tCm * U,
    bevelEnabled: true,
    bevelThickness: Math.min(0.03, tCm / 4) * U,
    bevelSize: 0.03 * U,
    bevelSegments: 2,
    curveSegments: 10,
  });
  // Shape is in XY; lay it down: Y → −Z, extrusion (Z) → Y.
  g.rotateX(Math.PI / 2);
  g.translate(0, (y0Cm + tCm) * U, 0);
  return g;
}

function box(wCm: number, tCm: number, hCm: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(wCm * U, tCm * U, hCm * U);
  g.translate(x * U, y * U, z * U);
  return g;
}

function strapGeometry(l: NotebookLook): THREE.BufferGeometry {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const w = l.widthCm < 11 ? 0.55 : 0.7;
  const t = 0.07;
  const x = l.widthCm / 2 - Math.max(0.8, l.widthCm * 0.07);
  const parts = [
    box(w, t, H + 0.1, x, T + t / 2, 0),
    box(w, t, H + 0.1, x, -t / 2, 0),
    box(w, T + 2 * t, t, x, T / 2, -(H / 2 + 0.05 + t / 2)),
    box(w, T + 2 * t, t, x, T / 2, H / 2 + 0.05 + t / 2),
  ];
  return mergeGeometries(parts)!;
}

/** Ribbon coming out between the pages at the bottom edge and lying on the table. */
function bookmarkGeometry(l: NotebookLook): THREE.BufferGeometry {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const x = -l.widthCm / 2 + Math.max(1, l.widthCm * 0.14);
  const w = 0.45;
  const t = 0.03;
  const drop = new THREE.BoxGeometry(w * U, t * U, 1.6 * U);
  // Slope from mid-thickness down to the table over ~1.3 cm.
  const angle = Math.atan2(T / 2, 1.3);
  drop.rotateX(angle);
  drop.translate(x * U, (T / 4) * U, (H / 2 + 0.55) * U);
  const flat = box(w, t, 2.6, x, t / 2, H / 2 + 1.25 + 1.3);
  return mergeGeometries([drop.toNonIndexed(), flat.toNonIndexed()])!;
}

/** Twin-loop wire: pairs of rings through holes near the binding edge. */
function wireGeometry(l: NotebookLook): THREE.BufferGeometry {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const holeX = -l.widthCm / 2 + 0.6;
  const R = T / 2 + 0.3;
  const cx = holeX - Math.sqrt(R * R - (T / 2) * (T / 2));
  const ring = new THREE.TorusGeometry(R * U, 0.055 * U, 8, 28);
  const pitch = 0.85;
  const n = Math.max(2, Math.floor((H - 1.2) / pitch) + 1);
  const span = (n - 1) * pitch;
  const rings: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const z = -span / 2 + i * pitch;
    for (const dz of [-0.1, 0.1]) {
      const g = ring.clone();
      g.translate(cx * U, (T / 2) * U, (z + dz) * U);
      rings.push(g);
    }
  }
  return mergeGeometries(rings)!;
}

function penMeshes(l: NotebookLook): THREE.Mesh[] {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const r = 0.42;
  const len = Math.min(14, H * 0.88);
  const x = l.widthCm / 2 - 0.15;
  const y = T + r * 0.6;
  const barrel = new THREE.CylinderGeometry(r * U, r * U, len * U, 20);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(x * U, y * U, -0.6 * U);
  const clip = box(0.18, 0.12, 3.2, x, y + r, -len / 2 + 1.4 - 0.6);
  const tip = new THREE.ConeGeometry(r * U, 1.6 * U, 20);
  tip.rotateX(Math.PI / 2);
  tip.translate(x * U, y * U, (len / 2 - 0.6 + 0.8) * U);
  return [mesh(mergeGeometries([barrel.toNonIndexed(), clip.toNonIndexed()])!, NB_MESH_PEN), mesh(tip, NB_MESH_PEN_TIP)];
}

export function buildNotebook(l: NotebookLook, print?: NotebookPrintArea | null): BuiltNotebook {
  const group = new THREE.Group();
  const W = l.widthCm;
  const H = l.heightCm;
  const T = l.thicknessCm;
  const spiral = l.binding === "spiral";
  const b = spiral ? SOFT_BOARD_CM : HARD_BOARD_CM;

  if (spiral) {
    const r = 0.3;
    group.add(mesh(board(W, H, b, 0, r, r), NB_MESH_COVER));
    group.add(mesh(board(W, H, b, T - b, r, r), NB_MESH_FRONT));
    group.add(mesh(box(W - 0.25, T - 2 * b, H - 0.3, 0.125 - 0.0, T / 2, 0), NB_MESH_PAPER));
    group.add(mesh(wireGeometry(l), NB_MESH_WIRE));
  } else {
    const r = Math.min(0.7, W * 0.05);
    group.add(mesh(board(W, H, b, 0, 0, r), NB_MESH_COVER));
    group.add(mesh(board(W, H, b, T - b, 0, r), NB_MESH_FRONT));
    // Rounded spine: half cylinder along the binding edge.
    const spine = new THREE.CylinderGeometry((T / 2) * U, (T / 2) * U, H * U, 24, 1, false, Math.PI, Math.PI);
    spine.rotateX(Math.PI / 2);
    spine.translate((-W / 2 + 0.02) * U, (T / 2) * U, 0);
    group.add(mesh(spine, NB_MESH_COVER));
    const o = HARD_OVERHANG_CM;
    group.add(mesh(box(W - o - 0.1, T - 2 * b, H - 2 * o, (0.1 - o) / 2, T / 2, 0), NB_MESH_PAPER));
  }
  if (l.hasStrap) group.add(mesh(strapGeometry(l), NB_MESH_STRAP));
  if (l.hasBookmark) group.add(mesh(bookmarkGeometry(l), NB_MESH_BOOKMARK));
  if (l.hasPen) for (const m of penMeshes(l)) group.add(m);

  // Printable zone on the front cover, then the print centred in it.
  let zx0 = -W / 2;
  const zx1 = W / 2;
  const zz0 = -H / 2;
  let zz1 = H / 2;
  if (spiral) zx0 += SPIRAL_HOLE_MARGIN_CM;
  let accent: BuiltNotebook["accent"] = null;
  if (l.accent === "bottom") {
    zz1 = H / 2 - H * (l.accentSharePct / 100);
    accent = { axis: "z", from: zz1 * U };
  } else if (l.accent === "spine") {
    const edge = -W / 2 + W * (l.accentSharePct / 100);
    zx0 = Math.max(zx0, edge);
    accent = { axis: "x", from: edge * U };
  }
  const zoneW = zx1 - zx0;
  const zoneH = zz1 - zz0;
  const pw = print ? Math.min(print.widthCm, zoneW) : zoneW * 0.92;
  const ph = print ? Math.min(print.heightCm, zoneH) : zoneH * 0.92;

  let extra = 0;
  if (l.hasBookmark) extra = Math.max(extra, 3);
  const halfW = W / 2 + (l.hasPen ? 0.6 : 0) + (spiral ? T / 2 + 0.3 : 0.3);
  const halfH = H / 2 + extra;
  return {
    group,
    label: {
      x: ((zx0 + zx1) / 2) * U,
      y: (T + 0.012) * U,
      z: ((zz0 + zz1) / 2) * U,
      width: pw * U,
      height: ph * U,
    },
    accent,
    footprintRadius: Math.hypot(halfW, halfH) * U,
    thickness: T * U,
  };
}
