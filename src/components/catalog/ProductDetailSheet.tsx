"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** Main photo then the gallery, without repeats. */
export function productImageList(main: string | null | undefined, gallery: readonly string[] | undefined): string[] {
  return [...new Set([main, ...(gallery ?? [])].filter((u): u is string => !!u))];
}

/**
 * Product window of the public order pages: photos to swipe through (tap to
 * zoom), name, price, description and «Выбрать». A bottom sheet on phones, a
 * centred dialog on wider screens.
 */
export function ProductDetailSheet({
  open,
  onClose,
  images,
  name,
  price,
  extra,
  description,
  selected,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  images: string[];
  name: string;
  price?: string | null;
  extra?: ReactNode;
  description?: string;
  selected: boolean;
  onChoose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <SheetBody
      onClose={onClose}
      images={images}
      name={name}
      price={price}
      extra={extra}
      description={description}
      selected={selected}
      onChoose={onChoose}
    />,
    document.body,
  );
}

function SheetBody({
  onClose,
  images,
  name,
  price,
  extra,
  description,
  selected,
  onChoose,
}: Omit<Parameters<typeof ProductDetailSheet>[0], "open">) {
  const t = useLanguageStore((s) => s.t.productWindow);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<string | null>(null);

  // Lock the page behind; Escape closes the zoom first, then the window.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, onClose]);

  const goTo = (i: number): void => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = (): void => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" aria-label={t.close} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
        )}
      >
        <div className="relative shrink-0 bg-gray-50">
          <span className="absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-gray-300 sm:hidden" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow"
          >
            <X className="h-5 w-5" />
          </button>
          {images.length > 0 ? (
            <div
              ref={trackRef}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setZoom(src)}
                  aria-label={t.photo(i + 1, images.length)}
                  className="relative aspect-square w-full shrink-0 snap-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- catalog URLs, sized by CSS */}
                  <img
                    src={src}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    className="h-full w-full object-contain p-4"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="aspect-[4/3] w-full" />
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                aria-label="‹"
                className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow sm:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                aria-label="›"
                className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow sm:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                {images.map((src, i) => (
                  <span
                    key={src}
                    className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-gray-800" : "w-1.5 bg-gray-300")}
                  />
                ))}
              </div>
            </>
          )}
          {images.length > 0 && (
            <span className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-gray-600 shadow">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden />
              {index + 1}/{images.length}
            </span>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-gray-100 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={t.photo(i + 1, images.length)}
                className={cn(
                  "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-gray-50",
                  i === index ? "border-gold" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- catalog URLs, sized by CSS */}
                <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <h2 className="text-base font-semibold leading-snug text-gray-900">{name}</h2>
          {extra ? <div className="mt-1">{extra}</div> : null}
          {price ? <p className="mt-1 text-lg font-semibold tabular-nums text-gold">{price}</p> : null}
          {description ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">{description}</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onChoose();
              onClose();
            }}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors",
              selected ? "border-2 border-gold bg-amber-50 text-gray-900" : "bg-gold text-white hover:bg-gold/90",
            )}
          >
            {selected && <Check className="h-5 w-5" />}
            {selected ? t.chosen : t.choose}
          </button>
        </div>
      </div>

      {zoom && (
        <div className="absolute inset-0 z-20 bg-black">
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label={t.close}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow"
          >
            <X className="h-5 w-5" />
          </button>
          <ZoomView src={zoom} />
        </div>
      )}
    </div>
  );
}

/** Full-screen photo: fits the screen; tap toggles 2.5× and the finger pans it. */
function ZoomView({ src }: { src: string }) {
  const [big, setBig] = useState<boolean>(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Centre the enlarged photo so the tap does not land on a corner.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !big) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [big]);

  return (
    <div ref={boxRef} className={cn("h-full w-full", big ? "overflow-auto" : "flex items-center justify-center overflow-hidden")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- catalog URLs, sized by CSS */}
      <img
        src={src}
        alt=""
        onClick={() => setBig((b) => !b)}
        className={cn(
          "select-none bg-white",
          big ? "h-auto w-[250%] max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain",
        )}
      />
    </div>
  );
}
