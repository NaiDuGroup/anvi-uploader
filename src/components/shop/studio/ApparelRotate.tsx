"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ShopLang } from "@/lib/storefront/i18n";
import { studioApparelT } from "@/lib/studio/i18n.apparel";
import type { ApparelPhotoViews } from "./useApparelPhotos";

// three.js only when the customer opens the 3D view.
const ApparelRotate3D = dynamic(() => import("./ApparelRotate3D").then((m) => m.ApparelRotate3D), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-(--muted)">…</div>,
});

/** «Rotește 3D» (T-shirt / polo): the photos with the design as a garment the customer turns around. */
export function ApparelRotateButton({ front, back, views, label, lang }: { front: HTMLCanvasElement; back: HTMLCanvasElement; views: ApparelPhotoViews; label: string; lang: ShopLang }) {
  const [open, setOpen] = useState(false);
  const downOnBackdrop = useRef(false);
  const t = studioApparelT(lang);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // The page under the dialog does not scroll.
    const html = document.documentElement;
    const prev = { html: html.style.overflow, body: document.body.style.overflow };
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev.html;
      document.body.style.overflow = prev.body;
    };
  }, [open]);
  if (!views.front || !views.back) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold" data-apparel-rotate>
        <span aria-hidden="true">⟳</span>
        {label}
      </button>
      {open
        ? createPortal(
        // On <body>, above everything (the verify page's sticky / stacked parts showed through at z-90 inside it).
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-[rgba(20,33,61,0.62)] p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={label}
          // Only a press that starts AND ends on the backdrop closes it (a drag of the garment released outside must not).
          onPointerDown={(e) => {
            downOnBackdrop.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (downOnBackdrop.current && e.target === e.currentTarget) setOpen(false);
            downOnBackdrop.current = false;
          }}
        >
          <div className="relative flex h-[min(92vh,720px)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl" >
            <button type="button" onClick={() => setOpen(false)} className="absolute top-2 right-2 z-10 min-h-10 rounded-xl bg-white/90 px-3 text-sm font-bold" data-apparel-rotate-close>
              {t("rotateClose")}
            </button>
            <ApparelRotate3D front={front} back={back} views={views} lang={lang} />
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
