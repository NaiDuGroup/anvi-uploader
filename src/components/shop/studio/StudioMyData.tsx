"use client";

import { useEffect, useRef, useState } from "react";
import { STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import type { StudioDoc } from "@/lib/studio/document";
import { saveStudioFields, saveStudioFieldsLocal, studioFieldsSignedIn } from "@/lib/studio/fieldsStore";
import { fitAllTextBoxes } from "@/lib/studio/fonts";
import { studioShopT, type StudioShopKey } from "@/lib/studio/i18n.shop";
import {
  STUDIO_COLOR_FIELD_KEYS,
  STUDIO_TEXT_FIELD_KEYS,
  applyStudioFields,
  fieldsFromDoc,
  mergeStudioFields,
  type StudioFields,
} from "@/lib/studio/smartFields";
import type { StudioEditorApi } from "./StudioApp";

const LABEL: Record<(typeof STUDIO_TEXT_FIELD_KEYS)[number], StudioShopKey> = {
  name: "fName",
  title: "fTitle",
  company: "fCompany",
  phone: "fPhone",
  email: "fEmail",
  site: "fSite",
  address: "fAddress",
};
const INPUT_TYPE: Partial<Record<(typeof STUDIO_TEXT_FIELD_KEYS)[number], string>> = { phone: "tel", email: "email", site: "url" };

/** Autosave delay of «Datele mele» (this browser), after the last keystroke. */
export const STUDIO_FIELDS_AUTOSAVE_MS = 800;

/** The customer's details applied to a document, text boxes re-measured. */
export function withStudioFields(doc: StudioDoc, fields: StudioFields): StudioDoc {
  return fitAllTextBoxes(applyStudioFields(doc, fields), "bound");
}

/**
 * «Datele mele»: typed once, filled into every bound text / logo / brand
 * colour of the design live. What the customer changed on the canvas in a
 * bound text shows here too (the document wins over the stored value).
 * Saved automatically in this browser ~0.8 s after typing stops (like
 * Vistaprint: no «Save» needed); a signed-in customer also gets «Salvează în
 * cont», which puts them into the account (other devices).
 */
export function StudioMyDataPanel({
  api,
  fields,
  onFields,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onFields: (f: StudioFields) => void;
}) {
  const t = studioShopT(api.lang);
  // Typed values win (an emptied field stays empty); bound texts edited on the canvas come in when the panel opens.
  const shown: StudioFields = { ...fieldsFromDoc(api.doc), ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
  useEffect(() => {
    onFields(mergeStudioFields(fields, fieldsFromDoc(api.doc)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel opens
  }, []);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autosave, setAutosave] = useState<"idle" | "pending" | "saved">("idle");
  const [accountSaved, setAccountSaved] = useState(false);
  const signedIn: boolean = studioFieldsSignedIn() === true;
  const pending = useRef<StudioFields | null>(null);
  const timer = useRef<number | null>(null);
  const flush = (): void => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return;
    saveStudioFieldsLocal(pending.current);
    pending.current = null;
  };
  // Leaving the panel or the page never loses what was typed.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, []);
  const logoInput = useRef<HTMLInputElement>(null);
  const hasBinds: boolean = api.doc.surfaces.some((s) =>
    s.layers.some((l) => (l.kind === "text" && l.bind) || (l.kind === "image" && l.bind === "logo") || (l.kind === "shape" && l.bindColor)),
  );

  const change = (next: StudioFields) => {
    setNote(null);
    setAccountSaved(false);
    onFields(next);
    pending.current = next;
    setAutosave("pending");
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      flush();
      setAutosave("saved");
    }, STUDIO_FIELDS_AUTOSAVE_MS);
    const applied = withStudioFields(api.doc, next);
    if (applied !== api.doc) api.setDoc(applied, "mydata");
  };

  const logoUrl = (() => {
    const id = shown.logo?.localId;
    if (!id) return null;
    const blob = api.assets.original(id);
    return blob ? URL.createObjectURL(blob) : null;
  })();

  const save = async () => {
    flush();
    setSaving(true);
    const where = await saveStudioFields(shown);
    setSaving(false);
    setAutosave("saved");
    setAccountSaved(where === "account");
    setNote(where === "account" ? t("myDataSavedAccount") + (shown.logo && !shown.logo.key?.startsWith("shop-orders/") ? ` ${t("myDataLogoLocal")}` : "") : t("myDataSavedLocal"));
  };
  const autosaveText: string | null =
    autosave === "pending" ? t("myDataPending") : autosave === "saved" ? (signedIn ? t("myDataAutoSaved") : t("myDataSavedLocal")) : null;

  const input = "h-12 w-full rounded-[10px] border-[1.5px] border-(--line2) px-3 text-[15px] md:h-11";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-extrabold">{t("myDataTitle")}</h2>
        <p className="m-0 text-[13px] text-(--muted)">{t("myDataLead")}</p>
      </div>
      {!hasBinds ? <p className="m-0 rounded-xl bg-(--soft) px-3 py-2 text-xs text-(--muted)">{t("myDataNoBind")}</p> : null}
      {STUDIO_TEXT_FIELD_KEYS.map((k) => (
        <label key={k} className="flex flex-col gap-1 text-xs font-bold text-(--muted)">
          {t(LABEL[k])}
          <input
            className={input}
            type={INPUT_TYPE[k] ?? "text"}
            value={shown[k] ?? ""}
            maxLength={200}
            autoComplete={k === "name" ? "name" : k === "email" ? "email" : k === "phone" ? "tel" : k === "company" ? "organization" : "off"}
            onChange={(e) => change({ ...shown, [k]: e.target.value })}
          />
        </label>
      ))}
      <div className="flex flex-col gap-1 text-xs font-bold text-(--muted)">
        {t("fLogo")}
        <div className="flex items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-lg border border-(--line) object-contain" onLoad={() => URL.revokeObjectURL(logoUrl)} />
          ) : null}
          <button type="button" onClick={() => logoInput.current?.click()} className="min-h-12 flex-1 rounded-[10px] border-[1.5px] border-dashed border-(--line2) text-sm font-bold text-(--ink)">
            {shown.logo ? t("fLogoChange") : t("fLogoAdd")}
          </button>
          {shown.logo ? (
            <button type="button" onClick={() => change({ ...shown, logo: null })} className="min-h-12 rounded-[10px] px-3 text-sm font-bold text-(--err)">
              {t("fLogoRemove")}
            </button>
          ) : null}
        </div>
        <input
          ref={logoInput}
          type="file"
          accept={STUDIO_PHOTO_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const a = await api.assets.addFile(f);
            change({ ...shown, logo: { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime } });
          }}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs font-bold text-(--muted)">
        {t("fColors")}
        <div className="flex gap-2">
          {STUDIO_COLOR_FIELD_KEYS.map((k, i) => (
            <label key={k} className="flex flex-col items-center gap-1">
              <input
                type="color"
                aria-label={t("fColor", { n: i + 1 })}
                value={shown[k] ?? "#ffffff"}
                onChange={(e) => change({ ...shown, [k]: e.target.value })}
                className="h-12 w-12 cursor-pointer rounded-full border-[1.5px] border-(--line2) bg-white p-1"
              />
            </label>
          ))}
        </div>
      </div>
      {signedIn ? (
        <button
          type="button"
          disabled={saving || accountSaved}
          onClick={() => void save()}
          className={`min-h-12 rounded-xl font-extrabold disabled:cursor-default ${accountSaved ? "bg-[#e7f5ec] text-[#1f6b3c]" : "bg-(--ink) text-white disabled:opacity-50"}`}
        >
          {accountSaved ? t("myDataSavedBtn") : saving ? t("myDataPending") : t("myDataSaveAccount")}
        </button>
      ) : null}
      <p role="status" aria-live="polite" className="m-0 min-h-4 text-xs text-(--muted)">
        {note ?? autosaveText ?? ""}
      </p>
    </div>
  );
}
