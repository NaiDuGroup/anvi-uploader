"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MugCameraFit } from "@/app/mug/_components/MugStudioEnvironment";
import { ProductStudio } from "@/app/mug/_components/ProductStudio";
import {
  CANVAS_BOX_FACES,
  canvasBoxPrintPoint,
  canvasPrintUv,
  canvasWrapMirrors,
  coverCrop,
  LF_CANVAS_STRETCHER_BAR_CM,
  type CanvasBoxDims,
} from "@/lib/storefront/lfVisual";
import { browserPreviewMaxSide } from "@/lib/studio/previewSize";
import { GRAIN_TILE_CM, grainNormalMap } from "@/lib/three/surfaceTextures";

/**
 * Rotatable 3D stretched canvas: a box of the real proportions (face × frame
 * depth), the customer's picture on the face and the same mirrored wrap as
 * the flat preview / print file on the sides, the stretcher and the raw
 * canvas on the back. Performance as `StudioLive3D`: loaded on demand,
 * `frameloop="demand"`, dpr ≤ 1.5, one texture of ≤ 1024–1536 px redrawn only
 * when the size or the picture changes.
 */
export interface LfCanvas3DProps {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  wrapCm: number;
  /** Full-size local object URL when available, else the small thumbnail; null → neutral face. */
  imageUrl: string | null;
  className?: string;
  /** WebGL missing or the scene failed: the page shows the flat preview instead. */
  onFail?: () => void;
}

/** Scene units: the long side of the face is 2 units. */
const SCENE_LONG = 2;
const CAMERA_DIRECTION: [number, number, number] = [1.25, 0.32, 3.1];
const CAMERA_FOV = 28;
const BG = "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)";

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Draws the print (face + mirrored wrap) to `canvas` at `k` px per cm. */
function drawPrint(canvas: HTMLCanvasElement, d: CanvasBoxDims, k: number, img: HTMLImageElement | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { widthCm: W, heightCm: H, wrapCm: w } = d;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const face = (c: CanvasRenderingContext2D) => {
    if (img && img.naturalWidth > 0) {
      const s = coverCrop(img.naturalWidth, img.naturalHeight, W, H);
      c.drawImage(img, s.sx, s.sy, s.sw, s.sh, w * k, w * k, W * k, H * k);
    } else {
      // No picture (or a PDF): a neutral face with a soft gradient, sides the same.
      const g = c.createLinearGradient(w * k, w * k, (w + W) * k, (w + H) * k);
      g.addColorStop(0, "#eef0f4");
      g.addColorStop(1, "#dfe3ea");
      c.fillStyle = g;
      c.fillRect(w * k, w * k, W * k, H * k);
    }
  };
  face(ctx);
  for (const m of canvasWrapMirrors(W, H, w)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.clip.x * k, m.clip.y * k, m.clip.w * k, m.clip.h * k);
    ctx.clip();
    const [a, b, c, dd, e, f] = m.m;
    ctx.transform(a, b, c, dd, e * k, f * k);
    face(ctx);
    ctx.restore();
  }
}

