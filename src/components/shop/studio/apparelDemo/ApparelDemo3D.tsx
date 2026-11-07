"use client";

/**
 * Apparel visual prototype (`/shop/studio/apparel-3d-demo`, apparel flag):
 * left — the photo mockup (Direction A) computed in the browser; right — the
 * same photos turned into a rotatable "inflated" 3D garment (Direction B).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { apparelPrintBox } from "@/lib/studio/apparelMockup";
import { PHOTO_VIEWS, photoUrl, type Raster } from "@/lib/studio/photoMockup";
import { buildInflatedGarment } from "@/lib/studio/inflatedGarment";
import { drawSampleDesign, type SampleDesign } from "./sampleDesigns";
import { loadRaster, rasterToCanvas, renderPhotoMockup, type PhotoPrint } from "./photoMockupClient";

type GarmentId = "tshirt" | "polo" | "cap" | "body";

interface DemoPrint {
  design: SampleDesign;
  cm: { x: number; y: number; w: number; h: number };
}

interface DemoGarment {
  label: string;
  front: string;
  back: string | null;
  colours: string[];
  frontPrints: DemoPrint[];
  backPrints: DemoPrint[];
  thickness: number;
  round: number;
}

const GARMENTS: Record<GarmentId, DemoGarment> = {
  tshirt: {
    label: "T-shirt DOGO",
    front: "tshirt-front",
    back: "tshirt-back",
    colours: ["01", "02", "60", "55"],
    frontPrints: [{ design: "sunset", cm: apparelPrintBox("tshirt", "front", "front", 21, 29.7) }],
    backPrints: [{ design: "backText", cm: apparelPrintBox("tshirt", "back", "back", 28, 24) }],
    thickness: 0.12,
    round: 0.3,
  },
  polo: {
    label: "Polo AUSTRAL",
    front: "polo-front",
    back: "polo-back",
    colours: ["55", "01", "02", "60"],
    frontPrints: [{ design: "badge", cm: apparelPrintBox("polo", "front", "chest_left", 9, 9) }],
    backPrints: [{ design: "backText", cm: apparelPrintBox("polo", "back", "back", 26, 22) }],
    thickness: 0.12,
    round: 0.3,
  },
  cap: {
    label: "Cap ERIS",
    front: "cap-front",
    back: null,
    colours: ["60", "02", "55", "01"],
    frontPrints: [{ design: "capLockup", cm: apparelPrintBox("cap", "front", "front", 9, 5) }],
    backPrints: [],
    thickness: 0.3,
    round: 0.45,
  },
  body: {
    label: "Body SWEET",
    front: "body-front",
    back: null,
    colours: ["01", "02"],
    frontPrints: [{ design: "babySun", cm: { x: -4.5, y: 3, w: 9, h: 9 } }],
    backPrints: [],
    thickness: 0.12,
    round: 0.3,
  },
};

const HEX: Record<string, string> = { "01": "#ffffff", "02": "#111111", "55": "#001d43", "60": "#DC002E" };
const MASK_N = 220;

function fontFamily(): string {
  const v: string = getComputedStyle(document.querySelector("[data-studio-fonts]") ?? document.body).getPropertyValue("--font-mug-montserrat").trim();
  return v || "Montserrat, sans-serif";
}

function artCanvas(p: DemoPrint, ink: string, font: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  // ~100 px per cm: crisp at the 2000 px photo scale (18–73 px / cm).
  const k: number = Math.min(150, 2400 / Math.max(p.cm.w, p.cm.h));
  c.width = Math.round(p.cm.w * k);
  c.height = Math.round(p.cm.h * k);
  drawSampleDesign(c.getContext("2d")!, p.design, c.width, c.height, ink, font);
  return c;
}

/** n × n garment mask of a (dark) photo, and its full-res alpha written into `into`. */
function maskOf(dark: Raster, n: number): Uint8Array {
  const m = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx: number = Math.min(dark.width - 1, Math.round(((x + 0.5) / n) * dark.width));
      const sy: number = Math.min(dark.height - 1, Math.round(((y + 0.5) / n) * dark.height));
      const i: number = (sy * dark.width + sx) * 4;
      m[y * n + x] = 0.2126 * dark.data[i]! + 0.7152 * dark.data[i + 1]! + 0.0722 * dark.data[i + 2]! < 204 ? 1 : 0;
    }
  return m;
}

