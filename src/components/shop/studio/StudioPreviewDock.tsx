"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { studioPreviewT } from "@/lib/studio/i18n.preview";
import type { StudioEditorApi } from "./StudioApp";
import { StudioLive3DLazy } from "./StudioLive3DLazy";

/**
 * The floating live preview over the editor canvas (`extensions.canvasOverlay`):
 * a small 3D (or flat 2D) card; «Mărește» opens it full screen with rotation
 * controls. The 3D thumbnail mounts only once the card is on screen and the
 * browser is idle, so it never delays the editor's first paint.
 */

type Mode = "2d" | "3d";

/** True once `ref` is visible and the page has gone idle. */
function useVisibleAndIdle(ref: RefObject<HTMLElement | null>): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (ok || !el) return;
    let visible = typeof IntersectionObserver === "undefined";
    let idle = false;
    let handle: number | null = null;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const check = () => {
      if (visible && idle) setOk(true);
    };
    const markIdle = () => {
      idle = true;
      check();
    };
    if (w.requestIdleCallback) handle = w.requestIdleCallback(markIdle, { timeout: 2500 });
    else handle = window.setTimeout(markIdle, 600);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        check();
      });
      io.observe(el);
    }
    return () => {
      io?.disconnect();
      if (handle != null) {
        if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
        window.clearTimeout(handle);
      }
    };
  }, [ref, ok]);
  return ok;
}

/** Flat design thumbnail, redrawn when the design changes. */
function FlatThumb({ api, maxSide, className }: { api: StudioEditorApi; maxSide: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { doc, spec, renderAssets, version } = api;
  useEffect(() => {
    if (ref.current) renderPreviewCanvas(doc, spec, renderAssets, maxSide, ref.current);
  }, [doc, spec, renderAssets, version, maxSide]);
  return (
    <canvas
      ref={ref}
      className={`block h-auto max-h-full w-auto max-w-full rounded-[4px] shadow-[0_4px_12px_rgba(20,33,61,0.15)] ${className ?? ""}`}
      style={{ background: api.productColor ?? "#ffffff" }}
    />
  );
}

function ModeToggle({ mode, onChange, label, big }: { mode: Mode; onChange: (m: Mode) => void; label: string; big?: boolean }) {
  const h: string = big ? "min-h-12 min-w-12" : "min-h-8 min-w-9";
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[10px] bg-(--soft) p-0.5">
      {(["2d", "3d"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={(e) => {
            e.stopPropagation();
            onChange(m);
          }}
          className={`${h} rounded-[8px] px-2 text-xs font-extrabold ${mode === m ? "bg-(--ink) text-white" : "text-(--ink)"}`}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function PreviewModal({ api, mode, setMode, onClose }: { api: StudioEditorApi; mode: Mode; setMode: (m: Mode) => void; onClose: () => void }) {
  const t = studioPreviewT(api.lang);
  const can3d: boolean = api.kind !== "pen";
  const [autoRotate, setAutoRotate] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const prevOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])")).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      back?.focus?.();
    };
  }, [onClose]);

  const btn = "min-h-12 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold text-(--ink)";
  return createPortal(
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t("preview3dTitle")} className="shop-root fixed inset-0 z-[80] flex flex-col bg-white text-(--ink)">
      <header className="flex flex-wrap items-center gap-2 border-b border-(--line) px-4 py-2">
        <div className="mr-auto flex min-w-0 flex-col">
          <h2 className="m-0 text-base font-extrabold">{can3d && mode === "3d" ? t("preview3dTitle") : t("preview")}</h2>
          <span className="text-xs text-(--muted2)">{t("preview3dHint")}</span>
        </div>
        {can3d ? <ModeToggle mode={mode} onChange={setMode} label={t("viewMode")} big /> : null}
        <button ref={closeBtn} type="button" onClick={onClose} aria-label={t("close")} className="flex min-h-12 min-w-12 items-center justify-center rounded-[10px] bg-(--soft) text-xl font-bold">
          ×
        </button>
      </header>
      <div className="relative min-h-0 flex-1 bg-[#eef1f5]">
        {can3d && mode === "3d" ? (
          <StudioLive3DLazy
            key={viewKey}
            kind={api.kind}
            item={api.item}
            spec={api.spec}
            doc={api.doc}
            renderAssets={api.renderAssets}
            version={api.version}
            focusLayerId={api.selectedId}
            autoRotate={autoRotate}
            interactive
            className="h-full w-full"
            style={{ position: "absolute", inset: 0 }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4">
            {api.kind === "pen" ? (
              <StudioLive3DLazy kind="pen" item={api.item} spec={api.spec} doc={api.doc} renderAssets={api.renderAssets} version={api.version} className="w-full max-w-3xl" />
            ) : (
              <FlatThumb api={api} maxSide={1400} />
            )}
          </div>
        )}
      </div>
      {can3d && mode === "3d" ? (
        <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-(--line) px-4 py-2">
          <span className="mr-auto text-xs font-semibold text-(--muted2)">{t("dragToRotate")}</span>
          <button type="button" aria-pressed={autoRotate} onClick={() => setAutoRotate((v) => !v)} className={`${btn} ${autoRotate ? "border-(--ink) bg-(--ink) text-white" : ""}`}>
            {t("autoRotate")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoRotate(false);
              setViewKey((k) => k + 1);
            }}
            className={btn}
          >
            {t("resetView")}
          </button>
        </footer>
      ) : api.kind === "pen" ? (
        <footer className="border-t border-(--line) px-4 py-3 text-center text-sm text-(--muted2)">{t("flatOnly")}</footer>
      ) : null}
    </div>,
    document.body,
  );
}

