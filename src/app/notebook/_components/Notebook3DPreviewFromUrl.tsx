"use client";

import { Suspense, useMemo, useRef, useLayoutEffect, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Loader2 } from "lucide-react";
import {
  applyNotebookMaterials,
  DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX,
  DEFAULT_NOTEBOOK_COVER_COLOR_HEX,
  DEFAULT_NOTEBOOK_STRAP_COLOR_HEX,
  NOTEBOOK_GLB_URL,
  NOTEBOOK_MESH_COVER,
} from "@/lib/notebook/notebook3dMaterials";

interface Notebook3DPreviewFromUrlProps {
  imageUrl: string;
  coverColorHex?: string;
  strapColorHex?: string;
  bookmarkColorHex?: string;
}

const PRINT_INSET_RATIO = 0.92;
const PRINT_OFFSET = 0.0008;

interface OverlayPlacement {
  size: { x: number; y: number };
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

function computeOverlayPlacement(root: THREE.Object3D): OverlayPlacement | null {
  let cover: THREE.Mesh | null = null;
  root.traverse((c) => {
    if (cover) return;
    if (c instanceof THREE.Mesh && c.name === NOTEBOOK_MESH_COVER) {
      cover = c;
    }
  });
  if (!cover) return null;
  const coverMesh = cover as THREE.Mesh;

  const box = new THREE.Box3().setFromObject(coverMesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const dims = [
    { axis: "x" as const, val: size.x },
    { axis: "y" as const, val: size.y },
    { axis: "z" as const, val: size.z },
  ].sort((a, b) => a.val - b.val);

  const thicknessAxis = dims[0].axis;

  if (thicknessAxis === "z") {
    return {
      size: { x: size.x * PRINT_INSET_RATIO, y: size.y * PRINT_INSET_RATIO },
      position: new THREE.Vector3(center.x, center.y, box.max.z + PRINT_OFFSET),
      rotation: new THREE.Euler(0, 0, 0),
    };
  }
  if (thicknessAxis === "y") {
    return {
      size: { x: size.x * PRINT_INSET_RATIO, y: size.z * PRINT_INSET_RATIO },
      position: new THREE.Vector3(center.x, box.max.y + PRINT_OFFSET, center.z),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
    };
  }
  return {
    size: { x: size.z * PRINT_INSET_RATIO, y: size.y * PRINT_INSET_RATIO },
    position: new THREE.Vector3(box.max.x + PRINT_OFFSET, center.y, center.z),
    rotation: new THREE.Euler(0, Math.PI / 2, 0),
  };
}

function NotebookWithImageLabel({
  imageUrl,
  coverColorHex,
  strapColorHex,
  bookmarkColorHex,
}: {
  imageUrl: string;
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
}) {
  const { scene } = useGLTF(NOTEBOOK_GLB_URL);

  const cloned = useMemo(() => {
    const s = scene.clone(true);
    applyNotebookMaterials(s, {
      coverColorHex,
      strapColorHex,
      bookmarkColorHex,
    });
    return s;
  }, [scene, coverColorHex, strapColorHex, bookmarkColorHex]);

  const placement = useMemo(() => computeOverlayPlacement(cloned), [cloned]);

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

  const textureRef = useRef<THREE.Texture | null>(null);
  useLayoutEffect(() => {
    textureRef.current = texture;
  }, [texture]);

  useFrame(() => {
    if (textureRef.current) textureRef.current.needsUpdate = false;
  });

  const labelGeom = useMemo(() => {
    if (!placement) return null;
    return new THREE.PlaneGeometry(placement.size.x, placement.size.y);
  }, [placement]);

  const labelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.0,
        map: texture,
        transparent: true,
        // Honest depth-test against the opaque strap mesh: where the strap is
        // physically closer to the camera, it must occlude the print overlay.
        depthWrite: false,
      }),
    [texture],
  );

  const fitGroup = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 0.32;
    const scale = targetSize / maxDim;
    return { center, scale };
  }, [cloned]);

  return (
    <group scale={fitGroup.scale} position={[-fitGroup.center.x, -fitGroup.center.y, -fitGroup.center.z]}>
      <primitive object={cloned} />
      {placement && labelGeom && (
        <mesh
          geometry={labelGeom}
          material={labelMat}
          position={[placement.position.x, placement.position.y, placement.position.z]}
          rotation={placement.rotation}
          renderOrder={-1}
        />
      )}
    </group>
  );
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
}: Notebook3DPreviewFromUrlProps) {
  const { t } = useLanguageStore();
  const [ready, setReady] = useState(false);

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
          // The notebook GLB lies flat (cover normal = +Y). Higher camera Y +
          // closer Z gives a "3/4 from above" presentation angle so the cover
          // face fills most of the frame instead of the side/spine.
          camera={{ position: [0.0, 0.34, 0.3], fov: 32 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          style={{ touchAction: "none" }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 4, 5]} intensity={1.0} />
          <directionalLight position={[-3, 2, -2]} intensity={0.3} />
          <Suspense fallback={null}>
            <NotebookWithImageLabel
              imageUrl={imageUrl}
              coverColorHex={coverColorHex}
              strapColorHex={strapColorHex}
              bookmarkColorHex={bookmarkColorHex}
            />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            // ~15°–165° — почти полная свобода наклона, но без полюсов,
            // где OrbitControls склонен к рывкам у "gimbal lock"-граней.
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

useGLTF.preload(NOTEBOOK_GLB_URL);