/** Scaled copy of a raster (canvas resampling). */
function scaled(r: Raster, size: number): Raster {
  const src: HTMLCanvasElement = rasterToCanvas(r);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: d.data };
}

/**
 * 3D texture of a photo: alpha = the garment cut-out (from the dark photo), and
 * the garment colour bled outwards over the background, so mip-maps and the
 * steep pillow edge never pick up the white studio background (white fringes).
 */
function textureRaster(photo: Raster, dark: Raster, size = 1536): Raster {
  const out: Raster = scaled(photo, size);
  const m: Raster = scaled(dark, size);
  const n: number = size * size;
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l: number = 0.2126 * m.data[i * 4]! + 0.7152 * m.data[i * 4 + 1]! + 0.0722 * m.data[i * 4 + 2]!;
    out.data[i * 4 + 3] = Math.max(0, Math.min(255, (225 - l) * 4));
    // Only well-inside pixels are trusted colour sources (edge ones are mixed with the background).
    filled[i] = l < 120 ? 1 : 0;
  }
  // Erode the trusted set by 2 px, then grow the colour outwards ~24 px.
  for (let pass = 0; pass < 2; pass++) {
    const prev: Uint8Array = filled.slice();
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i: number = y * size + x;
        if (prev[i] && (!prev[i - 1] || !prev[i + 1] || !prev[i - size] || !prev[i + size])) filled[i] = 0;
      }
  }
  for (let pass = 0; pass < 24; pass++) {
    const prev: Uint8Array = filled.slice();
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i: number = y * size + x;
        if (prev[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let k = 0;
        for (const j of [i - 1, i + 1, i - size, i + size]) {
          if (!prev[j]) continue;
          r += out.data[j * 4]!;
          g += out.data[j * 4 + 1]!;
          b += out.data[j * 4 + 2]!;
          k++;
        }
        if (!k) continue;
        out.data[i * 4] = r / k;
        out.data[i * 4 + 1] = g / k;
        out.data[i * 4 + 2] = b / k;
        filled[i] = 1;
      }
  }
  return out;
}

function backUrl(viewId: string, colour: string): string {
  return photoUrl(PHOTO_VIEWS[viewId]!, colour).replace(/_1_1\.jpg$/, "_2_1.jpg");
}

interface Built {
  front2d: HTMLCanvasElement;
  back2d: HTMLCanvasElement | null;
  frontTex: THREE.CanvasTexture;
  backTex: THREE.CanvasTexture;
  geometry: THREE.BufferGeometry;
  ms: { photo: number; mesh: number };
}

/** A canvas styled to fill the photo pane. */
function shown(c: HTMLCanvasElement): HTMLCanvasElement {
  c.style.width = "100%";
  c.style.height = "auto";
  c.style.display = "block";
  return c;
}

