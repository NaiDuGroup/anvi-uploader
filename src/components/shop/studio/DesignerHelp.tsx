"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/turnstile/TurnstileWidget";
import { CORPORATE_FILE_ACCEPT } from "@/lib/corporate/fileTypes";
import { CorporateUploadError, uploadCorporateFile } from "@/lib/corporate/upload";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopFileRef } from "@/lib/storefront/types";
import {
  DESIGN_REQUEST_HONEYPOT_FIELD,
  DESIGN_REQUEST_MAX_FILES,
  designerHelpLabel,
  parseDesignRequest,
  type DesignRequestErrors,
  type DesignRequestKind,
} from "@/lib/studio/designerHelp";
import { studioDesignerT } from "@/lib/studio/i18n.designer";
import { turnstileHeaders, turnstileRejected } from "@/lib/turnstile/client";
import { TURNSTILE_ERROR } from "@/lib/turnstile/config";
import { useShopLang } from "../ShopLangProvider";

/**
 * «Помощь дизайнера» / «We design it for you» (Studio v2, item 6): the button
 * on mug / pen product pages and the request dialog (also used by
 * `StudioDesignerCard` in the Studio template gallery). Posts to
 * `/api/shop/design-request` (stored as a corporate request marked
 * «Помощь дизайнера»). Files go through the corporate upload flow.
 *
 * Automation: `data-designer-help="button|dialog|form|done"`.
 */

export interface DesignerHelpTarget {
  kind: DesignRequestKind;
  /** Product page slug, if any. */
  slug?: string | null;
  /** Picked colour / variant label, if any. */
  variant?: string | null;
  productName?: string | null;
  source: "product" | "studio";
}

type Config = { priceLei: number | null; turnstileSiteKey: string | null };
let configPromise: Promise<Config> | null = null;

/** `GET /api/shop/design-request` once per page (price + Turnstile site key). */
export function loadDesignerHelpConfig(): Promise<Config> {
  configPromise ??= fetch("/api/shop/design-request", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Config>) : { priceLei: null, turnstileSiteKey: null }))
    .catch(() => {
      configPromise = null;
      return { priceLei: null, turnstileSiteKey: null };
    });
  return configPromise;
}

/** The price from the server prop, else fetched (undefined while loading). */
export function useDesignerHelpPrice(initial?: number | null): number | null | undefined {
  const [price, setPrice] = useState<number | null | undefined>(initial);
  useEffect(() => {
    if (initial !== undefined) return;
    let alive = true;
    void loadDesignerHelpConfig().then((c) => alive && setPrice(c.priceLei));
    return () => {
      alive = false;
    };
  }, [initial]);
  return price;
}

/** Product page button (mugs, pens). */
export function DesignerHelpButton({ target, priceLei }: { target: DesignerHelpTarget; priceLei?: number | null }) {
  const { lang } = useShopLang();
  const t = studioDesignerT(lang);
  const price = useDesignerHelpPrice(priceLei);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-designer-help="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-start gap-1 rounded-[14px] border-2 border-dashed border-(--line2) p-4 text-left hover:border-(--ink)"
      >
        <b className="flex items-center gap-2">
          <PaletteIcon /> {designerHelpLabel(lang, price ?? null)}
        </b>
        <span className="text-sm leading-snug text-(--muted)">{t("cardText")}</span>
      </button>
      {open ? <DesignerHelpDialog target={target} priceLei={price ?? null} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function PaletteIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="8" r="1" />
    </svg>
  );
}

type UploadItem = { id: string; name: string; pct: number; ref: ShopFileRef | null; error: string | null };

const field =
  "min-h-11 w-full rounded-xl border border-(--line2) bg-white px-3 py-2 text-[15px] outline-none focus:border-(--ink)";

