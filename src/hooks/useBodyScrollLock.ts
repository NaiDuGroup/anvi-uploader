"use client";

import { useEffect } from "react";

/**
 * Stops the page behind an open overlay (drawer, modal, sheet, lightbox) from
 * scrolling; only the overlay's own content scrolls.
 *
 * - `overflow: hidden` on <html> and <body> (iOS Safari 16+ needs both);
 * - the vanished scrollbar is replaced by body padding so the page does not jump;
 * - open overlays are counted: a comment panel over the order drawer keeps the
 *   page locked until the last one closes, then every style is put back exactly.
 *
 * Pair it with `overscroll-contain` on the overlay's scrolling container and
 * `touch-none` on a separate backdrop element.
 */

interface LockTarget {
  documentElement: { style: { overflow: string }; clientWidth: number };
  body: { style: { overflow: string; paddingRight: string } };
}

interface LockWindow {
  innerWidth: number;
  getComputedStyle(el: never): { paddingRight: string };
}

let lockCount = 0;
let saved: { htmlOverflow: string; bodyOverflow: string; bodyPaddingRight: string } | null = null;

/** Locks page scroll; returns the matching unlock (safe to call once). */
export function lockBodyScroll(
  doc: LockTarget = document,
  win: LockWindow = window as unknown as LockWindow,
): () => void {
  const html = doc.documentElement;
  const body = doc.body;
  if (lockCount === 0) {
    const scrollbar = Math.max(0, win.innerWidth - html.clientWidth);
    saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    if (scrollbar > 0) {
      const current = Number.parseFloat(win.getComputedStyle(body as never).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && saved) {
      html.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.bodyOverflow;
      body.style.paddingRight = saved.bodyPaddingRight;
      saved = null;
    }
  };
}

/** Locks page scroll while `active` (default: while the calling component is mounted). */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}