async function build(id: GarmentId, colour: string): Promise<Built> {
  const g: DemoGarment = GARMENTS[id];
  const font: string = fontFamily();
  await document.fonts.load(`900 40px ${font}`).catch(() => undefined);
  const ink: string = colour === "01" ? "#14213D" : "#ffffff";
  const prints = (ps: DemoPrint[]): PhotoPrint[] => ps.map((p) => ({ cm: p.cm, art: artCanvas(p, p.design === "babySun" ? "#E4572E" : ink, font) }));
  const front = await renderPhotoMockup(g.front, colour, prints(g.frontPrints));
  const back = g.back ? await renderPhotoMockup(g.back, colour, prints(g.backPrints)) : { raster: await loadRaster(backUrl(g.front, colour)), ms: 0 };
  const cal = PHOTO_VIEWS[g.front]!;
  const darkFront: Raster = await loadRaster(photoUrl(cal, cal.maskColour));
  const darkBack: Raster = await loadRaster(g.back ? photoUrl(PHOTO_VIEWS[g.back]!, cal.maskColour) : backUrl(g.front, cal.maskColour));
  const t0: number = performance.now();
  const mesh = buildInflatedGarment(maskOf(darkFront, MASK_N), maskOf(darkBack, MASK_N), MASK_N, { thickness: g.thickness, round: g.round });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.addGroup(0, mesh.frontIndexCount, 0);
  geometry.addGroup(mesh.frontIndexCount, mesh.indices.length - mesh.frontIndexCount, 1);
  geometry.computeVertexNormals();
  const tex = (r: Raster): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(rasterToCanvas(r));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const frontTex = tex(textureRaster(front.raster, darkFront));
  const backTex = tex(textureRaster(back.raster, darkBack));
  const meshMs: number = performance.now() - t0;
  return {
    front2d: shown(rasterToCanvas(front.raster)),
    back2d: g.back ? shown(rasterToCanvas(back.raster)) : null,
    frontTex,
    backTex,
    geometry,
    ms: { photo: Math.round(front.ms + back.ms), mesh: Math.round(meshMs) },
  };
}

function HeadLight() {
  const light = useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();
  useFrame(() => {
    // Light from the viewer (slightly above-left): the photographed light stays as shot, the sides fall off.
    light.current?.position.copy(camera.position).add(new THREE.Vector3(-0.6, 0.8, 0));
  });
  return <directionalLight ref={light} intensity={0.36 * Math.PI} />;
}

function Garment({ built }: { built: Built }) {
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: built.frontTex, alphaTest: 0.02, roughness: 0.95, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: built.backTex, alphaTest: 0.02, roughness: 0.95, metalness: 0 }),
    ],
    [built],
  );
  return <mesh geometry={built.geometry} material={materials} position={[0, 0.02, 0]} />;
}

function CameraRig({ azimuth, controls }: { azimuth: number | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera, invalidate } = useThree();
  const target = useRef<number | null>(null);
  useEffect(() => {
    target.current = azimuth;
    invalidate();
  }, [azimuth, invalidate]);
  useFrame(() => {
    if (target.current == null) return;
    const r: number = Math.hypot(camera.position.x, camera.position.z);
    const cur: number = Math.atan2(camera.position.x, camera.position.z);
    let d: number = target.current - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const next: number = Math.abs(d) < 0.002 ? target.current : cur + d * 0.18;
    camera.position.set(Math.sin(next) * r, camera.position.y, Math.cos(next) * r);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    if (next === target.current) target.current = null;
    invalidate();
  });
  return null;
}

