/**
 * 3D mannequin wearing the t-shirt (client-only, three.js). Units: centimetres.
 * y = 0 is the shoulder high point (where the shirt length is measured from),
 * the front faces +z.
 *
 * The mannequin is the wearer of the chosen size: its body is scaled so that
 * the shirt of that size fits it, while the print keeps its real size in cm —
 * a 30×42 print fills an XS wearer's chest and looks smaller on an XXXL one.
 * White mannequin for a dark shirt, black for a light one; jeans below.
 *
 * The shirt is draped, not a tube: it hangs from the chest / shoulder blades,
 * is pushed in by the arms, and gets folds where the fabric hangs free.
 */
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { garmentCm, type TshirtSide } from "./tshirtRules";


export const MANNEQUIN_TARGET = { x: 0, y: -27, z: 0 } as const;
export const MANNEQUIN_CAMERA = { distance: 250, height: -15, fov: 28 } as const;

// ── Body shape ───────────────────────────────────────────────────────────────
/** [y, half-width, front depth, back depth] of the base body (≈ M wearer). */
const BODY: readonly (readonly [number, number, number, number])[] = [
  [-88, 14.6, 8.4, 8.8],
  [-82, 15.4, 8.6, 9.6],
  [-74, 16.8, 9.0, 11.0],
  [-66, 17.4, 9.2, 11.4],
  [-58, 16.6, 9.3, 10.4],
  [-50, 15.2, 9.5, 9.4],
  [-43, 14.6, 9.7, 8.9],
  [-35, 15.1, 10.2, 9.2],
  [-27, 15.9, 10.9, 9.7],
  [-20, 16.6, 11.4, 10.1],
  [-14, 18.0, 11.0, 10.2],
  [-10, 19.4, 9.9, 9.6],
  [-7, 19.0, 8.9, 8.6],
  [-4, 16.0, 7.5, 7.4],
  [-2, 12.6, 6.5, 6.4],
  [0, 8.6, 5.6, 5.6],
  [1.4, 6.6, 5.0, 5.0],
  [2.4, 6.0, 4.8, 4.8],
];
const SE_N = 2.35;

/** Smooth curve through the table rows (monotone cubic — no ripples between rows). */
function cosInterp(table: readonly (readonly number[])[], y: number, col: number): number {
  const n = table.length;
  if (y <= table[0]![0]!) return table[0]![col]!;
  if (y >= table[n - 1]![0]!) return table[n - 1]![col]!;
  let i = 0;
  while (i < n - 2 && y > table[i + 1]![0]!) i++;
  const x0 = table[i]![0]!;
  const x1 = table[i + 1]![0]!;
  const y0 = table[i]![col]!;
  const y1 = table[i + 1]![col]!;
  const slope = (a: number) => {
    if (a <= 0 || a >= n - 1) {
      const b = a <= 0 ? 0 : n - 2;
      return (table[b + 1]![col]! - table[b]![col]!) / (table[b + 1]![0]! - table[b]![0]!);
    }
    const dl = (table[a]![col]! - table[a - 1]![col]!) / (table[a]![0]! - table[a - 1]![0]!);
    const dr = (table[a + 1]![col]! - table[a]![col]!) / (table[a + 1]![0]! - table[a]![0]!);
    return dl * dr <= 0 ? 0 : (2 * dl * dr) / (dl + dr);
  };
  const h = x1 - x0;
  const t = (y - x0) / h;
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
}
const sePow = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / SE_N);
const gauss = (t: number) => Math.exp(-t * t);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Base-body surface point at height y (base units) and angle th (0 = front, π/2 = +x). */
function bodyXZ(y: number, th: number): [number, number] {
  const a = cosInterp(BODY, y, 1);
  const s = Math.sin(th);
  const c = Math.cos(th);
  const x = a * sePow(s);
  let z = (c >= 0 ? cosInterp(BODY, y, 2) : cosInterp(BODY, y, 3)) * sePow(c);
  // chest and shoulder blades
  z += 1.25 * gauss((y + 19) / 5.5) * (gauss(angDiff(th, 0.55) / 0.4) + gauss(angDiff(th, -0.55) / 0.4));
  z -= 0.8 * gauss((y + 17) / 6) * (gauss(angDiff(th, Math.PI - 0.6) / 0.42) + gauss(angDiff(th, Math.PI + 0.6) / 0.42));
  // spine groove
  z += 0.45 * gauss((y + 30) / 16) * gauss(angDiff(th, Math.PI) / 0.12);
  return [x, z];
}