/** The back: canvas folded over the bars (with staples), the wooden stretcher, the raw canvas inside. */
function drawBack(canvas: HTMLCanvasElement, d: CanvasBoxDims, k: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { widthCm: W, heightCm: H, depthCm: D, wrapCm: w } = d;
  const fold: number = Math.max(0.5, w - D);
  const bar: number = Math.max(fold + 1, LF_CANVAS_STRETCHER_BAR_CM);
  ctx.fillStyle = "#efe9dc";
  ctx.fillRect(0, 0, W * k, H * k);
  // Wooden bars (the frame) + a cross bar on big frames.
  ctx.fillStyle = "#c9a46c";
  const bars: [number, number, number, number][] = [
    [0, 0, W, bar],
    [0, H - bar, W, bar],
    [0, 0, bar, H],
    [W - bar, 0, bar, H],
  ];
  if (W >= 90) bars.push([W / 2 - bar / 2, 0, bar, H]);
  if (H >= 90) bars.push([0, H / 2 - bar / 2, W, bar]);
  for (const [x, y, bw, bh] of bars) ctx.fillRect(x * k, y * k, bw * k, bh * k);
  ctx.strokeStyle = "rgba(120,80,30,.25)";
  ctx.lineWidth = Math.max(1, k * 0.15);
  for (const [x, y, bw, bh] of bars) ctx.strokeRect(x * k, y * k, bw * k, bh * k);
  // The canvas folded onto the bars, stapled.
  ctx.fillStyle = "#e4ddcc";
  ctx.fillRect(0, 0, W * k, fold * k);
  ctx.fillRect(0, (H - fold) * k, W * k, fold * k);
  ctx.fillRect(0, 0, fold * k, H * k);
  ctx.fillRect((W - fold) * k, 0, fold * k, H * k);
  ctx.fillStyle = "#8d939c";
  const step = 8;
  const sw: number = Math.max(1, 1.2 * k);
  const sh: number = Math.max(1, 0.25 * k);
  for (let x = step / 2; x < W; x += step) {
    ctx.fillRect(x * k - sw / 2, (fold / 2) * k - sh / 2, sw, sh);
    ctx.fillRect(x * k - sw / 2, (H - fold / 2) * k - sh / 2, sw, sh);
  }
  for (let y = step / 2; y < H; y += step) {
    ctx.fillRect((fold / 2) * k - sh / 2, y * k - sw / 2, sh, sw);
    ctx.fillRect((W - fold / 2) * k - sh / 2, y * k - sw / 2, sh, sw);
  }
}

/** Upload the redrawn canvas on the next frame (once per change, never per frame). */
function markUploaded(tex: THREE.Texture): void {
  tex.needsUpdate = true;
}

function newCanvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

/** Box with the print UVs on the face and sides (BoxGeometry: 4 vertices per side). */
function useCanvasBox(d: CanvasBoxDims): THREE.BoxGeometry {
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(d.widthCm, d.heightCm, d.depthCm);
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    CANVAS_BOX_FACES.forEach((face, i) => {
      if (face === "back") return;
      for (let v = i * 4; v < i * 4 + 4; v++) {
        const [u, vv] = canvasPrintUv(canvasBoxPrintPoint(face, pos.getX(v), pos.getY(v), pos.getZ(v), d), d);
        uv.setXY(v, u, vv);
      }
    });
    uv.needsUpdate = true;
    return g;
  }, [d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

function CanvasModel({ d, print, back, version }: { d: CanvasBoxDims; print: THREE.Texture; back: THREE.Texture; version: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const geo = useCanvasBox(d);
  // Fine cotton weave, barely there (the UVs span the whole print: face + wrap).
  const weave = useMemo(
    () => grainNormalMap("weave", (d.widthCm + 2 * d.wrapCm) / GRAIN_TILE_CM.weave, (d.heightCm + 2 * d.wrapCm) / GRAIN_TILE_CM.weave),
    [d.widthCm, d.heightCm, d.wrapCm],
  );
  useEffect(() => () => weave.dispose(), [weave]);
  useEffect(() => {
    invalidate();
  }, [version, geo, invalidate]);
  const s: number = SCENE_LONG / Math.max(d.widthCm, d.heightCm);
  return (
    <mesh geometry={geo} scale={[s, s, s]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={print}
          roughness={0.88}
          metalness={0}
          normalMap={weave}
          normalScale={new THREE.Vector2(0.12, 0.12)}
        />
      ))}
      <meshStandardMaterial attach="material-5" map={back} roughness={0.95} metalness={0} />
    </mesh>
  );
}

class GlBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LfCanvas3D({ widthCm, heightCm, depthCm, wrapCm, imageUrl, className, onFail }: LfCanvas3DProps) {
  const [maxSide] = useState<number>(() => browserPreviewMaxSide());
  const [webgl] = useState<boolean>(() => hasWebGL());
  const d: CanvasBoxDims = useMemo(
    () => ({ widthCm, heightCm, depthCm: Math.min(depthCm, Math.max(0, wrapCm) || depthCm), wrapCm: Math.max(wrapCm, depthCm) }),
    [widthCm, heightCm, depthCm, wrapCm],
  );

  // The picture (async): kept until a new URL loads.
  const [img, setImg] = useState<{ url: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    let live = true;
    const el = new Image();
    el.decoding = "async";
    el.onload = () => {
      if (live) setImg({ url: imageUrl, el });
    };
    el.src = imageUrl;
    return () => {
      live = false;
    };
  }, [imageUrl]);
  const picture: HTMLImageElement | null = imageUrl && img?.url === imageUrl ? img.el : null;

  // GPU textures: one per size (a new size needs a new texture), created in an effect (see StudioLive3D).
  const [gpu, setGpu] = useState<{ print: THREE.CanvasTexture; back: THREE.CanvasTexture; pc: HTMLCanvasElement; k: number } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const tw: number = d.widthCm + 2 * d.wrapCm;
    const th: number = d.heightCm + 2 * d.wrapCm;
    const k: number = maxSide / Math.max(tw, th);
    const pc = document.createElement("canvas");
    pc.width = Math.max(1, Math.round(tw * k));
    pc.height = Math.max(1, Math.round(th * k));
    const bk: number = 512 / Math.max(d.widthCm, d.heightCm);
    const bc = document.createElement("canvas");
    bc.width = Math.max(1, Math.round(d.widthCm * bk));
    bc.height = Math.max(1, Math.round(d.heightCm * bk));
    drawBack(bc, d, bk);
    const print = newCanvasTexture(pc);
    const back = newCanvasTexture(bc);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- GPU resources live with the effect
    setGpu({ print, back, pc, k });
    return () => {
      print.dispose();
      back.dispose();
      pc.width = 0;
      pc.height = 0;
      bc.width = 0;
      bc.height = 0;
    };
  }, [d, maxSide]);
  useEffect(() => {
    if (!gpu) return;
    drawPrint(gpu.pc, d, gpu.k, picture);
    markUploaded(gpu.print);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tells the r3f tree to draw a frame
    setVersion((v) => v + 1);
  }, [gpu, d, picture]);

  useEffect(() => {
    if (!webgl) onFail?.();
  }, [webgl, onFail]);
  if (!webgl) return null;

  const s: number = SCENE_LONG / Math.max(d.widthCm, d.heightCm);
  const halfW: number = (d.widthCm / 2 + d.depthCm) * s;
  const halfH: number = (d.heightCm / 2) * s;
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ background: BG }}>
      {gpu ? (
        <GlBoundary onFail={() => onFail?.()}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: CAMERA_DIRECTION, fov: CAMERA_FOV }}
            gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
            style={{ touchAction: "none", position: "absolute", inset: 0 }}
          >
            <ProductStudio floorY={-halfH} shadowScale={Math.max(halfW, halfH) * 3.2} shadowFar={halfH * 0.8} shadowOpacity={0.35} />
            <MugCameraFit direction={CAMERA_DIRECTION} halfHeight={halfH * 1.12} halfWidth={halfW * 1.12} fovDeg={CAMERA_FOV} />
            {/* Soft fill from behind, so the stretcher side is not lost in shadow. */}
            <directionalLight position={[-2, 2.5, -3]} intensity={0.7} />
            <CanvasModel d={d} print={gpu.print} back={gpu.back} version={version} />
            <OrbitControls
              makeDefault
              enableZoom={false}
              enablePan={false}
              minPolarAngle={Math.PI / 4}
              maxPolarAngle={Math.PI / 2 - 0.02}
              enableDamping
              dampingFactor={0.08}
            />
          </Canvas>
        </GlBoundary>
      ) : null}
    </div>
  );
}

export default LfCanvas3D;
