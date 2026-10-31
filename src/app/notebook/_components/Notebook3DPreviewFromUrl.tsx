"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Loader2 } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX,
  DEFAULT_NOTEBOOK_COVER_COLOR_HEX,
  DEFAULT_NOTEBOOK_STRAP_COLOR_HEX,
} from "@/lib/notebook/notebook3dMaterials";
import type { NotebookLook } from "@/lib/notebook/notebookLook";
import type { NotebookPrintArea } from "@/lib/notebook/notebookGeometry";
import { MugCameraFit, MugStudioEnvironment } from "@/app/mug/_components/MugStudioEnvironment";
import { NotebookModel, notebookFrameExtents, useNotebookLook } from "./NotebookModel";
import { NOTEBOOK_CAMERA_DIRECTION, NOTEBOOK_CAMERA_FOV } from "./Notebook3DPreview";

interface Notebook3DPreviewFromUrlProps {
  imageUrl: string;
  coverColorHex?: string;
  strapColorHex?: string;
  bookmarkColorHex?: string;
  look?: Partial<NotebookLook> | null;
  print?: NotebookPrintArea | null;
}

function NotebookWithImageLabel({
  imageUrl,
  ...rest
}: Omit<Notebook3DPreviewFromUrlProps, "coverColorHex" | "strapColorHex" | "bookmarkColorHex"> & {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
}) {
  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(imageUrl, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [imageUrl]);
  useEffect(() => () => texture.dispose(), [texture]);

  return <NotebookModel texture={texture} {...rest} />;
}

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-3"
        style={{ height: 380 }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function Notebook3DPreviewFromUrlInner({
  imageUrl,
  coverColorHex = DEFAULT_NOTEBOOK_COVER_COLOR_HEX,
  strapColorHex = DEFAULT_NOTEBOOK_STRAP_COLOR_HEX,
  bookmarkColorHex = DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX,
  look,
  print,
}: Notebook3DPreviewFromUrlProps) {
  const { t } = useLanguageStore();
  const [ready, setReady] = useState(false);
  const l = useNotebookLook(look);
  const frame = useMemo(() => notebookFrameExtents(l), [l]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setReady(true);
    img.onerror = () => setReady(true);
    img.src = imageUrl;
  }, [imageUrl]);

  if (!ready) {
    return <LoadingPlaceholder label={t.notebook.loading3d} />;
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100"
        style={{ height: 380 }}
      >
        <Canvas
          camera={{ position: NOTEBOOK_CAMERA_DIRECTION, fov: NOTEBOOK_CAMERA_FOV }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          style={{ touchAction: "none" }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 5, 4]} intensity={1.1} />
          <directionalLight position={[-3, 2, -2]} intensity={0.3} />
          <MugStudioEnvironment intensity={0.35} />
          <MugCameraFit
            direction={NOTEBOOK_CAMERA_DIRECTION}
            halfHeight={frame.halfHeight}
            halfWidth={frame.halfWidth}
            fovDeg={NOTEBOOK_CAMERA_FOV}
          />
          <Suspense fallback={null}>
            <NotebookWithImageLabel
              imageUrl={imageUrl}
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

export function Notebook3DPreviewFromUrl(props: Notebook3DPreviewFromUrlProps) {
  return <Notebook3DPreviewFromUrlInner key={props.imageUrl} {...props} />;
}