function perimeterAt(y: number): number {
  let p = 0;
  let prev = bodyXZ(y, 0);
  for (let i = 1; i <= 360; i++) {
    const cur = bodyXZ(y, (i / 360) * Math.PI * 2);
    p += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    prev = cur;
  }
  return p;
}
const BODY_CHEST_CM = perimeterAt(-20);

// ── Geometry helpers ─────────────────────────────────────────────────────────
function gridGeometry(
  pos: Float32Array,
  rows: number,
  cols: number,
  /** Outward reference: centre of the ring a sample vertex belongs to. */
  centreOf: (row: number) => THREE.Vector3 = (row) => new THREE.Vector3(0, pos[(row * cols) * 3 + 1]!, 0),
): THREE.BufferGeometry {
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const i2 = (i + 1) % cols;
      const a = j * cols + i;
      const b = j * cols + i2;
      const c = (j + 1) * cols + i;
      const d = (j + 1) * cols + i2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make the normals point outward (lighting is wrong otherwise)
  const row = Math.floor(rows / 2);
  const k = row * cols;
  const n = g.getAttribute("normal");
  const out = new THREE.Vector3(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!).sub(centreOf(row));
  if (out.dot(new THREE.Vector3(n.getX(k), n.getY(k), n.getZ(k))) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

type Ring = { c: THREE.Vector3; d: THREE.Vector3; r: number; ex?: number; disp?: (phi: number) => number };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
function tubeGeometry(rings: Ring[], radial: number): THREE.BufferGeometry {
  const pos = new Float32Array(rings.length * radial * 3);
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  rings.forEach((ring, j) => {
    u.crossVectors(ring.d, Z_AXIS);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    v.crossVectors(u, ring.d).normalize();
    for (let i = 0; i < radial; i++) {
      const phi = (i / radial) * Math.PI * 2;
      const rr = ring.r + (ring.disp ? ring.disp(phi) : 0);
      const k = (j * radial + i) * 3;
      pos[k] = ring.c.x + u.x * Math.cos(phi) * rr + v.x * Math.sin(phi) * rr * (ring.ex ?? 1);
      pos[k + 1] = ring.c.y + u.y * Math.cos(phi) * rr + v.y * Math.sin(phi) * rr * (ring.ex ?? 1);
      pos[k + 2] = ring.c.z + u.z * Math.cos(phi) * rr + v.z * Math.sin(phi) * rr * (ring.ex ?? 1);
    }
  });
  return gridGeometry(pos, rings.length, radial, (row) => rings[row]!.c);
}

/** Distance from p to segment a–b and the position along it (0..1). */
function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): [number, number] {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.min(1, Math.max(0, new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq()));
  return [p.distanceTo(a.clone().addScaledVector(ab, t)), t];
}

function lum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 255;
  const n = parseInt(m[1]!, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
/** Black cotton reads as very dark grey under studio light — lift it a little so folds show. */
function clothColor(hex: string): THREE.Color {
  const c = new THREE.Color(hex);
  if (lum(hex) < 70) c.lerp(new THREE.Color("#4a4a4a"), 0.32);
  return c;
}

/** The design picture and where it sits: cm from the collar, x to the right as you look at that side. */
export type MannequinPrint = { canvas: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number } };
export type MannequinOptions = {
  shirtColor: string;
  size: string | null;
  prints: Partial<Record<TshirtSide, MannequinPrint>>;
};
export type MannequinScene = {
  root: THREE.Group;
  /** Lights — turned together with the view, like a turntable in a photo studio. */
  rig: THREE.Group;
  dispose: () => void;
};

export function buildMannequinScene({ shirtColor, size, prints }: MannequinOptions): MannequinScene {
  const g = garmentCm(size);
  const shirtChest = 2 * g.chest;
  const fx = (shirtChest - 12) / BODY_CHEST_CM;
  const fy = 1 + ((g.length - 71) / 71) * 0.6;
  const hs = 1 + (fx - 1) * 0.35;
  const light = lum(shirtColor) > 140;

  const root = new THREE.Group();
  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => {
    trash.push(x);
    return x;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ── Materials ──
  const skin = keep(
    new THREE.MeshPhysicalMaterial({
      color: light ? "#202020" : "#f2f2f0",
      roughness: 0.34,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    }),
  );
  const cloth = keep(
    new THREE.MeshPhysicalMaterial({
      color: clothColor(shirtColor),
      roughness: 0.96,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(light ? "#ffffff" : "#3c3c3c"),
      sheen: light ? 1 : 0.6,
      side: THREE.DoubleSide,
    }),
  );
  const denim = keep(
    new THREE.MeshPhysicalMaterial({
      color: "#2d405c",
      roughness: 0.92,
      sheen: 0.6,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color("#6a7fa0"),
      side: THREE.DoubleSide,
    }),
  );

  const bodyAt = (yWorld: number, th: number): [number, number] => {
    const [x, z] = bodyXZ(yWorld / fy, th);
    return [x * fx, z * fx];
  };

  // ── Body ──
  {
    const ys: number[] = [];
    for (let y = -74; y <= 2.4; y += 0.5) ys.push(y);
    const cols = 128;
    const pos = new Float32Array(ys.length * cols * 3);
    ys.forEach((yb, j) => {
      for (let i = 0; i < cols; i++) {
        const [x, z] = bodyXZ(yb, (i / cols) * Math.PI * 2);
        const k = (j * cols + i) * 3;
        pos[k] = x * fx;
        pos[k + 1] = yb * fy;
        pos[k + 2] = z * fx;
      }
    });
    add(gridGeometry(pos, ys.length, cols), skin);
  }
  // neck + head
  {
    const neck = add(new THREE.CylinderGeometry(5.1 * hs, 5.7 * hs, 15, 48), skin);
    neck.position.set(0, 4.5, -0.3);
    neck.rotation.x = 0.1;
    neck.scale.z = 0.93;
    const head = add(new THREE.SphereGeometry(1, 64, 48), skin);
    head.scale.set(8.9 * hs, 11.6 * hs, 10.2 * hs);
    head.position.set(0, 9.5 + 11 * hs, 1.4);
    head.rotation.x = -0.12;
  }

  // ── Arms (shoulder → elbow → wrist) + hands ──
  type ArmPath = { S: THREE.Vector3; E: THREE.Vector3; W: THREE.Vector3; u1: THREE.Vector3; u2: THREE.Vector3; rU: [number, number]; rF: [number, number] };
  const ARM_R: readonly (readonly [number, number])[] = [
    [-56, 2.7],
    [-53, 2.9],
    [-45, 3.6],
    [-36, 4.4],
    [-30, 4.1],
    [-26, 4.6],
    [-15, 5.0],
    [-6, 5.7],
    [0, 5.5],
  ];
  const armR = (s: number) => cosInterp(ARM_R, s / fy, 1) * fx;
  const arms: ArmPath[] = [];
  for (const dir of [-1, 1]) {
    const alpha = THREE.MathUtils.degToRad(10.5);
    const beta = THREE.MathUtils.degToRad(8);
    const S = new THREE.Vector3(dir * 16.4 * fx, -9.2 * fy, -1.4 * fx);
    const u1 = new THREE.Vector3(dir * Math.sin(alpha), -Math.cos(alpha), 0).normalize();
    const L1 = 30 * fy;
    const E = S.clone().addScaledVector(u1, L1);
    const u2 = u1.clone().multiplyScalar(Math.cos(beta)).add(new THREE.Vector3(0, 0, Math.sin(beta))).normalize();
    const L2 = 26 * fy;
    const W = E.clone().addScaledVector(u2, L2);
    arms.push({ S, E, W, u1, u2, rU: [armR(0), armR(-30 * fy)], rF: [armR(-31 * fy), armR(-56 * fy)] });

    const rings: Ring[] = [];
    const capH = 4.6 * fx;
    const R0 = armR(0);
    for (let k = 0; k <= 10; k++) {
      const s = capH * (1 - k / 10);
      rings.push({ c: S.clone().addScaledVector(u1, -s), d: u1, r: Math.max(0.05, R0 * Math.sqrt(1 - (s / capH) ** 2)), ex: 0.9 });
    }
    const total = L1 + L2;
    for (let s = 0.5; s <= total; s += 0.5) {
      // smooth bend at the elbow
      const bt = smoothstep(L1 - 3, L1 + 3, s);
      const d = u1.clone().lerp(u2, bt).normalize();
      const c = s <= L1 ? S.clone().addScaledVector(u1, s) : E.clone().addScaledVector(u2, s - L1);
      rings.push({ c, d, r: armR(-s), ex: 0.9 });
    }
    add(tubeGeometry(rings, 40), skin);

    const handGeo = new THREE.SphereGeometry(1, 32, 24);
    const palm = add(handGeo, skin);
    palm.scale.set(2.3 * fx, 5.0 * fy, 4.5 * fx);
    palm.position.copy(W).addScaledVector(u2, 4.2 * fy);
    palm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), u2);
    const fingers = new THREE.Mesh(handGeo, skin);
    fingers.castShadow = true;
    fingers.scale.set(1.8 * fx, 4.6 * fy, 4.1 * fx);
    const u3 = u2.clone().add(new THREE.Vector3(0, 0, 0.32)).normalize();
    fingers.position.copy(W).addScaledVector(u2, 7.8 * fy).addScaledVector(u3, 2.6 * fy);
    fingers.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), u3);
    root.add(fingers);
  }

  // ── Jeans ──
  {
    const ys: number[] = [];
    for (let y = -76 * fy; y <= -52 * fy; y += 0.5) ys.push(y);
    const cols = 128;
    const pos = new Float32Array(ys.length * cols * 3);
    ys.forEach((y, j) => {
      for (let i = 0; i < cols; i++) {
        const th = (i / cols) * Math.PI * 2;
        const [x, z] = bodyAt(y, th);
        const r = Math.hypot(x, z);
        const k = (j * cols + i) * 3;
        const off = 0.6 + 0.12 * Math.sin(th * 9 + y * 0.3);
        pos[k] = x + (x / r) * off;
        pos[k + 1] = y;
        pos[k + 2] = z + (z / r) * off;
      }
    });
    add(gridGeometry(pos, ys.length, cols), denim);
    const LEG: readonly (readonly [number, number])[] = [
      [-160, 5.8],
      [-120, 6.4],
      [-100, 7.6],
      [-84, 8.7],
      [-74, 9.3],
      [-62, 9.4],
    ];
    for (const dir of [-1, 1]) {
      const rings: Ring[] = [];
      for (let y = -62 * fy; y >= -160; y -= 1) {
        rings.push({
          c: new THREE.Vector3(dir * 8.4 * fx, y, -0.6 * fx),
          d: new THREE.Vector3(0, -1, 0),
          r: cosInterp(LEG, y / fy, 1) * fx,
          ex: 1.05,
          disp: (phi) => 0.15 * Math.sin(phi * 6 + y * 0.25) * smoothstep(-90, -125, y),
        });
      }
      add(tubeGeometry(rings, 48), denim);
    }
  }

  // ── Shirt body (draped) ──
  const sBody = (shirtChest - 2 * Math.PI * 0.7) / (BODY_CHEST_CM * fx); // radial ease at the chest
  const hemY = -g.length;
  const cols = 180;
  const rows = Math.ceil((g.length + 1) / 0.5);
  const shirtPos = new Float32Array(rows * cols * 3);
  const insideArm = (p: THREE.Vector3) => {
    for (const a of arms) {
      const [d1, t1] = segDist(p, a.S, a.E);
      if (d1 < THREE.MathUtils.lerp(a.rU[0], a.rU[1], t1) + 0.55 && p.y < a.S.y - 15) return true;
      const [d2, t2] = segDist(p, a.E, a.W);
      if (d2 < THREE.MathUtils.lerp(a.rF[0], a.rF[1], t2) + 0.55) return true;
    }
    return false;
  };
  const tmp = new THREE.Vector3();
  for (let i = 0; i < cols; i++) {
    const th = (i / cols) * Math.PI * 2;
    const top = 0.4 - 2.7 * Math.pow(Math.max(0, Math.cos(th)), 3);
    let rhoPrev = Infinity;
    for (let j = rows - 1; j >= 0; j--) {
      const y = hemY + ((top - hemY) * j) / (rows - 1);
      const [bx, bz] = bodyAt(y, th);
      const rb = Math.hypot(bx, bz);
      const nx = bx / rb;
      const nz = bz / rb;
      const w = 1 - smoothstep(-15, -5, y);
      let rho = rb * (1 + (sBody - 1) * w) + 0.7;
      // below the armpits the fabric hangs from the chest / shoulder blades
      if (y < -13 && rhoPrev !== Infinity) rho = Math.max(rho, rhoPrev - 0.012);
      rhoPrev = y < -12 ? rho : Infinity;
      // arms press the fabric in
      tmp.set(nx * rho, y, nz * rho);
      if (insideArm(tmp)) {
        let lo = rb + 0.3;
        let hi = rho;
        for (let it = 0; it < 12; it++) {
          const mid = (lo + hi) / 2;
          tmp.set(nx * mid, y, nz * mid);
          if (insideArm(tmp)) hi = mid;
          else lo = mid;
        }
        rho = lo;
      }
      // folds where the fabric hangs free
      const free = Math.min(1.2, Math.max(0, (rho - rb - 0.8) / 1.8));
      let fold =
        free *
        (0.75 * Math.sin(7 * th + 0.06 * y + 1.3) + 0.45 * Math.sin(12 * th - 0.09 * y + 0.4) + 0.6 * Math.sin(3 * th + 0.025 * y + 2.1));
      fold += 0.35 * gauss((y + 42) / 14) * gauss(Math.sin(th) / 0.75) * Math.sin(4 * th + 0.35 * y);
      const side = gauss(angDiff(th, Math.PI / 2) / 0.4) + gauss(angDiff(th, -Math.PI / 2) / 0.4);
      fold += 0.3 * side * gauss((y + 22) / 6) * Math.sin(0.9 * y + 2.5 * th);
      fold += 0.25 * gauss((y - hemY - 2) / 3) * Math.sin(5 * th + 0.7);
      // never sink into the body — or into the jeans below the waist
      rho = Math.max(rb + 0.35 + 1.85 * fx * smoothstep(-46 * fy, -64 * fy, y), rho + Math.max(-1.6, Math.min(1.6, fold)));
      if (j < 3) rho -= 0.25 * (3 - j) * 0.3;
      const k = (j * cols + i) * 3;
      shirtPos[k] = nx * rho;
      shirtPos[k + 1] = y;
      shirtPos[k + 2] = nz * rho;
    }
  }
  const shirt = add(gridGeometry(shirtPos, rows, cols), cloth);

  // collar rib + hem band along the edges
  const edge = (j: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < cols; i += 2) {
      const k = (j * cols + i) * 3;
      pts.push(new THREE.Vector3(shirtPos[k]!, shirtPos[k + 1]!, shirtPos[k + 2]!));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  };
  add(new THREE.TubeGeometry(edge(rows - 1), 180, 0.55, 10, true), cloth);
  add(new THREE.TubeGeometry(edge(0), 180, 0.3, 8, true), cloth);

  // ── Sleeves ──
  const sleeveLen = (17 + (g.chest - 50) * 0.12) * fy;
  const sleeveGap = 1.1 + (sBody - 1) * 9;
  for (const a of arms) {
    const rings: Ring[] = [];
    const capH = 4.4 * fx;
    const R0 = armR(0) + sleeveGap * 0.85;
    for (let k = 0; k <= 12; k++) {
      const s = capH * (1 - k / 12);
      rings.push({ c: a.S.clone().addScaledVector(a.u1, -s), d: a.u1, r: Math.max(0.05, R0 * Math.sqrt(1 - (s / capH) ** 2)) });
    }
    for (let s = 0.5; s <= sleeveLen; s += 0.5) {
      const flare = 1 + 0.08 * (s / sleeveLen);
      rings.push({
        c: a.S.clone().addScaledVector(a.u1, s),
        d: a.u1,
        r: (armR(-s) + sleeveGap) * flare,
        disp: (phi) => 0.28 * Math.sin(phi * 5 + s * 0.45) * smoothstep(4, sleeveLen, s),
      });
    }
    add(tubeGeometry(rings, 56), cloth);
    const last = rings[rings.length - 1]!;
    const hem = add(new THREE.TorusGeometry(last.r, 0.3, 8, 56), cloth);
    hem.position.copy(last.c);
    hem.quaternion.setFromUnitVectors(Z_AXIS, a.u1);
  }

  // ── Prints (projected onto the draped shirt at their real size) ──
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const side of ["front", "back"] as const) {
    const p = prints[side];
    if (!p) continue;
    const { w, h } = p.rect;
    const sgn = side === "front" ? 1 : -1;
    // seen from the back, the viewer's right is world −x
    const xw = sgn * (p.rect.x + w / 2);
    const yc = -(p.rect.y + h / 2);
    ray.set(new THREE.Vector3(xw, yc, sgn * 200), new THREE.Vector3(0, 0, -sgn));
    const hit = ray.intersectObject(shirt, false)[0];
    const z = hit ? hit.point.z : sgn * 12;
    const geo = keep(
      new DecalGeometry(shirt, new THREE.Vector3(xw, yc, z), new THREE.Euler(0, side === "front" ? 0 : Math.PI, 0), new THREE.Vector3(w, h, 16)),
    );
    const tex = keep(new THREE.CanvasTexture(p.canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = keep(
      new THREE.MeshPhysicalMaterial({
        map: tex,
        transparent: true,
        // DTF ink is opaque and matte: keep the file's real colours (no studio tone curve washing them out)
        roughness: 0.9,
        envMapIntensity: 0.25,
        toneMapped: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    const decal = new THREE.Mesh(geo, mat);
    decal.receiveShadow = true;
    root.add(decal);
  }

  // ── Studio lights (turn with the view) ──
  const rig = new THREE.Group();
  rig.add(new THREE.HemisphereLight("#ffffff", "#8c8c8c", 0.25));
  const key = new THREE.DirectionalLight("#fffaf2", 2.7);
  key.position.set(110, 170, 230);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -90, right: 90, top: 90, bottom: -110, near: 10, far: 700 });
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 1.1;
  rig.add(key);
  const fill = new THREE.DirectionalLight("#eef3ff", 0.7);
  fill.position.set(-230, 40, 150);
  rig.add(fill);
  const rim = new THREE.DirectionalLight("#ffffff", 1.1);
  rim.position.set(-60, 160, -260);
  rig.add(rim);
  root.add(rig);

  return {
    root,
    rig,
    dispose: () => {
      for (const d of trash) d.dispose();
      key.shadow.map?.dispose();
    },
  };
}

/** Soft studio reflections (no download — generated room). Returns a cleanup. */
export function applyStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.42;
  return () => {
    if (scene.environment === env) scene.environment = null;
    env.dispose();
    pmrem.dispose();
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  };
}

/** Still picture of the mannequin from the front or the back (order mockup). */
export async function renderMannequinPng(opts: MannequinOptions, side: TshirtSide, px = 1000): Promise<Blob> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  const built = buildMannequinScene(opts);
  const scene = new THREE.Scene();
  let cleanEnv: (() => void) | null = null;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(px, px, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = new THREE.Color("#f3f4f6");
    cleanEnv = applyStudioEnvironment(renderer, scene);
    scene.add(built.root);
    const a = side === "front" ? 0 : Math.PI;
    built.rig.rotation.y = a;
    const cam = new THREE.PerspectiveCamera(MANNEQUIN_CAMERA.fov, 1, 1, 2000);
    cam.position.set(Math.sin(a) * MANNEQUIN_CAMERA.distance, MANNEQUIN_CAMERA.height, Math.cos(a) * MANNEQUIN_CAMERA.distance);
    cam.lookAt(MANNEQUIN_TARGET.x, MANNEQUIN_TARGET.y, MANNEQUIN_TARGET.z);
    renderer.render(scene, cam);
    return await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas_blob"))), "image/png"),
    );
  } finally {
    cleanEnv?.();
    built.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
