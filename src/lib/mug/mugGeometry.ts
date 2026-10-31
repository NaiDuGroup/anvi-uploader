import * as THREE from "three";
import { MUG_MESH_BODY, MUG_MESH_FRINGE, MUG_MESH_HANDLE, MUG_MESH_INSIDE } from "./mug3dMaterials";
import { MUG_SHAPE_DEFAULTS, type MugShape } from "./mugShape";

/**
 * Builds a mug from its sizes instead of loading a GLB per model: body, rim
 * and inside are lathed from one profile, the handle is a tube along a curve.
 * Meshes keep the GLB names so `applyMugCeramicMaterials` colours them.
 *
 * Scene units: 1 cm = UNIT (a standard 9.6 cm mug is 0.15 high, like the old GLB).
 * The handle points to −Z, away from the camera; the print wraps around +Z.
 */

export const MUG_UNIT_PER_CM = 0.15 / 9.6;

const WALL_CM = 0.4;
const FLOOR_CM = 0.7;
const SEGMENTS = 128;
/** Handle reach beyond the body (cm) and tube radius (cm). */
const HANDLE_REACH_CM = 3.4;
const HANDLE_TUBE_CM = 0.45;
/** Max share of the circumference the print may cover (rest is the handle gap). */
const MAX_PRINT_ARC = 330 / 360;
/** Legacy framing when the print size is unknown: 300° wrap, 97% of the height. */
const LEGACY_ARC_DEG = 300;
const LEGACY_HEIGHT_SHARE = 0.97;

export type MugPrintArea = { widthCm: number; heightCm: number };

export type MugLabelPlacement = {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  centerY: number;
  thetaStart: number;
  thetaLength: number;
};

export type BuiltMug = {
  group: THREE.Group;
  label: MugLabelPlacement;
  /** Body height in scene units (the group is NOT re-centred). */
  height: number;
};

function radiusAt(shape: MugShape, yCm: number): number {
  const rb = shape.bottomDiameterCm / 2;
  const rt = shape.topDiameterCm / 2;
  return rb + ((rt - rb) * yCm) / shape.bodyHeightCm;
}

function lathe(pointsCm: THREE.Vector2[], name: string): THREE.Mesh {
  const pts = pointsCm.map((p) => new THREE.Vector2(p.x * MUG_UNIT_PER_CM, p.y * MUG_UNIT_PER_CM));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, SEGMENTS));
  mesh.name = name;
  return mesh;
}

function arc(cx: number, cy: number, r: number, fromRad: number, toRad: number, steps: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = fromRad + ((toRad - fromRad) * i) / steps;
    out.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return out;
}

function bodyMeshes(shape: MugShape): THREE.Mesh[] {
  const H = shape.bodyHeightCm;
  const lip = WALL_CM / 2;
  const rb = radiusAt(shape, 0);
  const fillet = Math.min(0.5, rb * 0.12);

  // Outside: bottom disc → rounded foot → wall up to the rim.
  const outside: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(rb - fillet, 0)];
  outside.push(...arc(rb - fillet, fillet, fillet, -Math.PI / 2, 0, 6).slice(1));
  const wallSteps = 12;
  for (let i = 1; i <= wallSteps; i++) {
    const y = fillet + ((H - lip - fillet) * i) / wallSteps;
    outside.push(new THREE.Vector2(radiusAt(shape, y), y));
  }

  // Rim: half-round lip from the outer to the inner wall.
  const rt = radiusAt(shape, H - lip);
  const rim = arc(rt - lip, H - lip, lip, 0, Math.PI, 10);

  // Inside: wall down → rounded floor → centre.
  const innerFillet = Math.min(0.7, (rb - WALL_CM) * 0.2);
  const inside: THREE.Vector2[] = [];
  for (let i = 0; i <= wallSteps; i++) {
    const y = H - lip - ((H - lip - FLOOR_CM - innerFillet) * i) / wallSteps;
    inside.push(new THREE.Vector2(radiusAt(shape, y) - WALL_CM, y));
  }
  const rFloor = radiusAt(shape, FLOOR_CM) - WALL_CM;
  inside.push(...arc(rFloor - innerFillet, FLOOR_CM + innerFillet, innerFillet, 0, -Math.PI / 2, 6).slice(1));
  inside.push(new THREE.Vector2(0, FLOOR_CM));

  return [lathe(outside, MUG_MESH_BODY), lathe(rim, MUG_MESH_FRINGE), lathe(inside, MUG_MESH_INSIDE)];
}

