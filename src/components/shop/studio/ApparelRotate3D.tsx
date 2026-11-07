"use client";

/**
 * The 3D turn of a T-shirt / polo (lazy, `ApparelRotate`): the garment photos
 * with the design (front and back composites) on an "inflated" mesh built from
 * the photo cut-out (`inflatedGarment.ts`) — no 3D model, the real garment.
 * Drag to turn; Front / 3/4 / Back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ShopLang } from "@/lib/storefront/i18n";
import { studioApparelT } from "@/lib/studio/i18n.apparel";
import { buildInflatedGarment } from "@/lib/studio/inflatedGarment";
import type { Raster } from "@/lib/studio/photoMockup";
import { maskRaster } from "./apparelPhoto";
import type { ApparelPhotoViews } from "./useApparelPhotos";

const MASK_N = 200;
const TEX_PX = 1024;

/** n × n cut-out of a mask raster (inside ≥ 128). */
function gridMask(mask: Raster, n: number): Uint8Array {
  const m = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx: number = Math.min(mask.width - 1, Math.round(((x + 0.5) / n) * mask.width));
      const sy: number = Math.min(mask.height - 1, Math.round(((y + 0.5) / n) * mask.height));
      m[y * n + x] = mask.data[(sy * mask.width + sx) * 4]! >= 128 ? 1 : 0;
    }
  return m;
}

/**
 * Texture of a composite: alpha = the cut-out, the garment colour bled out over
 * the background so mip-maps and the steep edge never pick up the white.
 */
function textureCanvas(src: HTMLCanvasElement, mask: Raster): HTMLCanvasElement {
  const n: number = TEX_PX;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, n, n);
  const img = ctx.getImageData(0, 0, n, n);
  const d = img.data;
  const filled = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx: number = Math.min(mask.width - 1, Math.floor((x / n) * mask.width));
      const sy: number = Math.min(mask.height - 1, Math.floor((y / n) * mask.height));
      const a: number = mask.data[(sy * mask.width + sx) * 4]!;
      // Opaque: the silhouette is the mesh's own edge (alpha-tested edges left white specks).
      d[(y * n + x) * 4 + 3] = 255;
      filled[y * n + x] = a >= 250 ? 1 : 0;
    }
  // Trusted colour: 2 px inside the cut-out; then grow it outwards ~14 px.
  for (let pass = 0; pass < 2; pass++) {
    const prev: Uint8Array = filled.slice();
    for (let i = n; i < n * n - n; i++) if (prev[i] && (!prev[i - 1] || !prev[i + 1] || !prev[i - n] || !prev[i + n])) filled[i] = 0;
  }
  for (let pass = 0; pass < 20; pass++) {
    const prev: Uint8Array = filled.slice();
    for (let i = n; i < n * n - n; i++) {
      if (prev[i]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (const j of [i - 1, i + 1, i - n, i + n]) {
        if (!prev[j]) continue;
        r += d[j * 4]!;
        g += d[j * 4 + 1]!;
        b += d[j * 4 + 2]!;
        k++;
      }
      if (!k) continue;
      d[i * 4] = r / k;
      d[i * 4 + 1] = g / k;
      d[i * 4 + 2] = b / k;
      filled[i] = 1;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

interface Built {
  geometry: THREE.BufferGeometry;
  front: THREE.CanvasTexture;
  back: THREE.CanvasTexture;
}

function build(front: HTMLCanvasElement, back: HTMLCanvasElement, views: ApparelPhotoViews): Built | null {
  const f = views.front;
  const b = views.back;
  if (!f || !b) return null;
  const fm: Raster = maskRaster({ maps: f.maps, size: f.photo.width });
  const bm: Raster = maskRaster({ maps: b.maps, size: b.photo.width });
  const mesh = buildInflatedGarment(gridMask(fm, MASK_N), gridMask(bm, MASK_N), MASK_N, { thickness: 0.12, round: 0.3 });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.addGroup(0, mesh.frontIndexCount, 0);
  geometry.addGroup(mesh.frontIndexCount, mesh.indices.length - mesh.frontIndexCount, 1);
  geometry.computeVertexNormals();
  const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { geometry, front: tex(textureCanvas(front, fm)), back: tex(textureCanvas(back, bm)) };
}

function HeadLight() {
  const light = useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();
  const off = useMemo(() => new THREE.Vector3(-0.6, 0.8, 0), []);
  useFrame(() => {
    // Light from the viewer: face-on the photo keeps its own light, the sides fall off.
    light.current?.position.copy(camera.position).add(off);
  });
  return <directionalLight ref={light} intensity={0.36 * Math.PI} />;
}

function Garment({ built }: { built: Built }) {
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: built.front, roughness: 0.95, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: built.back, roughness: 0.95, metalness: 0 }),
    ],
    [built],
  );
  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose());
      built.geometry.dispose();
      built.front.dispose();
      built.back.dispose();
    },
    [materials, built],
  );
  return <mesh geometry={built.geometry} material={materials} position={[0, 0.02, 0]} />;
}

