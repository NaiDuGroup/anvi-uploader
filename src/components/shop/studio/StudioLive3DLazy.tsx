"use client";

import dynamic from "next/dynamic";
import type { StudioLive3DProps } from "./StudioLive3D";

/** `StudioLive3D` loaded on demand, so three.js stays out of the editor's first load. */
export const StudioLive3DLazy = dynamic<StudioLive3DProps>(() => import("./StudioLive3D").then((m) => m.StudioLive3D), {
  ssr: false,
  loading: () => <div className="h-full min-h-[120px] w-full animate-pulse rounded-[10px] bg-(--soft)" aria-hidden="true" />,
});
