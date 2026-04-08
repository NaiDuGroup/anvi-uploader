"use client";

import { Suspense, useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useLanguageStore } from "@/stores/useLanguageStore";

interface Mug3DPreviewFromUrlProps {
  imageUrl: string;
}

const BODY_RADIUS = 0.061;
const BODY_CENTER_Y = 0.078;

const LABEL_RADIUS = BODY_RADIUS + 0.0008;
const LABEL_HEIGHT = 0.15 * 0.97;
const LABEL_SEGMENTS = 128;

const HANDLE_GAP_DEG = 60;
const LABEL_ARC_DEG = 360 - HANDLE_GAP_DEG;
const LABEL_ARC_RAD = THREE.MathUtils.degToRad(LABEL_ARC_DEG);

const LABEL_START_THETA =
  Math.PI + THREE.MathUtils.degToRad(HANDLE_GAP_DEG / 2);

function MugWithImageLabel({ imageUrl }: { imageUrl: string }) {
  const { scene } = useGLTF("/plain_mug.glb");
  const textureRef = useRef<THREE.Texture | null>(null);

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
    const tex = new THREE.TextureLoader().load(imageUrl, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;
    return tex;
  }, [imageUrl]);

  useFrame(() => {
    if (textureRef.current) textureRef.current.needsUpdate = false;
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

export function Mug3DPreviewFromUrl({ imageUrl }: Mug3DPreviewFromUrlProps) {
  const { t } = useLanguageStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setReady(true);
    img.src = imageUrl;
  }, [imageUrl]);

  if (!ready) return null;

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
            <MugWithImageLabel imageUrl={imageUrl} />
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
