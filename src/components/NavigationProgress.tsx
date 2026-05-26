"use client";

import { useEffect, useState } from "react";

export function NavigationProgress({ isNavigating }: { isNavigating: boolean }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isNavigating) {
      setVisible(true);
      setProgress(0);
      const t1 = setTimeout(() => setProgress(30), 50);
      const t2 = setTimeout(() => setProgress(60), 300);
      const t3 = setTimeout(() => setProgress(80), 800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      setProgress(100);
      const hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(hide);
    }
  }, [isNavigating]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-[3px] pointer-events-none">
      <div
        className="h-full bg-amber-500 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
