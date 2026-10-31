"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Soft studio reflections built in the browser (no HDR download), so glossy,
 * metallic and glitter mugs have something to reflect.
 */
export function MugStudioEnvironment({ intensity = 0.6 }: { intensity?: number }) {
  const get = useThree((s) => s.get);

  useLayoutEffect(() => {
    const { gl, scene } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      envMap.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [get, intensity]);

  return null;
}

/**
 * Puts the camera just far enough (along `direction`) for the whole mug to
 * fit, handle included, whatever the canvas proportions: narrow canvases
 * (phones, the admin side column) pull back, wide ones come closer.
 */
export function MugCameraFit({
  direction,
  halfHeight,
  halfWidth,
  fovDeg,
}: {
  direction: [number, number, number];
  halfHeight: number;
  halfWidth: number;
  fovDeg: number;
}) {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const [dx, dy, dz] = direction;

  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    const aspect = width / height;
    const dist = Math.max(halfHeight / tanHalf, halfWidth / (tanHalf * aspect));
    const dir = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(dist);
    get().camera.position.copy(dir);
  }, [get, width, height, dx, dy, dz, halfHeight, halfWidth, fovDeg]);

  return null;
}