export function ApparelDemo3D() {
  const [garment, setGarment] = useState<GarmentId>("tshirt");
  const [colour, setColour] = useState<string>("02");
  // Results are keyed by garment + colour: a stale one is simply not shown.
  const key = `${garment}-${colour}`;
  const [result, setResult] = useState<{ key: string; built: Built | null; error: string | null } | null>(null);
  const built: Built | null = result?.key === key ? result.built : null;
  const error: string | null = result?.key === key ? result.error : null;
  const [azimuth, setAzimuth] = useState<{ a: number; n: number } | null>(null);
  const [show2d, setShow2d] = useState<"front" | "back">("front");
  const controls = useRef<OrbitControlsImpl | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const t0: number = performance.now();
    (window as unknown as { __demoReady?: boolean }).__demoReady = false;
    build(garment, colour)
      .then((b) => {
        if (!live) return;
        setResult({ key: `${garment}-${colour}`, built: b, error: null });
        setLoadMs(Math.round(performance.now() - t0));
        setTimeout(() => ((window as unknown as { __demoReady?: boolean }).__demoReady = true), 400);
      })
      .catch((e: unknown) => live && setResult({ key: `${garment}-${colour}`, built: null, error: String(e) }));
    return () => {
      live = false;
    };
  }, [garment, colour]);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    el.replaceChildren();
    const c = show2d === "back" && built?.back2d ? built.back2d : built?.front2d;
    if (c) el.appendChild(c);
  }, [built, show2d]);

  const g: DemoGarment = GARMENTS[garment];
  const colours: string[] = g.colours;
  const turn = (a: number) => setAzimuth((p) => ({ a, n: (p?.n ?? 0) + 1 }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold">Apparel visual prototype</h1>
      <p className="mt-1 text-sm text-neutral-500">A — supplier photo + print with fabric shading; B — the same photos as a rotatable 3D garment.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="controls">
        {(Object.keys(GARMENTS) as GarmentId[]).map((id) => (
          <button
            key={id}
            type="button"
            data-garment={id}
            onClick={() => {
              setGarment(id);
              setColour(GARMENTS[id].colours[0]!);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${garment === id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            {GARMENTS[id].label}
          </button>
        ))}
        <span className="mx-2 h-6 w-px bg-neutral-200" />
        {colours.map((c) => (
          <button
            key={c}
            type="button"
            data-colour={c}
            aria-label={`colour ${c}`}
            onClick={() => setColour(c)}
            className={`h-8 w-8 rounded-full border-2 ${colour === c ? "border-sky-500 ring-2 ring-sky-200" : "border-neutral-300"}`}
            style={{ background: HEX[c] ?? "#ccc" }}
          />
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-3" data-testid="photo-pane">
          <div className="mb-2 flex items-center justify-between text-sm">
            <b>A · Photo mockup</b>
            <span className="flex gap-1">
              <button type="button" data-2d="front" onClick={() => setShow2d("front")} className={`rounded px-2 py-0.5 ${show2d === "front" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
                Front
              </button>
              {built?.back2d ? (
                <button type="button" data-2d="back" onClick={() => setShow2d("back")} className={`rounded px-2 py-0.5 ${show2d === "back" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
                  Back
                </button>
              ) : null}
            </span>
          </div>
          <div ref={holder} className="aspect-square w-full overflow-hidden rounded-xl bg-white" />
        </section>
        <section className="rounded-2xl border border-neutral-200 bg-white p-3" data-testid="three-pane">
          <div className="mb-2 flex items-center justify-between text-sm">
            <b>B · 3D (drag to turn)</b>
            <span className="flex gap-1">
              <button type="button" data-turn="front" onClick={() => turn(0)} className="rounded bg-neutral-100 px-2 py-0.5">
                Front
              </button>
              <button type="button" data-turn="34" onClick={() => turn(-0.75)} className="rounded bg-neutral-100 px-2 py-0.5">
                3/4
              </button>
              <button type="button" data-turn="back" onClick={() => turn(Math.PI)} className="rounded bg-neutral-100 px-2 py-0.5">
                Back
              </button>
            </span>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl" style={{ background: "radial-gradient(circle at 50% 35%, #ffffff 0%, #eef0f3 60%, #dfe3e8 100%)" }}>
            {built ? (
              <Canvas flat frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 0.05, 2.35], fov: 30 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
                {/* Physically based lights: intensity x PI = the photo brightness face-on. */}
                <ambientLight intensity={0.74 * Math.PI} />
                <HeadLight />
                <Garment built={built} />
                <ContactShadows position={[0, -0.53, 0]} opacity={0.35} scale={2} blur={2.6} far={1} resolution={512} frames={1} />
                <OrbitControls ref={controls} enablePan={false} enableZoom minDistance={1.4} maxDistance={3.2} minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.62} />
                <CameraRig azimuth={azimuth ? azimuth.a : null} controls={controls} />
              </Canvas>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm text-neutral-500">Loading photos…</div>
            )}
          </div>
        </section>
      </div>
      {built ? (
        <p className="mt-3 text-xs text-neutral-500" data-testid="timings">
          Load + build {loadMs} ms · print compositing {built.ms.photo} ms · mesh {built.ms.mesh} ms · photos 2000 px from static.gorfactory.es
        </p>
      ) : null}
    </div>
  );
}
