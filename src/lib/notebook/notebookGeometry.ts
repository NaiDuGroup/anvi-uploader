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
export const NB_MESH_PEN_WHITE = "nb_pen_white";
export const NB_MESH_PEN_LOOP = "nb_pen_loop";
/** Sticky-note window parts; colour in `userData.colorHex`. */
export const NB_MESH_STICKY = "nb_sticky";

/** Pen beside the cover (cm). */
const PEN_R_CM = 0.45;
/** Width share of the cover the sticky-note window strip takes (right side). */
export const STICKY_WINDOW_SHARE = 0.2;

const HARD_BOARD_CM = 0.25;
const SOFT_BOARD_CM = 0.12;
const HARD_OVERHANG_CM = 0.25;
/** Rounded edge of the cover boards: their top face sits this much above the board (cm). */
const COVER_BEVEL_CM = 0.03;
/** The print floats just above the cover's top face, below the strap (which is 0.07 cm proud). */
const PRINT_LIFT_CM = COVER_BEVEL_CM + 0.015;

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
    bevelThickness: Math.min(COVER_BEVEL_CM, tCm / 4) * U,
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

/**
 * Twin-loop wire: pairs of flattened loops through holes near the binding
 * edge. A real wire-o loop hugs the block — tall, but only 2–3 mm proud of
 * the edge — so each ring is an ellipse, not a circle around the thickness.
 */
function wireGeometry(l: NotebookLook): THREE.BufferGeometry {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const holeX = -l.widthCm / 2 + 0.45;
  const b = T / 2 + 0.12; // vertical semi-axis
  const a = 0.42; // horizontal semi-axis
  const cx = holeX - a * Math.sqrt(Math.max(0, 1 - (T / 2 / b) ** 2));
  const ring = new THREE.TorusGeometry(b * U, 0.05 * U, 8, 32);
  ring.scale(a / b, 1, 1);
  const pitch = 0.72;
  const n = Math.max(2, Math.floor((H - 1) / pitch) + 1);
  const span = (n - 1) * pitch;
  const rings: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const z = -span / 2 + i * pitch;
    for (const dz of [-0.07, 0.07]) {
      const g = ring.clone();
      g.translate(cx * U, (T / 2) * U, (z + dz) * U);
      rings.push(g);
    }
  }
  return mergeGeometries(rings)!;
}

function cylZ(r0: number, r1: number, z0: number, z1: number, x: number, y: number): THREE.BufferGeometry {
  // CylinderGeometry: radiusTop at +Y; after rotateX(π/2) +Y → +Z, so r1 is at z1.
  const g = new THREE.CylinderGeometry(r1 * U, r0 * U, (z1 - z0) * U, 24);
  g.rotateX(Math.PI / 2);
  g.translate(x * U, y * U, ((z0 + z1) / 2) * U);
  return g.toNonIndexed();
}

/**
 * Ball pen lying beside the cover in an elastic loop (Leynax): white cap with
 * a clip at the top, barrel in the cover colour, white grip and a metal tip.
 */
function penMeshes(l: NotebookLook): THREE.Mesh[] {
  const T = l.thicknessCm;
  const H = l.heightCm;
  const r = PEN_R_CM;
  const len = Math.min(14.5, H * 0.86);
  const x = l.widthCm / 2 + 0.3;
  const y = Math.max(r, T / 2);
  const z0 = -len / 2 + 0.2;
  const z1 = len / 2 + 0.2;
  const capEnd = z0 + 2.6;
  const gripStart = z1 - 2.2;
  const white = mergeGeometries([
    cylZ(r * 0.92, r, z0, capEnd, x, y),
    (() => {
      const g = new THREE.SphereGeometry(r * 0.92 * U, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.rotateX(-Math.PI / 2);
      g.translate(x * U, y * U, z0 * U);
      return g.toNonIndexed();
    })(),
    box(0.14, 0.16, 2.4, x + r * 0.55, y + r * 0.85, z0 + 1.4).toNonIndexed(),
    cylZ(r, r * 0.62, gripStart, z1 - 0.5, x, y),
  ])!;
  const barrel = cylZ(r, r, capEnd, gripStart, x, y);
  const tip = cylZ(r * 0.62, r * 0.08, z1 - 0.5, z1, x, y);
  // Black elastic loop around the pen, sewn to the cover edge.
  const loopZ = l.heightCm * 0.06;
  const ring = new THREE.TorusGeometry((r + 0.05) * U, 0.05 * U, 6, 24);
  ring.translate(x * U, y * U, loopZ * U);
  const tab = box(0.9, 0.06, 0.55, l.widthCm / 2 - 0.15, y, loopZ);
  return [
    mesh(barrel, NB_MESH_PEN),
    mesh(white, NB_MESH_PEN_WHITE),
    mesh(tip, NB_MESH_PEN_TIP),
    mesh(mergeGeometries([ring.toNonIndexed(), tab.toNonIndexed()])!, NB_MESH_PEN_LOOP),
  ];
}

/** Window in the front cover showing sticky notes (Renat): five dots and a long slot. */
function stickyWindowMeshes(l: NotebookLook): THREE.Mesh[] {
  const W = l.widthCm;
  const H = l.heightCm;
  const T = l.thicknessCm;
  const x = W / 2 - W * 0.13;
  // On top of the cover (and the print): the window is cut through both.
  const y = T + PRINT_LIFT_CM + 0.03;
  const out: THREE.Mesh[] = [];
  const colours = ["#f39ab4", "#f2d24a", "#ecdf45", "#d5e45c", "#6fc3e8"];
  colours.forEach((hex, i) => {
    const g = new THREE.CylinderGeometry(0.28 * U, 0.28 * U, 0.04 * U, 24);
    g.translate(x * U, y * U, (-H / 2 + H * (0.12 + i * 0.087)) * U);
    const m = mesh(g, NB_MESH_STICKY);
    m.userData.colorHex = hex;
    out.push(m);
  });
  const slotLen = H * 0.39;
  const slot = new THREE.CapsuleGeometry(0.22 * U, (slotLen - 0.44) * U, 4, 12);
  slot.rotateX(Math.PI / 2);
  slot.scale(1, 0.12, 1);
  slot.translate(x * U, y * U, (-H / 2 + H * 0.53 + slotLen / 2) * U);
  const m = mesh(slot, NB_MESH_STICKY);
  m.userData.colorHex = "#f1e3a0";
  out.push(m);
  return out;
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
  if (l.hasStickyWindow) for (const m of stickyWindowMeshes(l)) group.add(m);

  // Printable zone on the front cover, then the print centred in it.
  let zx0 = -W / 2;
  const zx1 = W / 2 - (l.hasStickyWindow ? W * STICKY_WINDOW_SHARE : 0);
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
  const halfW = W / 2 + (l.hasPen ? 0.3 + 2 * PEN_R_CM : 0) + 0.3;
  const halfH = H / 2 + extra;
  return {
    group,
    label: {
      x: ((zx0 + zx1) / 2) * U,
      y: (T + PRINT_LIFT_CM) * U,
      z: ((zz0 + zz1) / 2) * U,
      width: pw * U,
      height: ph * U,
    },
    accent,
    footprintRadius: Math.hypot(halfW, halfH) * U,
    thickness: T * U,
  };
}
