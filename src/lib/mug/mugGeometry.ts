import * as THREE from "three";
import { MUG_MESH_BODY, MUG_MESH_FRINGE, MUG_MESH_HANDLE, MUG_MESH_INSIDE } from "./mug3dMaterials";
import type { MugShape } from "./mugShape";

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

/**
 * Centre line of a sublimation heart handle, traced from a product photo of a
 * 9.6 cm mug: [distance out from the wall (cm), height from the bottom (cm)].
 * It is half a heart — the wall is the other half: from the top joint the band
 * dips into the cleft, rises over one big lobe, swings out and runs down to the
 * lower joint, which is the heart's point.
 */
const HEART_PATH_CM: readonly [number, number][] = [
  [-0.35, 8.0],
  [0.9, 8.1],
  [1.5, 7.6],
  [1.95, 6.9],
  [2.4, 6.98],
  [3.25, 7.15],
  [3.9, 6.85],
  [4.2, 6.05],
  [3.95, 4.95],
  [3.1, 4.25],
  [1.95, 3.7],
  [0.9, 3.45],
  [-0.35, 3.38],
];
const HEART_REF_HEIGHT_CM = 9.6;
const HEART_TUBE_CM = 0.42;

function heartReachCm(shape: MugShape): number {
  const k = shape.bodyHeightCm / HEART_REF_HEIGHT_CM;
  return Math.max(...HEART_PATH_CM.map(([d]) => d)) * k;
}

/** Heart handle (open band from the top joint to the bottom joint) on the −Z side. */
function heartHandleCurve(shape: MugShape): THREE.Curve<THREE.Vector3> {
  // Sized with the mug height, so a tall mug gets a taller heart.
  const k = shape.bodyHeightCm / HEART_REF_HEIGHT_CM;
  const pts = HEART_PATH_CM.map(([d, h]) => {
    const y = h * k;
    const z = radiusAt(shape, y) + d * k;
    return new THREE.Vector3(0, y * MUG_UNIT_PER_CM, -z * MUG_UNIT_PER_CM);
  });
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

/** Part [from, to] (0…1 of arc length) of a curve. */
class SubCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly base: THREE.Curve<THREE.Vector3>,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.base.getPointAt(this.from + (this.to - this.from) * t, target);
  }
}

/** Mesh named after the body: white glaze where a heart handle meets the wall. */
export const MUG_MESH_HANDLE_JOINT = "Mug_HandleJoint";
/** How far the white glaze runs out from the wall on a heart handle (cm). */
const HEART_JOINT_CM = 0.5;

function tube(curve: THREE.Curve<THREE.Vector3>, segments: number, radiusCm: number, widen: number, name: string): THREE.Mesh {
  const geom = new THREE.TubeGeometry(curve, segments, radiusCm * MUG_UNIT_PER_CM, 16, false);
  // Oval section: wider across than in the handle's plane, like a real handle.
  geom.scale(widen, 1, 1);
  const mesh = new THREE.Mesh(geom);
  mesh.name = name;
  return mesh;
}

/**
 * Arc-length share where the heart band is HEART_JOINT_CM out from the wall,
 * from the start (top joint) and from the end (bottom joint).
 */
function heartJointShares(shape: MugShape, curve: THREE.Curve<THREE.Vector3>): [number, number] {
  const n = 400;
  const pts = curve.getSpacedPoints(n);
  const out = (p: THREE.Vector3) => -p.z / MUG_UNIT_PER_CM - radiusAt(shape, p.y / MUG_UNIT_PER_CM);
  const limit = HEART_JOINT_CM * (shape.bodyHeightCm / HEART_REF_HEIGHT_CM);
  let a = 0;
  while (a < n && out(pts[a]!) < limit) a++;
  let b = n;
  while (b > 0 && out(pts[b]!) < limit) b--;
  return [a / n, b / n];
}

function handleMeshes(shape: MugShape): THREE.Mesh[] {
  if (shape.handleStyle === "none") return [];
  if (shape.handleStyle === "classic") {
    return [tube(classicHandleCurve(shape), 96, HANDLE_TUBE_CM, 1.35, MUG_MESH_HANDLE)];
  }
  // Heart: coloured band with white joints at the wall, like the real sublimation mug.
  const curve = heartHandleCurve(shape);
  const [a, b] = heartJointShares(shape, curve);
  return [
    tube(new SubCurve(curve, a, b), 200, HEART_TUBE_CM, 1.5, MUG_MESH_HANDLE),
    tube(new SubCurve(curve, 0, a + 0.004), 12, HEART_TUBE_CM, 1.5, MUG_MESH_HANDLE_JOINT),
    tube(new SubCurve(curve, b - 0.004, 1), 12, HEART_TUBE_CM, 1.5, MUG_MESH_HANDLE_JOINT),
  ];
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
  for (const m of handleMeshes(shape)) group.add(m);
  return {
    group,
    label: mugLabelPlacement(shape, print),
    height: shape.bodyHeightCm * MUG_UNIT_PER_CM,
  };
}

/** How far the handle sticks out past the body wall (cm). */
function handleReachCm(shape: MugShape): number {
  if (shape.handleStyle === "none") return 0;
  if (shape.handleStyle === "heart") return heartReachCm(shape) + HEART_TUBE_CM;
  return HANDLE_REACH_CM + HANDLE_TUBE_CM;
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

/** Floor height and contact-shadow area for the studio (scene units; the mug stands centred on Y). */
export function mugStage(shape: MugShape): { floorY: number; shadowScale: number; shadowFar: number } {
  const r = Math.max(shape.topDiameterCm, shape.bottomDiameterCm) / 2;
  return {
    floorY: (-shape.bodyHeightCm / 2) * MUG_UNIT_PER_CM,
    shadowScale: (r + handleReachCm(shape)) * 2 * 1.8 * MUG_UNIT_PER_CM,
    shadowFar: shape.bodyHeightCm * MUG_UNIT_PER_CM,
  };
}
