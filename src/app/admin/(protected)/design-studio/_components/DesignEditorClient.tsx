"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Loader2, Minus, Plus, Redo2, ShoppingCart, Undo2 } from "lucide-react";
import DesignFontLoader from "@/components/design/DesignFontLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import DesignCanvas from "./DesignCanvas";
import DesignSidebar from "./DesignSidebar";
import DesignInspector from "./DesignInspector";
import { useDesignEditor } from "@/lib/design/editorStore";
import type { DesignDetailJson } from "@/lib/design/designJson";
import { buildDesignFileName } from "@/lib/design/fileName";
import { ensureDesignFontsLoaded } from "@/lib/design/fonts";
import { patchDesign, uploadDesignRender } from "@/lib/design/saveDesign";
import { ZOOM_MAX, ZOOM_MIN, fitScale, scalePercent, stepScale } from "@/lib/design/zoom";
import { useLanguageStore } from "@/stores/useLanguageStore";

const AUTOSAVE_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

export default function DesignEditorClient({ designId }: { designId: string }) {
  const router = useRouter();
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [meta, setMeta] = useState<DesignDetailJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scale, setScale] = useState(0.25);
  const [fitMode, setFitMode] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitModeRef = useRef(true);
  fitModeRef.current = fitMode;

  const init = useDesignEditor((s) => s.init);
  const doc = useDesignEditor((s) => s.doc);
  const dirty = useDesignEditor((s) => s.dirty);
  const markSaved = useDesignEditor((s) => s.markSaved);
  const undo = useDesignEditor((s) => s.undo);
  const redo = useDesignEditor((s) => s.redo);
  const pastLen = useDesignEditor((s) => s.past.length);
  const futureLen = useDesignEditor((s) => s.future.length);

  const exportGetterRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/designs/${designId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "load_failed");
        return res.json() as Promise<{ item: DesignDetailJson }>;
      })
      .then((data) => {
        if (cancelled) return;
        setMeta(data.item);
        setTitle(data.item.title);
        init(data.item.doc);
        setFitMode(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "load_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [designId, init]);

  const persistDoc = useCallback(async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await patchDesign(designId, { title: titleRef.current, doc });
      markSaved();
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "save_failed");
    }
  }, [designId, doc, markSaved]);

  useEffect(() => {
    if (!dirty || !meta) return;
    const timer = window.setTimeout(() => {
      void persistDoc();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, doc, persistDoc, meta]);

  const applyFit = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !meta) return;
    setFitMode(true);
    setScale(fitScale(meta.canvasWidthPx, meta.canvasHeightPx, el.clientWidth, el.clientHeight));
  }, [meta]);

  const zoomBy = useCallback((direction: 1 | -1) => {
    setFitMode(false);
    setScale((current) => stepScale(current, direction));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !meta) return;
    const syncFit = () => {
      if (!fitModeRef.current) return;
      setScale(fitScale(meta.canvasWidthPx, meta.canvasHeightPx, el.clientWidth, el.clientHeight));
    };
    syncFit();
    const observer = new ResizeObserver(syncFit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [meta]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [meta, zoomBy]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "0") {
        event.preventDefault();
        applyFit();
      } else if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomBy(1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomBy(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, applyFit, zoomBy]);

  const handleExportReady = useCallback((getter: () => HTMLCanvasElement | null) => {
    exportGetterRef.current = getter;
  }, []);

  const persistWithRender = useCallback(async (): Promise<boolean> => {
    if (!meta) return false;
    setSaveState("saving");
    setSaveError(null);
    try {
      await ensureDesignFontsLoaded(doc);
      const canvas = exportGetterRef.current?.();
      if (!canvas) throw new Error("export_unavailable");
      const fileName = buildDesignFileName({
        title: titleRef.current,
        sku: meta.productSku,
        designId: meta.id,
      });
      const keys = await uploadDesignRender({
        exportCanvas: canvas,
        dpi: meta.dpi,
        fileName,
      });
      await patchDesign(designId, {
        title: titleRef.current,
        doc,
        status: "ready",
        ...keys,
      });
      markSaved();
      setMeta((prev) => (prev ? { ...prev, ...keys, status: "ready" } : prev));
      setSaveState("saved");
      return true;
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "save_failed");
      return false;
    }
  }, [designId, doc, markSaved, meta]);

  const handleDuplicate = useCallback(async () => {
    const res = await fetch(`/api/admin/designs/${designId}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/admin/design-studio/${data.item.id}`);
  }, [designId, router]);

  const handleToOrder = useCallback(async () => {
    const ok = await persistWithRender();
    if (!ok) return;
    router.push(`/admin/orders/new?designs=${encodeURIComponent(designId)}`);
  }, [designId, persistWithRender, router]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-600">{loadError === "not_found" ? ds.notFound : ds.loadFailed}</p>
        <NavLinkButton href="/admin/design-studio" variant="outline" className="mt-4">
          {ds.backToLibrary}
        </NavLinkButton>
      </main>
    );
  }

  if (!meta) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-var(--admin-header-h,7rem))] min-h-[640px] flex-col bg-gray-100">
      <DesignFontLoader />
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
        <NavLinkButton href="/admin/design-studio" variant="ghost" size="sm" leadingIcon={<ArrowLeft className="h-4 w-4" />}>
          {ds.backStudio}
        </NavLinkButton>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            useDesignEditor.setState({ dirty: true });
          }}
          className="min-w-0 flex-1 border-transparent shadow-none hover:border-gray-300"
          aria-label={ds.nameLabel}
        />
        <span className="hidden text-xs text-gray-400 sm:inline">
          {meta.productSku ?? ds.sizeCm(meta.widthCm, meta.heightCm)} · {meta.dpi} DPI
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => zoomBy(-1)}
            disabled={scale <= ZOOM_MIN}
            title={ds.zoomOut}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-w-[3.25rem] px-1 tabular-nums"
            onClick={applyFit}
            title={ds.zoomFit}
          >
            {ds.zoomPercent(scalePercent(scale))}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => zoomBy(1)}
            disabled={scale >= ZOOM_MAX}
            title={ds.zoomIn}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={applyFit} title={ds.zoomFit}>
            {ds.zoomFit}
          </Button>
        </div>
        <SaveBadge state={saveState} error={saveError} />
        <Button type="button" variant="ghost" size="icon" onClick={undo} disabled={pastLen === 0} title={ds.undo}>
          <Undo2 className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={redo} disabled={futureLen === 0} title={ds.redo}>
          <Redo2 className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => void handleDuplicate()}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {ds.duplicate}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void persistWithRender()}>
          {ds.save}
        </Button>
        <Button type="button" size="sm" onClick={() => void handleToOrder()}>
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
          {ds.toOrder}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <DesignSidebar canvasWidth={meta.canvasWidthPx} canvasHeight={meta.canvasHeightPx} />
        <div
          ref={viewportRef}
          className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-6"
        >
          <DesignCanvas
            docWidth={meta.canvasWidthPx}
            docHeight={meta.canvasHeightPx}
            scale={scale}
            onExportCanvasReady={handleExportReady}
          />
        </div>
        <DesignInspector canvasWidth={meta.canvasWidthPx} canvasHeight={meta.canvasHeightPx} />
      </div>
    </div>
  );
}

function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {ds.saving}
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3 w-3" aria-hidden />
        {ds.saved}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="max-w-[10rem] truncate text-xs text-red-600" title={error ?? undefined}>
        {ds.saveError}
      </span>
    );
  }
  return <span className="text-xs text-gray-400"> </span>;
}
