import * as THREE from "three";
import { MUG_SURFACE_DEFAULTS, type MugFinish, type MugSurface } from "./mugSurface";

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
  /** Finish + bottom gradient; omitted → glossy, no gradient. */
  surface?: Partial<MugSurface> | null;
}

/** PBR settings per finish (the inside always stays plain glossy ceramic). */
const FINISH_PARAMS: Record<
  MugFinish,
  { roughness: number; metalness: number; clearcoat: number; glitter: boolean }
> = {
  glossy: { roughness: 0.35, metalness: 0, clearcoat: 0.6, glitter: false },
  matte: { roughness: 0.9, metalness: 0, clearcoat: 0, glitter: false },
  metallic: { roughness: 0.28, metalness: 1, clearcoat: 0.3, glitter: false },
  glitter: { roughness: 0.4, metalness: 0.75, clearcoat: 0.5, glitter: true },
};

/** Flakes per metre along each axis (~1 mm flakes on a 12 cm mug). */
const GLITTER_DENSITY = 900;
const GLITTER_STRENGTH = 1.4;

type SurfaceUniforms = {
  uMeshToRoot: { value: THREE.Matrix4 };
  uMinY: { value: number };
  uMaxY: { value: number };
  uGradOn: { value: number };
  uGradColor: { value: THREE.Color };
  uGradEnd: { value: number };
  uGlitterOn: { value: number };
};

const VERTEX_DECL = /* glsl */ `
uniform mat4 uMeshToRoot;
varying vec3 vMugPos;
`;

const FRAGMENT_DECL = /* glsl */ `
uniform float uMinY;
uniform float uMaxY;
uniform float uGradOn;
uniform vec3 uGradColor;
uniform float uGradEnd;
uniform float uGlitterOn;
varying vec3 vMugPos;
vec3 mugHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
`;

const FRAGMENT_COLOR = /* glsl */ `
{
  float mugH = clamp((vMugPos.y - uMinY) / max(uMaxY - uMinY, 1e-5), 0.0, 1.0);
  // Solid at the very bottom, then a soft fade up to uGradEnd.
  float mugG = 1.0 - smoothstep(uGradEnd * 0.2, uGradEnd, mugH);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGradColor, mugG * uGradOn);
  if (uGlitterOn > 0.5) {
    float mugFlake = mugHash33(floor(vMugPos * ${GLITTER_DENSITY.toFixed(1)})).z;
    diffuseColor.rgb *= 0.75 + 0.5 * mugFlake;
  }
}
`;

const FRAGMENT_NORMAL = /* glsl */ `
if (uGlitterOn > 0.5) {
  vec3 mugTilt = mugHash33(floor(vMugPos * ${GLITTER_DENSITY.toFixed(1)}) + 17.0) - 0.5;
  normal = normalize(normal + mugTilt * ${GLITTER_STRENGTH.toFixed(2)});
}
`;

/**
 * Physical material with an optional colour band fading up from the bottom
 * and optional glitter flakes. Height comes from the mesh position in the
 * displayed model's space (Y up), so it works for any part of the GLB.
 */
function createSurfaceMaterial(
  color: THREE.Color,
  finish: MugFinish,
  uniforms: SurfaceUniforms,
): THREE.MeshPhysicalMaterial {
  const p = FINISH_PARAMS[finish];
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: p.roughness,
    metalness: p.metalness,
    clearcoat: p.clearcoat,
    clearcoatRoughness: 0.1,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMugPos = (uMeshToRoot * vec4(position, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_COLOR}`)
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`,
      );
  };
  mat.customProgramCacheKey = () => "mug-surface-v1";
  return mat;
}

/** Bottom / top of a mesh in the root's space (Y up after the GLB root rotation). */
function heightRange(mesh: THREE.Mesh, meshToRoot: THREE.Matrix4): { minY: number; maxY: number } {
  const pos = mesh.geometry.getAttribute("position");
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(meshToRoot);
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return Number.isFinite(minY) ? { minY, maxY } : { minY: 0, maxY: 1 };
}

/**
 * Assigns non-shared materials so body, handle, inside, and rim can use
 * different colours; the outside gets the finish, the body also the gradient.
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

  const surface: MugSurface = { ...MUG_SURFACE_DEFAULTS, ...(options.surface ?? {}) };
  const gradientColor = surface.gradientColorHex ? new THREE.Color(surface.gradientColorHex) : null;

  // The GLB root itself carries the −90° X turn, so keep it: with no parent,
  // matrixWorld is "mesh → displayed model" (Y up), which is what height needs.
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const meshToRoot = child.matrixWorld.clone();
    const isBody = child.name !== MUG_MESH_HANDLE && child.name !== MUG_MESH_INSIDE && child.name !== MUG_MESH_FRINGE;
    const isInside = child.name === MUG_MESH_INSIDE;

    let color: THREE.Color;
    if (child.name === MUG_MESH_HANDLE) color = handleColor;
    else if (isInside) color = innerColor;
    else if (child.name === MUG_MESH_FRINGE) color = rimColor;
    else color = bodyColor;

    const { minY, maxY } = heightRange(child, meshToRoot);
    const finish: MugFinish = isInside ? "glossy" : surface.finish;
    child.material = createSurfaceMaterial(color, finish, {
      uMeshToRoot: { value: meshToRoot },
      uMinY: { value: minY },
      uMaxY: { value: maxY },
      uGradOn: { value: isBody && gradientColor ? 1 : 0 },
      uGradColor: { value: gradientColor ?? new THREE.Color(0, 0, 0) },
      uGradEnd: { value: surface.gradientHeightPct / 100 },
      uGlitterOn: { value: FINISH_PARAMS[finish].glitter ? 1 : 0 },
    });
  });
}
