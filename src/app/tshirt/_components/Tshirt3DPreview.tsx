"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { TshirtSide } from "@/lib/tshirt/tshirtRules";
import {
  MANNEQUIN_CAMERA,
  MANNEQUIN_TARGET,
  applyStudioEnvironment,
  buildMannequinScene,
  type MannequinOptions,
} from "@/lib/tshirt/mannequin3d";

type Props = MannequinOptions & {
  /** Side to turn towards (front / back buttons). */
  facing: TshirtSide;
  /** Changes whenever facing is asked again, so a repeat click still turns. */
  facingTick: number;
  className?: string;
  style?: React.CSSProperties;
};

function Mannequin({ shirtColor, size, prints, facing, facingTick }: Omit<Props, "className" | "style">) {
  const built = useMemo(() => buildMannequinScene({ shirtColor, size, prints }), [shirtColor, size, prints]);
  useEffect(() => () => built.dispose(), [built]);
  const rig = useRef<THREE.Group | null>(null);
  useEffect(() => {
    rig.current = built.rig;
  }, [built]);

  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);

  const controls = useRef<OrbitControlsImpl>(null);
  const turnTo = useRef<number | null>(null);
  useEffect(() => {
    turnTo.current = facing === "front" ? 0 : Math.PI;
  }, [facing, facingTick]);

  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c) return;
    // lights turn with the view, like a studio turntable
    if (rig.current) rig.current.rotation.y = c.getAzimuthalAngle();
    const goal = turnTo.current;
    if (goal === null) return;
    const cur = c.getAzimuthalAngle();
    let d = goal - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < 0.004) {
      turnTo.current = null;
      return;
    }
    const a = cur + d * 0.14;
    const ox = camera.position.x - c.target.x;
    const oz = camera.position.z - c.target.z;
    const r = Math.hypot(ox, oz);
    camera.position.set(c.target.x + Math.sin(a) * r, camera.position.y, c.target.z + Math.cos(a) * r);
    c.update();
  });

  return (
    <>
      <primitive object={built.root} />
      <OrbitControls
        ref={controls}
        target={[MANNEQUIN_TARGET.x, MANNEQUIN_TARGET.y, MANNEQUIN_TARGET.z]}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.8}
        minPolarAngle={Math.PI / 2 - 0.28}
        maxPolarAngle={Math.PI / 2 + 0.08}
        onStart={() => {
          turnTo.current = null;
        }}
      />
    </>
  );
}

/** Turnable mannequin wearing the shirt — the client drags to look all around. */
export function Tshirt3DPreview({ className, style, ...rest }: Props) {
  return (
    <div className={className} style={style}>
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [0, MANNEQUIN_CAMERA.height, MANNEQUIN_CAMERA.distance],
          fov: MANNEQUIN_CAMERA.fov,
          near: 1,
          far: 2000,
        }}
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <Mannequin {...rest} />
      </Canvas>
    </div>
  );
}
