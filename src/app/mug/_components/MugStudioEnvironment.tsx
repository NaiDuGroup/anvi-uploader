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
 * Camera for every mug preview: about 22° above the rim, like a product photo,
 * so the coloured inside and the rim read at first glance.
 */
const MUG_CAMERA_ELEVATION_DEG = 22;
export const MUG_CAMERA_DIRECTION: [number, number, number] = [
  0,
  Math.sin(THREE.MathUtils.degToRad(MUG_CAMERA_ELEVATION_DEG)),
  Math.cos(THREE.MathUtils.degToRad(MUG_CAMERA_ELEVATION_DEG)),
];
export const MUG_CAMERA_FOV = 28;
/** Orbit limits (from straight above): drag to look down into the mug or level with it. */
export const MUG_ORBIT_MIN_POLAR = Math.PI / 5;
export const MUG_ORBIT_MAX_POLAR = Math.PI / 2;

/**
 * Puts the camera just far enough (along `direction`) for the whole mug to
 * fit, handle included, whatever the canvas proportions: narrow canvases
 * (phones, the admin side column) pull back, wide ones come closer.
 * Seen from above, the rim / base ovals and a handle turned towards the
 * camera add height, so the vertical extent grows with the elevation.
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
    const elevation = Math.atan2(dy, Math.hypot(dx, dz));
    const seenHalfHeight = halfHeight * Math.cos(elevation) + halfWidth * Math.sin(elevation);
    const dist = Math.max(seenHalfHeight / tanHalf, halfWidth / (tanHalf * aspect));
    const dir = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(dist);
    get().camera.position.copy(dir);
  }, [get, width, height, dx, dy, dz, halfHeight, halfWidth, fovDeg]);

  return null;
}
