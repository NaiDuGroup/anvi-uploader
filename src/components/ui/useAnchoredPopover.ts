"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

type AnchoredPopoverStyle =
  | { vertical: "below"; left: number; top: number; width: number; maxHeight: number }
  | { vertical: "above"; left: number; bottom: number; width: number; maxHeight: number };

export interface AnchoredPopoverOptions {
  open: boolean;
  onClose: () => void;
  /** Minimum popover width (px); the popover never gets narrower than the trigger. */
  minWidthPx?: number;
  /** Upper bound for the popover height (px). */
  maxHeightPx?: number;
  /** Changes when the content size changes, so the position is recomputed. */
  contentKey?: string | number;
}

export interface AnchoredPopover {
  /** Outer wrapper of the trigger; clicks inside it don't close the popover. */
  containerRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
  /** Inline geometry for the `fixed` portal; null while closed or not yet measured. */
  popoverStyle: CSSProperties | null;
  /** False during SSR and the first client render (portal target not ready). */
  mounted: boolean;
}

const EDGE_PX = 10;
const GAP_PX = 6;
const MIN_BELOW_PX = 120;
const MIN_ABOVE_PX = 96;

/**
 * Positions a `fixed` popover next to its trigger button (below by default,
 * above when there is no room), keeps it in the viewport on scroll/resize and
 * closes it on outside click or Escape.
 */
export function useAnchoredPopover({
  open,
  onClose,
  minWidthPx = 0,
  maxHeightPx = 352,
  contentKey,
}: AnchoredPopoverOptions): AnchoredPopover {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState<boolean>(false);
  const [style, setStyle] = useState<AnchoredPopoverStyle | null>(null);

  const sync = useCallback((): void => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;

    void el.offsetWidth;

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = Math.min(Math.max(r.width, minWidthPx), vw - EDGE_PX * 2);
    const left = Math.min(Math.max(r.left, EDGE_PX), vw - EDGE_PX - width);

    const spaceBelow = Math.max(0, vh - EDGE_PX - (r.bottom + GAP_PX));
    const spaceAbove = Math.max(0, r.top - GAP_PX - EDGE_PX);

    const openAbove =
      spaceBelow < MIN_BELOW_PX && spaceAbove > spaceBelow && spaceAbove >= MIN_ABOVE_PX;

    if (openAbove) {
      const maxHeight = Math.min(maxHeightPx, spaceAbove);
      if (maxHeight > 0) {
        setStyle({ vertical: "above", left, bottom: vh - r.top + GAP_PX, width, maxHeight });
        return;
      }
    }

    const top = r.bottom + GAP_PX;
    setStyle({
      vertical: "below",
      left,
      top,
      width,
      maxHeight: Math.min(maxHeightPx, Math.max(0, vh - EDGE_PX - top)),
    });
  }, [minWidthPx, maxHeightPx]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR: portal attaches after hydrate
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    sync();
    const raf = window.requestAnimationFrame(() => sync());
    return () => window.cancelAnimationFrame(raf);
  }, [open, sync, contentKey]);

  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard geometry whenever the popover collapses
    setStyle(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, sync]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      const node = e.target as Node | null;
      if (!node) return;
      if (
        containerRef.current?.contains(node) ||
        triggerRef.current?.contains(node) ||
        popoverRef.current?.contains(node)
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const popoverStyle: CSSProperties | null = style
    ? {
        left: `${style.left}px`,
        width: `${style.width}px`,
        maxHeight: `${style.maxHeight}px`,
        ...(style.vertical === "above"
          ? { bottom: `${style.bottom}px`, top: "auto" }
          : { top: `${style.top}px`, bottom: "auto" }),
      }
    : null;

  return { containerRef, triggerRef, popoverRef, popoverStyle, mounted };
}
