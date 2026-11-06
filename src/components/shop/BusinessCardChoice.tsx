"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export interface BusinessCardChoiceText {
  tabCreate: string;
  tabCreateSub: string;
  tabUpload: string;
  tabUploadSub: string;
  createTitle: string;
  createLead: string;
  steps: readonly [string, string, string];
  createCta: string;
  badge: string;
}

/**
 * «Cărți de vizită» for viewers who may use the card Studio: two choices —
 * «Creează online» (the card Studio) and «Încarcă fișierul tău» (the upload
 * form, unchanged, passed as `upload`). Editing an uploaded cart line opens on
 * the upload form.
 */
export function BusinessCardChoice({ text, studioHref, initial, upload }: { text: BusinessCardChoiceText; studioHref: string; initial: "create" | "upload"; upload: ReactNode }) {
  const [tab, setTab] = useState<"create" | "upload">(initial);
  const tabCls = (on: boolean) =>
    `flex min-h-[64px] flex-1 flex-col items-start justify-center gap-0.5 rounded-2xl border-[1.5px] px-4 py-3 text-left ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink) hover:border-(--ink)"}`;
  return (
    <div className="flex flex-col gap-5" data-bc-choice>
      <div role="tablist" aria-label={`${text.tabCreate} / ${text.tabUpload}`} className="flex flex-col gap-2 sm:flex-row">
        <button type="button" role="tab" id="bc-tab-create" aria-controls="bc-panel-create" aria-selected={tab === "create"} data-bc-tab="create" className={tabCls(tab === "create")} onClick={() => setTab("create")}>
          <b className="text-[17px]">{text.tabCreate}</b>
          <span className={`text-sm ${tab === "create" ? "text-white/80" : "text-(--muted)"}`}>{text.tabCreateSub}</span>
        </button>
        <button type="button" role="tab" id="bc-tab-upload" aria-controls="bc-panel-upload" aria-selected={tab === "upload"} data-bc-tab="upload" className={tabCls(tab === "upload")} onClick={() => setTab("upload")}>
          <b className="text-[17px]">{text.tabUpload}</b>
          <span className={`text-sm ${tab === "upload" ? "text-white/80" : "text-(--muted)"}`}>{text.tabUploadSub}</span>
        </button>
      </div>
      <section id="bc-panel-create" role="tabpanel" aria-labelledby="bc-tab-create" hidden={tab !== "create"} className="rounded-2xl bg-[#faf3dc] p-5 md:p-7">
        <div className="flex max-w-[720px] flex-col gap-4">
          <span className="self-start rounded-full bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-[#7a6512]">{text.badge}</span>
          <h2 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{text.createTitle}</h2>
          <p className="m-0 text-[15px] text-[#5c4c10]">{text.createLead}</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:gap-3">
            {text.steps.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-(--ink) text-xs font-extrabold text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <Link href={studioHref} data-studio-card-cta className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 text-[17px] font-extrabold text-white no-underline">
            {text.createCta}
          </Link>
        </div>
      </section>
      <div id="bc-panel-upload" role="tabpanel" aria-labelledby="bc-tab-upload" hidden={tab !== "upload"}>
        {upload}
      </div>
    </div>
  );
}
