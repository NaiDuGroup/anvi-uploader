"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useLanguageStore } from "@/stores/useLanguageStore";

interface Mug3DPreviewProps {
  canvasElement: HTMLCanvasElement | null;
}

/*
 * plain_mug.glb — Sketchfab export with a -90° X root rotation (Z-up → Y-up).
 *
 * Mesh-local vertex bbox:
 *   X: −0.061 … 0.061   Y: −0.061 … 0.122   Z: 0.003 … 0.153
 *
 * After root rotation (x,y,z)→(x,z,−y), WORLD-space bbox:
 *   X: −0.061 … 0.061   Y: 0.003 … 0.153   Z: −0.122 … 0.061
 *
 * Body cylinder (world):  centre (0, 0.078, 0),  radius ≈ 0.061
 * Handle protrudes toward −Z  (Z ≈ −0.122)
 */

const BODY_RADIUS = 0.061;
const BODY_CENTER_Y = 0.078;

const LABEL_RADIUS = BODY_RADIUS + 0.0008;
const LABEL_HEIGHT = 0.15 * 0.97;
const LABEL_SEGMENTS = 128;

const HANDLE_GAP_DEG = 60;
const LABEL_ARC_DEG = 360 - HANDLE_GAP_DEG;
const LABEL_ARC_RAD = THREE.MathUtils.degToRad(LABEL_ARC_DEG);

// Handle at −Z → CylinderGeometry theta=PI points toward −Z
const LABEL_START_THETA =
  Math.PI + THREE.MathUtils.degToRad(HANDLE_GAP_DEG / 2);

function MugWithLabel({
  canvasElement,
}: {
  canvasElement: HTMLCanvasElement | null;
}) {
  const { scene } = useGLTF("/plain_mug.glb");
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  const cloned = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xf5f5f0,
          roughness: 0.3,
          metalness: 0.0,
        });
      }
    });
    return s;
  }, [scene]);

  const texture = useMemo(() => {
    if (!canvasElement) return null;
    const tex = new THREE.CanvasTexture(canvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;
    return tex;
  }, [canvasElement]);

  useFrame(() => {
    if (textureRef.current) textureRef.current.needsUpdate = true;
  });

  const labelGeom = useMemo(() => {
    return new THREE.CylinderGeometry(
      LABEL_RADIUS,
      LABEL_RADIUS,
      LABEL_HEIGHT,
      LABEL_SEGMENTS,
      1,
      true,
      LABEL_START_THETA,
      LABEL_ARC_RAD,
    );
  }, []);

  const labelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.0,
        map: texture,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [texture],
  );

  // No PI rotation needed: handle already points toward −Z (away from camera).
  // Single group shifts the body centre to the origin.
  return (
    <group position={[0, -BODY_CENTER_Y, 0]}>
      <primitive object={cloned} />
      <mesh
        geometry={labelGeom}
        material={labelMat}
        position={[0, BODY_CENTER_Y, 0]}
      />
    </group>
  );
}

export function Mug3DPreview({ canvasElement }: Mug3DPreviewProps) {
  const { t } = useLanguageStore();

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100"
        style={{ height: 340 }}
      >
        <Canvas
          camera={{ position: [0, 0.04, 0.42], fov: 28 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          style={{ touchAction: "none" }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 4, 5]} intensity={1.0} />
          <directionalLight position={[-3, 2, -2]} intensity={0.3} />
          <Suspense fallback={null}>
            <MugWithLabel canvasElement={canvasElement} />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 1.8}
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
