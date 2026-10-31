"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildNotebook, type NotebookPrintArea } from "@/lib/notebook/notebookGeometry";
import { NOTEBOOK_LOOK_DEFAULTS, parseNotebookLook, type NotebookLook } from "@/lib/notebook/notebookLook";
import { applyNotebookLookMaterials, disposeNotebookMaterials, notebookCoverGrain } from "@/lib/notebook/notebookLookMaterials";
import { GRAIN_TILE_CM, grainNormalMap } from "@/lib/three/surfaceTextures";
import { NOTEBOOK_UNIT_PER_CM } from "@/lib/notebook/notebookGeometry";

export type NotebookModelProps = {
  /** Design on the front cover; null = bare notebook. */
  texture: THREE.Texture | null;
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  look?: Partial<NotebookLook> | null;
  /** Physical print size; omitted = the whole printable zone. */
  print?: NotebookPrintArea | null;
};

/** Parsed look + what the camera needs to frame it. */
export function useNotebookLook(look?: Partial<NotebookLook> | null): NotebookLook {
  return useMemo(() => parseNotebookLook({ ...NOTEBOOK_LOOK_DEFAULTS, ...(look ?? {}) }), [look]);
}

/** One notebook built from its look, coloured, with the design on the front cover. */
export function NotebookModel({
  texture,
  coverColorHex,
  strapColorHex,
  bookmarkColorHex,
  look,
  print,
}: NotebookModelProps) {
  const l = useNotebookLook(look);
  const printW = print?.widthCm;
  const printH = print?.heightCm;

  const nb = useMemo(() => {
    const built = buildNotebook(l, printW && printH ? { widthCm: printW, heightCm: printH } : null);
    applyNotebookLookMaterials(built.group, {
      coverColorHex,
      strapColorHex,
      bookmarkColorHex,
      look: l,
      accent: built.accent,
    });
    return built;
  }, [l, printW, printH, coverColorHex, strapColorHex, bookmarkColorHex]);

  useEffect(() => () => disposeNotebookMaterials(nb.group), [nb]);

  const p = nb.label;
  const labelGeom = useMemo(() => new THREE.PlaneGeometry(p.width, p.height), [p.width, p.height]);
  useEffect(() => () => labelGeom.dispose(), [labelGeom]);

  // The print takes the cover's grain and sheen, so it reads as printed on it, not stuck on top.
  const labelMat = useMemo(() => {
    const g = notebookCoverGrain(l.finish);
    const tile = GRAIN_TILE_CM[g.kind] * NOTEBOOK_UNIT_PER_CM;
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: l.finish === "leather" ? 0.6 : 0.85,
        metalness: 0,
        normalMap: grainNormalMap(g.kind, p.width / tile, p.height / tile),
        normalScale: new THREE.Vector2(g.scale, g.scale),
        map: texture,
        transparent: true,
        // The strap is physically above the print: let it hide the print where it crosses.
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
  }, [texture, l.finish, p.width, p.height]);
  useEffect(
    () => () => {
      labelMat.normalMap?.dispose();
      labelMat.dispose();
    },
    [labelMat],
  );

  return (
    <group position={[0, -nb.thickness / 2, 0]}>
      <primitive object={nb.group} />
      {texture && (
        <mesh
          geometry={labelGeom}
          material={labelMat}
          position={[p.x, p.y, p.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
        />
      )}
    </group>
  );
}

/** Half extents for `MugCameraFit` while the notebook spins on the table. */
export function notebookFrameExtents(look: NotebookLook): {
  halfHeight: number;
  halfWidth: number;
  floorY: number;
  shadowScale: number;
  shadowFar: number;
} {
  const built = buildNotebook(look);
  disposeNotebookMaterials(built.group);
  return {
    halfHeight: built.thickness / 2,
    // A little air, and the near edge looks bigger in perspective.
    halfWidth: built.footprintRadius * 1.02,
    floorY: -built.thickness / 2,
    shadowScale: built.footprintRadius * 2.6,
    // Pen on top of the cover sits a little higher than the cover itself.
    shadowFar: built.thickness * 2 + 0.01,
  };
}