/** Furthest turn from straight front / back (the edge-on view of the "inflated" photo looks fake). */
const TURN_LIMIT = (55 * Math.PI) / 180;

/** A narrow (phone) frame: the camera steps back so the sleeves stay in view. */
function FitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const aspect: number = size.width / Math.max(1, size.height);
    const r: number = 2.35 / Math.min(1, Math.max(0.5, aspect * 1.05));
    const cur: number = camera.position.length();
    if (cur > 0) camera.position.multiplyScalar(r / cur);
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

/**
 * Front / 3/4 / Back turns (eased), and the turn limit: the view stays within
 * ±55° of the front or of the back (the edge-on view of the "inflated" photo
 * looks fake) — the controls' azimuth range is set around the side in view
 * (wrapping around the back); the buttons lift it while they turn.
 */
type TurnSide = "front" | "back" | "free";

/** The controls' azimuth range for a side. */
function sideRange(side: TurnSide): { min: number; max: number } {
  if (side === "free") return { min: -Infinity, max: Infinity };
  if (side === "front") return { min: -TURN_LIMIT, max: TURN_LIMIT };
  // min > max: the range wraps around ±π.
  return { min: Math.PI - TURN_LIMIT, max: -Math.PI + TURN_LIMIT };
}

function CameraRig({ target, controls, onSide }: { target: { a: number; n: number } | null; controls: React.RefObject<OrbitControlsImpl | null>; onSide: (s: TurnSide) => void }) {
  const { camera, invalidate } = useThree();
  const goal = useRef<number | null>(null);
  const side = useRef<TurnSide | null>(null);
  useEffect(() => {
    goal.current = target ? target.a : null;
    invalidate();
  }, [target, invalidate]);
  const limit = (want: TurnSide) => {
    if (side.current === want) return;
    side.current = want;
    onSide(want);
  };
  useFrame(() => {
    const cur: number = Math.atan2(camera.position.x, camera.position.z);
    if (goal.current == null) {
      limit(Math.abs(cur) > Math.PI / 2 ? "back" : "front");
      return;
    }
    limit("free");
    const r: number = Math.hypot(camera.position.x, camera.position.z);
    const d: number = Math.atan2(Math.sin(goal.current - cur), Math.cos(goal.current - cur));
    const next: number = Math.abs(d) < 0.002 ? goal.current : cur + d * 0.18;
    camera.position.set(Math.sin(next) * r, camera.position.y, Math.cos(next) * r);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    if (next === goal.current) goal.current = null;
    invalidate();
  });
  return null;
}

export function ApparelRotate3D({ front, back, views, lang }: { front: HTMLCanvasElement; back: HTMLCanvasElement; views: ApparelPhotoViews; lang: ShopLang }) {
  const t = studioApparelT(lang);
  const [built, setBuilt] = useState<Built | null>(null);
  const [target, setTarget] = useState<{ a: number; n: number } | null>(null);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [side, setSide] = useState<TurnSide>("front");
  const range = sideRange(side);
  useEffect(() => {
    // After the dialog painted: building takes a moment on a phone.
    const h = window.setTimeout(() => setBuilt(build(front, back, views)), 30);
    return () => window.clearTimeout(h);
  }, [front, back, views]);
  const turn = (a: number) => setTarget((p) => ({ a, n: (p?.n ?? 0) + 1 }));
  return (
    <div className="flex h-full flex-col" data-apparel-3d>
      <div className="relative min-h-0 flex-1" style={{ background: "radial-gradient(circle at 50% 35%, #ffffff 0%, #eef0f3 60%, #dfe3e8 100%)" }}>
        {built ? (
          <Canvas
            flat
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ position: [0, 0.05, 2.35], fov: 30 }}
            gl={{ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true }}
            style={{ position: "absolute", inset: 0, touchAction: "none" }}
            data-apparel-3d-ready
          >
            {/* Physically based lights: intensity × π = the photo's own brightness face-on. */}
            <ambientLight intensity={0.74 * Math.PI} />
            <HeadLight />
            <Garment built={built} />
            <ContactShadows position={[0, -0.53, 0]} opacity={0.35} scale={2} blur={2.6} far={1} resolution={512} frames={1} />
            <OrbitControls ref={controls} enablePan={false} enableDamping dampingFactor={0.12} minAzimuthAngle={range.min} maxAzimuthAngle={range.max} enableZoom minDistance={1.4} maxDistance={5} minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.62} />
            <FitCamera />
            <CameraRig target={target} controls={controls} onSide={setSide} />
          </Canvas>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-(--muted)">…</div>
        )}
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-(--muted2)">{t("rotateHint")}</span>
      </div>
      <div className="flex justify-center gap-2 border-t border-(--line2) p-2">
        {(
          [
            ["front", 0, t("viewFront")],
            ["34", -0.75, t("rotate34")],
            ["back", Math.PI, t("viewBack")],
          ] as const
        ).map(([id, a, label]) => (
          <button key={id} type="button" data-apparel-turn={id} onClick={() => turn(a)} className="min-h-11 min-w-20 rounded-xl border-[1.5px] border-(--line2) px-3 text-sm font-bold">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
