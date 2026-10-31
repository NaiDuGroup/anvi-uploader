"use client";

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX,
  DEFAULT_NOTEBOOK_COVER_COLOR_HEX,
  DEFAULT_NOTEBOOK_STRAP_COLOR_HEX,
} from "@/lib/notebook/notebook3dMaterials";
import type { NotebookLook } from "@/lib/notebook/notebookLook";
import type { NotebookPrintArea } from "@/lib/notebook/notebookGeometry";
import { MugCameraFit } from "@/app/mug/_components/MugStudioEnvironment";
import { ProductStudio } from "@/app/mug/_components/ProductStudio";
import { NotebookModel, notebookFrameExtents, useNotebookLook } from "./NotebookModel";

interface Notebook3DPreviewProps {
  canvasElement: HTMLCanvasElement | null;
  coverColorHex?: string;
  strapColorHex?: string;
  bookmarkColorHex?: string;
  /** Size, binding, strap, pen…; omitted → the classic A5 hardcover. */
  look?: Partial<NotebookLook> | null;
  /** Physical print size; omitted → the whole printable zone. */
  print?: NotebookPrintArea | null;
  /** Canvas height in px (admin side column uses a shorter one). */
  height?: number;
}

/** The notebook lies on a table: the camera looks down at ~48°, like the old preview. */
export const NOTEBOOK_CAMERA_DIRECTION: [number, number, number] = [0, 0.34, 0.3];
export const NOTEBOOK_CAMERA_FOV = 32;

/** Live design canvas on the cover (repainted every frame while editing). */
function NotebookWithCanvasLabel({
  canvasElement,
  ...rest
}: Omit<Notebook3DPreviewProps, "height"> & { coverColorHex: string; strapColorHex: string; bookmarkColorHex: string }) {
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const texture = useMemo(() => {
    if (!canvasElement) return null;
    const tex = new THREE.CanvasTexture(canvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [canvasElement]);

  useLayoutEffect(() => {
    textureRef.current = texture;
  }, [texture]);

  useFrame(() => {
    if (textureRef.current) textureRef.current.needsUpdate = true;
  });

  return <NotebookModel texture={texture} {...rest} />;
}

export function Notebook3DPreview({
  canvasElement,
  coverColorHex = DEFAULT_NOTEBOOK_COVER_COLOR_HEX,
  strapColorHex = DEFAULT_NOTEBOOK_STRAP_COLOR_HEX,
  bookmarkColorHex = DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX,
  look,
  print,
  height = 380,
}: Notebook3DPreviewProps) {
  const { t } = useLanguageStore();
  const l = useNotebookLook(look);
  const frame = useMemo(() => notebookFrameExtents(l), [l]);

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100"
        style={{ height }}
      >
        <Canvas
          camera={{ position: NOTEBOOK_CAMERA_DIRECTION, fov: NOTEBOOK_CAMERA_FOV }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          style={{ touchAction: "none" }}
        >
          <ProductStudio floorY={frame.floorY} shadowScale={frame.shadowScale} shadowFar={frame.shadowFar} shadowOpacity={0.4} />
          <MugCameraFit
            direction={NOTEBOOK_CAMERA_DIRECTION}
            halfHeight={frame.halfHeight}
            halfWidth={frame.halfWidth}
            fovDeg={NOTEBOOK_CAMERA_FOV}
          />
          <Suspense fallback={null}>
            <NotebookWithCanvasLabel
              canvasElement={canvasElement}
              coverColorHex={coverColorHex}
              strapColorHex={strapColorHex}
              bookmarkColorHex={bookmarkColorHex}
              look={l}
              print={print}
            />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            // ~15°–165°: tilt almost freely, but away from the poles where OrbitControls jerks.
            minPolarAngle={Math.PI / 12}
            maxPolarAngle={Math.PI - Math.PI / 12}
            autoRotate
            autoRotateSpeed={1.5}
            dampingFactor={0.08}
            enableDamping
          />
        </Canvas>
      </div>
      <p className="text-xs text-gray-400 text-center">{t.notebook.rotate3d}</p>
    </div>
  );
}
