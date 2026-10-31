"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

/**
 * Photo-studio look for product previews (mugs, notebooks), built in the
 * browser — nothing is downloaded:
 *
 * - Reflections come from softboxes (a big one overhead, strips on the sides),
 *   so glossy ceramic, metallic and leather get the long soft highlights of a
 *   product shot instead of a flat grey room.
 * - A soft contact shadow puts the item on a table.
 * - Neutral tone mapping keeps catalog colours (HEX) as they are; the default
 *   filmic curve washes light colours out and crushes dark ones.
 */
export function ProductStudio({
  floorY,
  shadowScale,
  shadowFar,
  shadowOpacity = 0.5,
}: {
  /** Where the item stands (scene units). */
  floorY: number;
  /** Width of the shadow area around the item (scene units). */
  shadowScale: number;
  /** How far above the floor parts still cast a shadow (scene units). */
  shadowFar: number;
  shadowOpacity?: number;
}) {
  const get = useThree((s) => s.get);

  useLayoutEffect(() => {
    const { gl } = get();
    const prev = { mapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1;
    return () => {
      gl.toneMapping = prev.mapping;
      gl.toneMappingExposure = prev.exposure;
    };
  }, [get]);

  return (
    <>
      {/* Key light for shape (a softbox from the upper front-right), a touch of fill. */}
      <directionalLight position={[2.5, 4, 3]} intensity={0.9} />
      <ambientLight intensity={0.12} />
      <Environment resolution={256} frames={1} environmentIntensity={0.85}>
        {/* Darker surroundings than the softboxes, so white ceramic keeps soft grey turns at its sides. */}
        <color attach="background" args={["#9a9a9a"]} />
        {/* Big overhead softbox. */}
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        {/* Tall strips left and right: the long vertical highlights on a mug. */}
        <Lightformer form="rect" intensity={3} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[1.2, 8, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[1.2, 8, 1]} />
        {/* Low front fill so the side facing the camera isn't dull. */}
        <Lightformer form="rect" intensity={0.8} position={[0, 0.5, 6]} scale={[10, 1.5, 1]} />
      </Environment>
      <ContactShadows
        position={[0, floorY + 0.0005, 0]}
        scale={shadowScale}
        far={shadowFar}
        blur={2.2}
        opacity={shadowOpacity}
        resolution={512}
        color="#3a3a3a"
      />
    </>
  );
}