/** C-shaped handle in the x = 0 plane, on the −Z side. */
function classicHandleCurve(shape: MugShape): THREE.Curve<THREE.Vector3> {
  const H = shape.bodyHeightCm;
  const yTop = H * 0.8;
  const yBottom = H * 0.24;
  const yMid = (yTop + yBottom) / 2;
  const rTop = radiusAt(shape, yTop);
  const rBottom = radiusAt(shape, yBottom);
  const rMid = radiusAt(shape, yMid);
  const reach = HANDLE_REACH_CM;
  const p = (z: number, y: number) => new THREE.Vector3(0, y * MUG_UNIT_PER_CM, -z * MUG_UNIT_PER_CM);
  return new THREE.CatmullRomCurve3(
    [
      p(rTop - 0.4, yTop),
      p(rTop + reach * 0.45, yTop + 0.35),
      p(rMid + reach * 0.9, yTop - (yTop - yMid) * 0.25),
      p(rMid + reach, yMid),
      p(rMid + reach * 0.85, yBottom + (yMid - yBottom) * 0.25),
      p(rBottom + reach * 0.4, yBottom - 0.25),
      p(rBottom - 0.4, yBottom),
    ],
    false,
    "centripetal",
  );
}

function heartWidthCm(shape: MugShape): number {
  return Math.min(HANDLE_REACH_CM + 1.2, shape.bodyHeightCm * 0.58 * 0.85);
}

/** Heart outline (point down) whose body-side edge sinks into the wall. */
function heartHandleCurve(shape: MugShape): THREE.Curve<THREE.Vector3> {
  const H = shape.bodyHeightCm;
  const spanCm = H * 0.58;
  const widthCm = heartWidthCm(shape);
  const yMid = H * 0.52;
  const rMid = radiusAt(shape, yMid);
  // Classic heart curve: x ∈ [−16, 16], y ∈ [−17, 12].
  const ky = spanCm / 29;
  const kx = widthCm / 32;
  const centerZ = rMid + widthCm / 2 - 0.6;
  const pts: THREE.Vector3[] = [];
  const steps = 96;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = centerZ + hx * kx;
    const y = yMid + (hy + 2.5) * ky;
    pts.push(new THREE.Vector3(0, y * MUG_UNIT_PER_CM, -z * MUG_UNIT_PER_CM));
  }
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
}

function handleMesh(shape: MugShape): THREE.Mesh | null {
  if (shape.handleStyle === "none") return null;
  const closed = shape.handleStyle === "heart";
  const curve = closed ? heartHandleCurve(shape) : classicHandleCurve(shape);
  const geom = new THREE.TubeGeometry(curve, closed ? 160 : 96, HANDLE_TUBE_CM * MUG_UNIT_PER_CM, 16, closed);
  // Oval section: a bit wider than thick, like a real handle.
  geom.scale(1.35, 1, 1);
  const mesh = new THREE.Mesh(geom);
  mesh.name = MUG_MESH_HANDLE;
  return mesh;
}

/** Where the design wraps: physical print size on the body, centred on the front. */
export function mugLabelPlacement(shape: MugShape, print?: MugPrintArea | null): MugLabelPlacement {
  const H = shape.bodyHeightCm;
  const usableH = H * LEGACY_HEIGHT_SHARE;
  const heightCm = print ? Math.min(print.heightCm, usableH) : usableH;
  const centerCm = H / 2;
  const yTop = centerCm + heightCm / 2;
  const yBottom = centerCm - heightCm / 2;
  const avgDiameter = radiusAt(shape, centerCm) * 2;
  const share = print
    ? Math.min(print.widthCm / (Math.PI * avgDiameter), MAX_PRINT_ARC)
    : LEGACY_ARC_DEG / 360;
  const thetaLength = share * Math.PI * 2;
  const lift = 0.05;
  return {
    radiusTop: (radiusAt(shape, yTop) + lift) * MUG_UNIT_PER_CM,
    radiusBottom: (radiusAt(shape, yBottom) + lift) * MUG_UNIT_PER_CM,
    height: heightCm * MUG_UNIT_PER_CM,
    centerY: centerCm * MUG_UNIT_PER_CM,
    // Centred on +Z (θ = 0 faces the camera); the gap sits around the handle.
    thetaStart: -thetaLength / 2,
    thetaLength,
  };
}

export function buildMug(shape: MugShape, print?: MugPrintArea | null): BuiltMug {
  const group = new THREE.Group();
  for (const m of bodyMeshes(shape)) group.add(m);
  const handle = handleMesh(shape);
  if (handle) group.add(handle);
  return {
    group,
    label: mugLabelPlacement(shape, print),
    height: shape.bodyHeightCm * MUG_UNIT_PER_CM,
  };
}

/** How far the handle sticks out past the body wall (cm). */
function handleReachCm(shape: MugShape): number {
  if (shape.handleStyle === "none") return 0;
  const reach = shape.handleStyle === "heart" ? heartWidthCm(shape) - 0.6 : HANDLE_REACH_CM;
  return reach + HANDLE_TUBE_CM;
}

/**
 * Half-height and half-width the camera must fit, in scene units. The mug
 * spins on its axis, so the handle can swing to either side; a little air
 * is added all round.
 */
export function mugFrameHalfExtents(shape: MugShape): { halfHeight: number; halfWidth: number } {
  const r = Math.max(shape.topDiameterCm, shape.bottomDiameterCm) / 2;
  return {
    halfHeight: (shape.bodyHeightCm / 2 + 1.5) * MUG_UNIT_PER_CM,
    halfWidth: (r + handleReachCm(shape) + 0.6) * MUG_UNIT_PER_CM,
  };
}