export function StudioPreviewDock({ api }: { api: StudioEditorApi }) {
  const t = studioPreviewT(api.lang);
  const can3d: boolean = api.kind !== "pen" && api.item?.has3dPreview !== false;
  const [mode, setMode] = useState<Mode>(can3d ? "3d" : "2d");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const card = useRef<HTMLDivElement>(null);
  const mount3d: boolean = useVisibleAndIdle(card);
  const show3d: boolean = can3d && mode === "3d";
  const w: number = api.isPhone ? 120 : 196;
  const h: number = api.isPhone ? 84 : 132;

  return (
    <>
      <div
        ref={card}
        className="flex flex-col gap-1.5 rounded-[14px] bg-white p-2 shadow-[0_10px_28px_rgba(20,33,61,0.18)]"
        style={{ width: w }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t("enlarge")}: ${show3d ? (api.kind === "mug" ? t("mugAlt") : t("notebookAlt")) : t("flatAlt")}`}
          className="relative flex items-center justify-center overflow-hidden rounded-[10px] p-0"
          style={{ height: h, background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)" }}
        >
          {show3d ? (
            mount3d ? (
              <StudioLive3DLazy
                kind={api.kind}
                item={api.item}
                spec={api.spec}
                doc={api.doc}
                renderAssets={api.renderAssets}
                version={api.version}
                focusLayerId={api.selectedId}
                interactive={false}
                className="h-full w-full"
                style={{ position: "absolute", inset: 0, minHeight: 0, background: "transparent" }}
              />
            ) : (
              <span className="h-full w-full animate-pulse bg-(--soft)" aria-hidden="true" />
            )
          ) : (
            <span className="flex h-full w-full items-center justify-center p-1.5">
              <FlatThumb api={api} maxSide={api.isPhone ? 240 : 400} />
            </span>
          )}
        </button>
        <div className="flex items-center justify-between gap-1 text-xs font-bold">
          {can3d && !api.isPhone ? (
            <ModeToggle mode={mode} onChange={setMode} label={t("viewMode")} />
          ) : (
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${show3d ? "bg-[#1f8a4c]" : "bg-(--line2)"}`} aria-hidden="true" />
              {show3d ? t("live3d") : t("view2d")}
            </span>
          )}
          {can3d && !api.isPhone ? (
            <span className="flex items-center gap-1 text-[11px]" aria-hidden="true">
              <span className={`h-2 w-2 rounded-full ${show3d ? "bg-[#1f8a4c]" : "bg-(--line2)"}`} />
              {show3d ? t("live3d") : null}
            </span>
          ) : null}
          <button type="button" onClick={() => setOpen(true)} className="min-h-8 rounded-[8px] px-1.5 text-(--muted2) underline-offset-2 hover:underline">
            {t("enlarge")}
          </button>
        </div>
      </div>
      {open ? <PreviewModal api={api} mode={mode} setMode={setMode} onClose={close} /> : null}
    </>
  );
}
