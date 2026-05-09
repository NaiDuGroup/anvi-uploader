import * as THREE from "three";

/**
 * GLB with separate meshes: `Mug_Body`, `Mug_Handle`, `Mug_Inside`, `Mug_Fringe` (rim).
 * Same outer bounds as legacy `mug_separated.glb` for label placement.
 */
export const MUG_GLB_URL = "/mug_full_separated.glb";

export const MUG_MESH_BODY = "Mug_Body";
export const MUG_MESH_HANDLE = "Mug_Handle";
export const MUG_MESH_INSIDE = "Mug_Inside";
export const MUG_MESH_FRINGE = "Mug_Fringe";

export const MUG_BODY_COLOR_HEX = "#f5f5f0";

/** Ceramic-ish neutral when no preference is stored. */
export const DEFAULT_MUG_HANDLE_COLOR_HEX = "#a8a29e";

/** Quick-pick swatches for admin (hex #RRGGBB). */
export const MUG_HANDLE_PRESET_HEXES = [
  "#c0392b",
  "#2980b9",
  "#27ae60",
  "#2c3e50",
  "#a8a29e",
] as const;

export interface MugCeramicMaterialOptions {
  bodyColorHex?: string;
  handleColorHex: string;
  /** Interior (`Mug_Inside`); null/undefined → same as body */
  innerColorHex?: string | null;
  /** Rim lip (`Mug_Fringe`); null/undefined → same as body */
  rimColorHex?: string | null;
}

/**
 * Assigns non-shared materials so body, handle, inside, and rim can use different colors.
 */
export function applyMugCeramicMaterials(
  root: THREE.Object3D,
  options: MugCeramicMaterialOptions,
): void {
  const bodyHex = options.bodyColorHex ?? MUG_BODY_COLOR_HEX;
  const bodyColor = new THREE.Color(bodyHex);
  const handleColor = new THREE.Color(options.handleColorHex);
  const innerColor = new THREE.Color(options.innerColorHex ?? bodyHex);
  const rimColor = new THREE.Color(options.rimColorHex ?? bodyHex);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    let color: THREE.Color;
    if (child.name === MUG_MESH_HANDLE) color = handleColor;
    else if (child.name === MUG_MESH_INSIDE) color = innerColor;
    else if (child.name === MUG_MESH_FRINGE) color = rimColor;
    else color = bodyColor;

    child.material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.0,
    });
  });
}
