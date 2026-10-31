"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { applyMugCeramicMaterials } from "@/lib/mug/mug3dMaterials";
import { buildMug, type MugPrintArea } from "@/lib/mug/mugGeometry";
import { MUG_SHAPE_DEFAULTS, parseMugShape, type MugShape } from "@/lib/mug/mugShape";
import type { MugSurface } from "@/lib/mug/mugSurface";

export type MugModelProps = {
  /** Design wrapped around the body; null = bare mug. */
  texture: THREE.Texture | null;
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string;
  rimColorHex: string;
  surface?: Partial<MugSurface> | null;
  shape?: Partial<MugShape> | null;
  /** Physical print size; omitted = legacy 300° wrap. */
  print?: MugPrintArea | null;
};

/** One mug built from its sizes, coloured, with the design wrapped on the front. */
export function MugModel({
  texture,
  bodyColorHex,
  handleColorHex,
  innerColorHex,
  rimColorHex,
  surface,
  shape,
  print,
}: MugModelProps) {
  const s: MugShape = useMemo(() => parseMugShape({ ...MUG_SHAPE_DEFAULTS, ...(shape ?? {}) }), [shape]);
  const printW = print?.widthCm;
  const printH = print?.heightCm;

  const mug = useMemo(() => {
    const built = buildMug(s, printW && printH ? { widthCm: printW, heightCm: printH } : null);
    applyMugCeramicMaterials(built.group, {
      bodyColorHex,
      handleColorHex,
      innerColorHex,
      rimColorHex,
      surface,
    });
    return built;
  }, [s, printW, printH, bodyColorHex, handleColorHex, innerColorHex, rimColorHex, surface]);

  useEffect(
    () => () => {
      mug.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
    [mug],
  );

  const l = mug.label;
  const labelGeom = useMemo(
    () =>
      new THREE.CylinderGeometry(l.radiusTop, l.radiusBottom, l.height, 128, 1, true, l.thetaStart, l.thetaLength),
    [l.radiusTop, l.radiusBottom, l.height, l.thetaStart, l.thetaLength],
  );

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
    <group position={[0, -mug.height / 2, 0]}>
      <primitive object={mug.group} />
      {/* No design yet (e.g. admin catalog preview): show the bare mug, not a blank white wrap. */}
      {texture && <mesh geometry={labelGeom} material={labelMat} position={[0, l.centerY, 0]} />}
    </group>
  );
}
