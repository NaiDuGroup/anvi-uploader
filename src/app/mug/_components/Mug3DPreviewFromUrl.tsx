"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Loader2 } from "lucide-react";
import { DEFAULT_MUG_HANDLE_COLOR_HEX, MUG_BODY_COLOR_HEX } from "@/lib/mug/mug3dMaterials";
import { mugFrameHalfExtents, mugStage, type MugPrintArea } from "@/lib/mug/mugGeometry";
import { ProductStudio } from "./ProductStudio";
import { MUG_SHAPE_DEFAULTS, parseMugShape, type MugShape } from "@/lib/mug/mugShape";
import type { MugSurface } from "@/lib/mug/mugSurface";
import { MugModel } from "./MugModel";
import {
  MUG_CAMERA_DIRECTION,
  MUG_CAMERA_FOV,
  MUG_ORBIT_MAX_POLAR,
  MUG_ORBIT_MIN_POLAR,
  MugCameraFit,
} from "./MugStudioEnvironment";

interface Mug3DPreviewFromUrlProps {
  imageUrl: string;
  bodyColorHex?: string;
  handleColorHex?: string;
  innerColorHex?: string;
  rimColorHex?: string;
  /** Finish + bottom gradient; omitted → glossy, no gradient. */
  surface?: Partial<MugSurface> | null;
  /** Body sizes + handle style; omitted → standard 330 ml mug. */
  shape?: Partial<MugShape> | null;
  /** Physical print size; omitted → legacy 300° wrap. */
  print?: MugPrintArea | null;
}


function useImageTexture(imageUrl: string): THREE.Texture {
  return useMemo(() => {
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
}

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-3"
        style={{ height: 340 }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function Mug3DPreviewFromUrlInner({
  imageUrl,
  bodyColorHex = MUG_BODY_COLOR_HEX,
  handleColorHex = DEFAULT_MUG_HANDLE_COLOR_HEX,
  innerColorHex = MUG_BODY_COLOR_HEX,
  rimColorHex = MUG_BODY_COLOR_HEX,
  surface,
  shape,
  print,
}: Mug3DPreviewFromUrlProps) {
  const { t } = useLanguageStore();
  const [ready, setReady] = useState(false);
  const texture = useImageTexture(imageUrl);
  const frame = useMemo(
    () => mugFrameHalfExtents(parseMugShape({ ...MUG_SHAPE_DEFAULTS, ...(shape ?? {}) })),
    [shape],
  );
  const stage = useMemo(() => mugStage(parseMugShape({ ...MUG_SHAPE_DEFAULTS, ...(shape ?? {}) })), [shape]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setReady(true);
    img.onerror = () => setReady(true);
    img.src = imageUrl;
  }, [imageUrl]);

  if (!ready) {
    return <LoadingPlaceholder label={t.mug.loading3d} />;
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100"
        style={{ height: 340 }}
      >
        <Canvas
          camera={{ position: MUG_CAMERA_DIRECTION, fov: MUG_CAMERA_FOV }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          style={{ touchAction: "none" }}
        >
          <ProductStudio floorY={stage.floorY} shadowScale={stage.shadowScale} shadowFar={stage.shadowFar} />
          <MugCameraFit
            direction={MUG_CAMERA_DIRECTION}
            halfHeight={frame.halfHeight}
            halfWidth={frame.halfWidth}
            fovDeg={MUG_CAMERA_FOV}
          />
          <Suspense fallback={null}>
            <MugModel
              texture={texture}
              bodyColorHex={bodyColorHex}
              handleColorHex={handleColorHex}
              innerColorHex={innerColorHex}
              rimColorHex={rimColorHex}
              surface={surface}
              shape={shape}
              print={print}
            />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            minPolarAngle={MUG_ORBIT_MIN_POLAR}
            maxPolarAngle={MUG_ORBIT_MAX_POLAR}
            autoRotate
            autoRotateSpeed={1.5}
            dampingFactor={0.08}
            enableDamping
          />
        </Canvas>
      </div>
      <p className="text-xs text-gray-400 text-center">{t.mug.rotate3d}</p>
    </div>
  );
}

/** Remount when `imageUrl` changes so the image-load gate resets without setState in an effect. */
export function Mug3DPreviewFromUrl(props: Mug3DPreviewFromUrlProps) {
  return <Mug3DPreviewFromUrlInner key={props.imageUrl} {...props} />;
}