export function DesignerHelpDialog({
  target,
  priceLei,
  onClose,
}: {
  target: DesignerHelpTarget;
  priceLei: number | null;
  onClose: () => void;
}) {
  const { lang, href } = useShopLang();
  const t = studioDesignerT(lang);
  const titleId = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [errors, setErrors] = useState<DesignRequestErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ number: number | null } | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void loadDesignerHelpConfig().then((c) => alive && setSiteKey(c.turnstileSiteKey));
    firstInput.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = DESIGN_REQUEST_MAX_FILES - files.length;
    for (const file of Array.from(list).slice(0, Math.max(0, room))) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setFiles((fs) => [...fs, { id, name: file.name, pct: 0, ref: null, error: null }]);
      const patch = (p: Partial<UploadItem>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
      uploadCorporateFile(file, (pct) => patch({ pct }))
        .then((ref) => patch({ ref, pct: 100 }))
        .catch((e: unknown) => {
          const code = e instanceof CorporateUploadError ? e.code : "failed";
          patch({ error: code === "file_type" ? t("errFileType") : code === "too_big" ? t("errFileBig") : t("errFailed") });
        });
    }
    setErrors((er) => ({ ...er, files: undefined }));
  };

  const errText = (code: string | undefined, f: "name" | "phone" | "email" | "message" | "consent" | "files"): string | null => {
    if (!code) return null;
    if (code === "contact") return t("errContact");
    if (code === "consent") return t("errConsent");
    if (code === "file_type") return t("errFileType");
    if (code === "file_too_large") return t("errFileBig");
    if (f === "phone") return t("errPhone");
    if (f === "email") return t("errEmail");
    if (f === "files") return t("errFailed");
    return t("errRequired");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (files.some((f) => !f.ref && !f.error)) {
      setFormError(t("errUploading"));
      return;
    }
    const body = {
      name,
      phone,
      email,
      message,
      kind: target.kind,
      slug: target.slug ?? "",
      variant: target.variant ?? "",
      source: target.source,
      files: files.flatMap((f) => (f.ref ? [f.ref] : [])),
      consent,
      lang,
      [DESIGN_REQUEST_HONEYPOT_FIELD]: honeypot,
    };
    const local = parseDesignRequest(body);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/shop/design-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await turnstileHeaders()) },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { number?: number | null; error?: string; fields?: DesignRequestErrors } | null;
      if (res.status === 201) {
        setDone({ number: data?.number ?? null });
      } else if (res.status === 400 && data?.fields) {
        setErrors(data.fields);
      } else if (res.status === 429) {
        setFormError(t("errTooMany"));
      } else if (res.status === 403 && data?.error === TURNSTILE_ERROR) {
        turnstileRejected();
        setFormError(t("errFailed"));
      } else {
        setFormError(t("errFailed"));
      }
    } catch {
      setFormError(t("errFailed"));
    } finally {
      setSending(false);
    }
  };

  const lead = target.productName ? t("dialogLead", { product: target.productName }) : t("dialogLeadNoProduct");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-designer-help="dialog"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(20,33,61,0.45)] md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="m-0 flex items-center gap-2 text-lg font-extrabold">
            <PaletteIcon /> {t("dialogTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="-m-1 rounded-lg p-2 text-xl leading-none text-(--muted)">
            ×
          </button>
        </div>

        {done ? (
          <div data-designer-help="done" className="flex flex-col gap-3">
            <p className="m-0 rounded-xl bg-(--soft) px-3 py-3 text-[15px]">
              <b className="block">{t("doneTitle")}</b>
              {done.number != null ? t("doneText", { number: done.number }) : t("doneTextNoNumber")}
            </p>
            <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-(--ink) px-4 font-extrabold text-white">
              {t("close")}
            </button>
          </div>
        ) : (
          <form data-designer-help="form" noValidate onSubmit={submit} className="flex flex-col gap-3">
            <p className="m-0 text-sm leading-snug text-(--muted)">{lead}</p>
            <p className="m-0 rounded-xl bg-(--soft) px-3 py-2 text-sm font-semibold">
              {priceLei != null ? t("priceFrom", { price: formatPrice(priceLei, lang) }) : t("priceUnknown")}
            </p>

            <Field label={t("name")} error={errText(errors.name, "name")}>
              <input ref={firstInput} name="name" autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("phone")} error={errText(errors.phone, "phone")}>
                <input name="phone" type="tel" inputMode="tel" autoComplete="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
              </Field>
              <Field label={t("email")} error={errText(errors.email, "email")}>
                <input name="email" type="email" autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
              </Field>
            </div>
            <span className="-mt-2 text-xs text-(--muted2)">{t("contactHint")}</span>
            <Field label={t("message")} error={errText(errors.message, "message")}>
              <textarea
                name="message"
                rows={4}
                className={`${field} resize-y`}
                placeholder={t("messagePlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={3000}
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{t("files")}</span>
              <span className="text-xs text-(--muted2)">{t("filesHint")}</span>
              {files.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-lg bg-(--soft) px-2.5 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className={`text-xs ${f.error ? "text-(--err)" : "text-(--muted2)"}`}>{f.error ?? (f.ref ? "✓" : `${f.pct}%`)}</span>
                      <button type="button" className="text-xs underline" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}>
                        {t("remove")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {files.length < DESIGN_REQUEST_MAX_FILES ? (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="min-h-11 self-start rounded-xl border border-(--line2) px-4 text-sm font-bold"
                >
                  + {t("addFiles")}
                </button>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={CORPORATE_FILE_ACCEPT}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {errors.files ? <span className="text-sm text-(--err)">{errText(errors.files, "files")}</span> : null}
            </div>

            {/* Honeypot: hidden from people. */}
            <input
              type="text"
              name={DESIGN_REQUEST_HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-px w-px opacity-0"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {t("consent")}{" "}
                <a href={href("/shop/confidentialitate")} target="_blank" rel="noreferrer" className="underline">
                  {t("privacy")}
                </a>
              </span>
            </label>
            {errors.consent ? <span className="-mt-2 text-sm text-(--err)">{t("errConsent")}</span> : null}

            {siteKey ? <TurnstileWidget siteKey={siteKey} action="corporate" lang={lang} /> : null}
            {formError ? (
              <p role="alert" className="m-0 rounded-xl bg-[#fdecea] px-3 py-2 text-sm font-bold text-[#a82e22]">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-(--line2) px-4 font-bold">
                {t("cancel")}
              </button>
              <button type="submit" disabled={sending} className="min-h-12 rounded-xl bg-(--ink) px-5 font-extrabold text-white disabled:opacity-50">
                {sending ? t("sending") : t("send")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error: string | null; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold">{label}</span>
      {children}
      {error ? <span className="text-sm text-(--err)">{error}</span> : null}
    </label>
  );
}
