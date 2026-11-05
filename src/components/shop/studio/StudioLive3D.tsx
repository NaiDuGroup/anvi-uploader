"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MugModel } from "@/app/mug/_components/MugModel";
import { colorsFromProduct, type MugProductOption } from "@/app/mug/_components/MugProductPicker";
import {
  MUG_CAMERA_DIRECTION,
  MUG_CAMERA_FOV,
  MUG_ORBIT_MAX_POLAR,
  MUG_ORBIT_MIN_POLAR,
  MugCameraFit,
} from "@/app/mug/_components/MugStudioEnvironment";
import { ProductStudio } from "@/app/mug/_components/ProductStudio";
import { NOTEBOOK_CAMERA_DIRECTION, NOTEBOOK_CAMERA_FOV } from "@/app/notebook/_components/Notebook3DPreview";
import { NotebookModel, notebookFrameExtents, useNotebookLook } from "@/app/notebook/_components/NotebookModel";
import { colorsFromNotebookProduct, type NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import { mugFrameHalfExtents, mugLabelPlacement, mugStage } from "@/lib/mug/mugGeometry";
import { MUG_SHAPE_DEFAULTS, parseMugShape } from "@/lib/mug/mugShape";
import { findLayer, type StudioDoc, type StudioKind } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { mugFacingRotation, mugLayerTheta, nearestAngle } from "@/lib/studio/mugFocus";
import { MAGIC_COLD_HEX, mugOpeningU, mugThetaOfU } from "@/lib/studio/mugViews";
import { browserPreviewMaxSide } from "@/lib/studio/previewSize";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";
import type { StudioCatalogItem } from "./StudioApp";

/**
 * Live 3D preview of the Studio design on the real product model (the
 * catalog mug / notebook built from its sizes, no GLB). Performance:
 * `frameloop="demand"` — a frame is drawn only when the design changes, the
 * mug turns or the user drags; the design texture is a small canvas
 * (1024–1536 px, iPhone canvas limits) redrawn and uploaded only when
 * `version` changes, never per frame. The pen has no 3D model: a flat view.
 */
export interface StudioLive3DProps {
  kind: StudioKind;
  item: StudioCatalogItem | null;
  spec: StudioSurfaceSpec;
  doc: StudioDoc;
  renderAssets: StudioRenderAssets;
  version: number;
  focusLayerId?: string | null;
  /** Colour of the chosen product variant (wins over the catalog item's body colour: the pen strip). */
  productColor?: string | null;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  /** Mug: turn to this wrap position (0 = left edge … 1 = right edge); a new `n` turns again (view buttons). */
  viewRequest?: { u: number; n: number } | null;
  /** Magic mug: black when cold, the print when hot (null: an ordinary mug). */
  magic?: "cold" | "hot" | null;
}

/** Texture canvas size for the print area at this long side. */
function textureSize(spec: StudioSurfaceSpec, maxSide: number): { w: number; h: number } {
  const k: number = maxSide / Math.max(spec.widthMm, spec.heightMm);
  return { w: Math.max(1, Math.round(spec.widthMm * k)), h: Math.max(1, Math.round(spec.heightMm * k)) };
}

/** Upload the redrawn canvas on the next frame (once per design change, never per frame). */
function markUploaded(tex: THREE.Texture): void {
  tex.needsUpdate = true;
}

/** Keeps the texture canvas in step with the design (inside the r3f tree: it can `invalidate`). */
function TextureSync({
  canvas,
  texture,
  doc,
  spec,
  renderAssets,
  version,
  maxSide,
  onReady,
  cold = false,
}: {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  renderAssets: StudioRenderAssets;
  version: number;
  maxSide: number;
  onReady?: () => void;
  cold?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const ready = useRef(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  useEffect(() => {
    renderPreviewCanvas(doc, spec, renderAssets, maxSide, canvas);
    if (cold) {
      // A cold magic mug: the coating hides the print.
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = MAGIC_COLD_HEX;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    markUploaded(texture);
    invalidate();
    if (!ready.current) {
      ready.current = true;
      onReadyRef.current?.();
    }
  }, [canvas, texture, doc, spec, renderAssets, version, maxSide, invalidate, cold]);
  return null;
}

/**
 * The mug, turned with damping so the edited part of the wrap (or the part a
 * view button asks for) faces the camera. It opens turned to `opening` (the
 * main photo) at once, without a spin.
 */
function FocusSpin({
  target,
  view,
  opening,
  children,
}: {
  target: number | null;
  view: { theta: number; n: number } | null;
  opening: number | null;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as { getAzimuthalAngle?: () => number } | null;
  const goal = useRef<number | null>(null);
  const opened = useRef(false);
  const turnTo = (theta: number, now: boolean) => {
    const g = group.current;
    const azimuth: number = controls?.getAzimuthalAngle?.() ?? 0;
    const want: number = mugFacingRotation(theta, azimuth);
    if (now && g) {
      g.rotation.y = want;
      goal.current = null;
    } else goal.current = g ? nearestAngle(g.rotation.y, want) : want;
    invalidate();
  };
  const turnRef = useRef(turnTo);
  useEffect(() => {
    turnRef.current = turnTo;
  });
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (target == null && opening != null) turnRef.current(opening, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the mug first shows
  }, []);
  useEffect(() => {
    if (target != null) turnRef.current(target, false);
  }, [target, controls]);
  const viewN: number | null = view?.n ?? null;
  const viewTheta: number | null = view?.theta ?? null;
  useEffect(() => {
    if (viewN != null && viewTheta != null) turnRef.current(viewTheta, false);
  }, [viewN, viewTheta]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || goal.current == null) return;
    const d: number = goal.current - g.rotation.y;
    if (Math.abs(d) < 0.002) {
      g.rotation.y = goal.current;
      goal.current = null;
      return;
    }
    g.rotation.y += d * Math.min(1, dt * 6);
    invalidate();
  });
  return <group ref={group}>{children}</group>;
}

function MugScene({
  item,
  texture,
  focusTheta,
  view,
  opening,
  magic,
}: {
  item: StudioCatalogItem | null;
  texture: THREE.CanvasTexture;
  focusTheta: number | null;
  view: { theta: number; n: number } | null;
  opening: number | null;
  magic: "cold" | "hot" | null;
}) {
  const base = colorsFromProduct((item ?? undefined) as MugProductOption | undefined);
  // Magic mug: the coating is black when cold and turns clear (white ceramic) when hot; the handle stays black.
  const c = magic ? { ...base, bodyColorHex: magic === "cold" ? MAGIC_COLD_HEX : "#ffffff", handleColorHex: MAGIC_COLD_HEX } : base;
  const shape = useMemo(() => parseMugShape({ ...MUG_SHAPE_DEFAULTS, ...(c.shape ?? {}) }), [c.shape]);
  const frame = useMemo(() => mugFrameHalfExtents(shape), [shape]);
  const stage = useMemo(() => mugStage(shape), [shape]);
  return (
    <>
      <ProductStudio floorY={stage.floorY} shadowScale={stage.shadowScale} shadowFar={stage.shadowFar} />
      <MugCameraFit direction={MUG_CAMERA_DIRECTION} halfHeight={frame.halfHeight} halfWidth={frame.halfWidth} fovDeg={MUG_CAMERA_FOV} />
      <Suspense fallback={null}>
        <FocusSpin target={focusTheta} view={view} opening={opening}>
          <MugModel
            texture={texture}
            bodyColorHex={c.bodyColorHex}
            handleColorHex={c.handleColorHex}
            innerColorHex={c.innerColorHex}
            rimColorHex={c.rimColorHex}
            surface={c.surface}
            shape={c.shape}
            print={c.print}
          />
        </FocusSpin>
      </Suspense>
    </>
  );
}

function NotebookScene({ item, texture }: { item: StudioCatalogItem | null; texture: THREE.CanvasTexture }) {
  const c = colorsFromNotebookProduct((item ?? undefined) as NotebookProductOption | undefined);
  const look = useNotebookLook(c.look);
  const frame = useMemo(() => notebookFrameExtents(look), [look]);
  return (
    <>
      <ProductStudio floorY={frame.floorY} shadowScale={frame.shadowScale} shadowFar={frame.shadowFar} shadowOpacity={0.4} />
      <MugCameraFit direction={NOTEBOOK_CAMERA_DIRECTION} halfHeight={frame.halfHeight} halfWidth={frame.halfWidth} fovDeg={NOTEBOOK_CAMERA_FOV} />
      <Suspense fallback={null}>
        <NotebookModel
          texture={texture}
          coverColorHex={c.coverColorHex}
          strapColorHex={c.strapColorHex}
          bookmarkColorHex={c.bookmarkColorHex}
          look={look}
          print={c.print}
        />
      </Suspense>
    </>
  );
}

/** Flat view (the pen, or a product without a 3D model): the design on a light product-coloured strip. */
function FlatPreview({
  kind,
  doc,
  spec,
  renderAssets,
  version,
  productColor,
  className,
  style,
  onReady,
  cold = false,
}: {
  kind: StudioKind;
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  renderAssets: StudioRenderAssets;
  version: number;
  productColor: string;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  cold?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useRef(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  useEffect(() => {
    if (!ref.current) return;
    renderPreviewCanvas(doc, spec, renderAssets, 900, ref.current);
    if (cold) {
      const ctx = ref.current.getContext("2d");
      if (ctx) {
        ctx.fillStyle = MAGIC_COLD_HEX;
        ctx.fillRect(0, 0, ref.current.width, ref.current.height);
      }
    }
    if (!ready.current) {
      ready.current = true;
      onReadyRef.current?.();
    }
  }, [doc, spec, renderAssets, version, cold]);
  const pen: boolean = kind === "pen";
  return (
    <div className={`flex items-center justify-center overflow-hidden ${className ?? ""}`} style={{ minHeight: 120, ...style }}>
      <div
        className={pen ? "flex items-center rounded-full px-[6%] py-[3%] shadow-[0_8px_20px_rgba(20,33,61,0.18)]" : "shadow-[0_8px_20px_rgba(20,33,61,0.15)]"}
        style={{
          background: pen ? `linear-gradient(180deg, #ffffff 0%, ${productColor} 35%, ${productColor} 65%, rgba(20,33,61,0.25) 100%)` : productColor,
          width: pen ? "86%" : "auto",
          maxWidth: "100%",
        }}
      >
        <canvas ref={ref} className="block h-auto w-full" style={{ maxHeight: pen ? 140 : 360 }} />
      </div>
    </div>
  );
}

export function StudioLive3D({
  kind,
  item,
  spec,
  doc,
  renderAssets,
  version,
  focusLayerId,
  productColor: variantColor,
  autoRotate = false,
  interactive = true,
  className,
  style,
  onReady,
  viewRequest = null,
  magic = null,
}: StudioLive3DProps) {
  const has3d: boolean = kind !== "pen" && item?.has3dPreview !== false;
  const [maxSide] = useState<number>(() => browserPreviewMaxSide());
  const size = textureSize(spec, maxSide);
  const docRef = useRef(doc);
  const specRef = useRef(spec);
  const assetsRef = useRef(renderAssets);
  useEffect(() => {
    docRef.current = doc;
    specRef.current = spec;
    assetsRef.current = renderAssets;
  });
  // One canvas + one texture per texture size (a new size needs a new GPU texture).
  // Created in an effect, not memoized: React (dev Strict Mode, remounts) runs the
  // cleanup and the effect again, and the r3f tree inside <Canvas> is a separate
  // root that does not replay its own effects — a memoized canvas zeroed by the
  // cleanup stayed 0×0 (black mug) until the next design change.
  const [gpu, setGpu] = useState<{ canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = size.w;
    c.height = size.h;
    renderPreviewCanvas(docRef.current, specRef.current, assetsRef.current, maxSide, c);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- GPU resources live with the effect
    setGpu({ canvas: c, texture: tex });
    return () => {
      tex.dispose();
      // Free the backing store right away (iOS counts canvas memory until GC).
      c.width = 0;
      c.height = 0;
    };
  }, [size.w, size.h, maxSide]);
  const canvas: HTMLCanvasElement | null = gpu?.canvas ?? null;
  const texture: THREE.CanvasTexture | null = gpu?.texture ?? null;

  // Print placement on the 3D mug (θ of the wrap's left edge and its arc).
  const placement = useMemo(() => {
    if (kind !== "mug") return null;
    const c = colorsFromProduct((item ?? undefined) as MugProductOption | undefined);
    const shape = parseMugShape({ ...MUG_SHAPE_DEFAULTS, ...(c.shape ?? {}) });
    return mugLabelPlacement(shape, c.print);
  }, [kind, item]);

  // Where the mug should turn: the focused layer's centre on the wrap.
  const focusTheta: number | null = useMemo(() => {
    if (!placement) return null;
    const layer = findLayer(doc, focusLayerId);
    if (!layer) return null;
    const surface = doc.surfaces.find((s) => s.layers.some((l) => l.id === layer.id)) ?? doc.surfaces[0]!;
    return mugLayerTheta(layer, surface, placement.thetaStart, placement.thetaLength);
  }, [placement, doc, focusLayerId]);
  // Where it opens: the main photo (largest one), else the front.
  const [openingU] = useState<number>(() => mugOpeningU(doc, spec));
  const opening: number | null = placement ? mugThetaOfU(openingU, placement.thetaStart, placement.thetaLength) : null;
  const view = useMemo(
    () => (placement && viewRequest ? { theta: mugThetaOfU(viewRequest.u, placement.thetaStart, placement.thetaLength), n: viewRequest.n } : null),
    [placement, viewRequest],
  );

  const productColor: string =
    (magic ? (magic === "cold" ? MAGIC_COLD_HEX : "#ffffff") : null) ??
    variantColor ??
    (typeof item?.bodyColorHex === "string" ? item.bodyColorHex : null) ??
    (typeof item?.coverColorHex === "string" ? item.coverColorHex : null) ??
    "#f3f5f8";

  if (has3d && (!canvas || !texture)) {
    return <div className={className} style={{ minHeight: 120, background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)", ...style }} aria-busy="true" />;
  }
  if (!has3d || !canvas || !texture) {
    return (
      <FlatPreview
        kind={kind}
        doc={doc}
        spec={spec}
        renderAssets={renderAssets}
        version={version}
        productColor={productColor}
        className={className}
        style={style}
        onReady={onReady}
        cold={magic === "cold"}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ minHeight: 120, background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)", ...style }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: kind === "mug" ? MUG_CAMERA_DIRECTION : NOTEBOOK_CAMERA_DIRECTION, fov: kind === "mug" ? MUG_CAMERA_FOV : NOTEBOOK_CAMERA_FOV }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ touchAction: interactive ? "none" : "auto", pointerEvents: interactive ? "auto" : "none", position: "absolute", inset: 0 }}
      >
        <TextureSync canvas={canvas} texture={texture} doc={doc} spec={spec} renderAssets={renderAssets} version={version} maxSide={maxSide} onReady={onReady} cold={magic === "cold"} />
        {kind === "mug" ? (
          <MugScene item={item} texture={texture} focusTheta={focusTheta} view={view} opening={opening} magic={magic} />
        ) : (
          <NotebookScene item={item} texture={texture} />
        )}
        <OrbitControls
          makeDefault
          enabled={interactive}
          enableZoom={false}
          enablePan={false}
          minPolarAngle={kind === "mug" ? MUG_ORBIT_MIN_POLAR : Math.PI / 12}
          maxPolarAngle={kind === "mug" ? MUG_ORBIT_MAX_POLAR : Math.PI - Math.PI / 12}
          autoRotate={autoRotate}
          autoRotateSpeed={1.5}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  );
}

export default StudioLive3D;
