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
 * Pull the camera back when the canvas is narrower than it is tall, so the
 * whole mug (handle included) stays in frame, e.g. in the admin side column.
 * Wider canvases keep the original framing.
 */
export function MugCameraFit({
  basePosition,
  minAspect = 1,
}: {
  basePosition: [number, number, number];
  minAspect?: number;
}) {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const [x, y, z] = basePosition;

  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return;
    const k = Math.max(1, minAspect / (width / height));
    get().camera.position.set(x * k, y * k, z * k);
  }, [get, width, height, x, y, z, minAspect]);

  return null;
}
