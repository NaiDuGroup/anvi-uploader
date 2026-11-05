"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CORPORATE_HONEYPOT_FIELD,
  CORPORATE_INTERESTS,
  CORPORATE_MAX_FILES,
  CORPORATE_QUANTITIES,
  chisinauToday,
  parseCorporateRequest,
  type CorporateFieldErrors,
  type CorporateInterest,
} from "@/lib/corporate/requestRules";
import {
  clearCorporateFieldError,
  firstCorporateErrorField,
  type CorporateFormErrors,
  type CorporateFormField,
} from "@/lib/corporate/formFields";
import { CORP_INTEREST_LABEL, corpQuantityLabel, corpT } from "@/lib/storefront/corporateText";
import { CORPORATE_FILE_ACCEPT, CORPORATE_FILE_MAX_BYTES, checkCorporateFile } from "@/lib/corporate/fileTypes";
import { CorporateUploadError, uploadCorporateFile } from "@/lib/corporate/upload";
import { turnstileHeaders, turnstileRejected } from "@/lib/turnstile/client";
import { TURNSTILE_ERROR } from "@/lib/turnstile/config";
import { turnstileText } from "@/lib/turnstile/texts";
import type { ShopFileRef } from "@/lib/storefront/types";
import { useShopLang } from "./ShopLangProvider";

const inputCls = "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-(--soft) px-3.5 py-3 text-base font-medium";
const errCls = "text-[13px] font-semibold text-(--err)";
/** Chips hide their input (`sr-only`): the keyboard focus shows on the chip. */
const chipFocusCls = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ink)";

export interface CompanyContactLink {
  label: string;
  href: string;
}

type UploadItem =
  | { id: number; status: "uploading"; name: string; pct: number }
  | { id: number; status: "done"; ref: ShopFileRef }
  | { id: number; status: "error"; name: string; message: string };

/**
 * «Cere o ofertă» — the «Pentru companii» quote form. Validates in the
 * browser with the same rules as the server (`parseCorporateRequest`),
 * uploads the logo / brief right away (order-scope upload), then posts
 * to `/api/shop/corporate-request` and opens the confirmation page.
 */
export function CompanyRequestForm({ contacts }: { contacts: CompanyContactLink[] }) {
  const { lang, href } = useShopLang();
  const c = corpT(lang);
  const router = useRouter();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [products, setProducts] = useState<CorporateInterest[]>([]);
  const [productsOther, setProductsOther] = useState("");
  const [quantity, setQuantity] = useState("");
  const [deadline, setDeadline] = useState("");
  const [budget, setBudget] = useState("");
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [errors, setErrors] = useState<CorporateFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const today = chisinauToday();

  /** DOM id of a field's control (the first chip for a chip group) and of its error text. */
  const fid = (f: CorporateFormField) => `${uid}-${f}`;
  const eid = (f: CorporateFormField) => `${uid}-${f}-err`;

  /** A field changed: its error goes away (the others stay until the next submit). */
  const clearErr = useCallback((f: CorporateFormField) => setErrors((cur) => clearCorporateFieldError(cur, f)), []);

  /** Scroll to the first wrong field (page order) and focus it. */
  const focusFirstError = (errs: Readonly<Record<string, string | undefined>>) => {
    const first = firstCorporateErrorField(errs);
    if (!first) return;
    // The controls are already on the page (only their error state re-renders), so no wait is needed.
    const el = document.getElementById(`${uid}-${first}`);
    if (!el) return;
    const box: Element = el.closest("[data-corp-field]") ?? el;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  };

  const toggleProduct = (p: CorporateInterest) => {
    setProducts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
    clearErr("products");
    // Unticking «Altceva» hides its text field: its error goes with it.
    if (p === "other") clearErr("productsOther");
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = CORPORATE_MAX_FILES - files.length;
    const fileError = (code: "file_type" | "too_big" | "failed") =>
      code === "file_type"
        ? c("errFileType")
        : code === "too_big"
          ? c("errFileTooBig", { mb: Math.round(CORPORATE_FILE_MAX_BYTES / (1024 * 1024)) })
          : c("errUpload");
    for (const file of Array.from(list).slice(0, Math.max(0, room))) {
      const id = nextId.current++;
      // Same rules as the server: a wrong type / size is shown right away and never uploaded.
      const check = checkCorporateFile({ name: file.name, contentType: file.type, size: file.size });
      if (!check.ok) {
        const message = fileError(check.reason === "file_type" ? "file_type" : "too_big");
        setFiles((cur) => [...cur, { id, status: "error", name: file.name, message }]);
        continue;
      }
      setFiles((cur) => [...cur, { id, status: "uploading", name: file.name, pct: 0 }]);
      uploadCorporateFile(file, (pct) =>
        setFiles((cur) => cur.map((f) => (f.id === id && f.status === "uploading" ? { ...f, pct } : f))),
      )
        .then((ref) => setFiles((cur) => cur.map((f) => (f.id === id ? { id, status: "done", ref } : f))))
        .catch((e: unknown) =>
          setFiles((cur) =>
            cur.map((f) =>
              f.id === id
                ? {
                    id,
                    status: "error",
                    name: file.name,
                    message: fileError(e instanceof CorporateUploadError ? e.code : "failed"),
                  }
                : f,
            ),
          ),
        );
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const body = () => ({
    companyName,
    contactName,
    phone,
    email,
    products,
    productsOther,
    quantity,
    deadline,
    budget,
    hasLogo: hasLogo ?? undefined,
    files: files.flatMap((f) => (f.status === "done" ? [f.ref] : [])).map((r) => ({
      fileKey: r.fileKey,
      fileName: r.fileName,
      ...(r.sizeBytes != null ? { sizeBytes: r.sizeBytes } : {}),
    })),
    message,
    consent,
    lang,
    [CORPORATE_HONEYPOT_FIELD]: honeypot,
  });

  const errorText = (field: keyof typeof errors): string | null => {
    const code = errors[field];
    if (!code) return null;
    if (field === "email") return c("errEmail");
    if (field === "phone") return c("errPhone");
    if (field === "products") return c("errProducts");
    if (field === "deadline") return c("errDeadline");
    if (field === "files") return code === "file_too_large" ? c("errFileTooBig", { mb: Math.round(CORPORATE_FILE_MAX_BYTES / (1024 * 1024)) }) : c("errFileType");
    if (field === "consent") return c("errConsent");
    return c("errRequired");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearErr("files");
    if (files.some((f) => f.status === "uploading")) {
      setFormError(c("errUploading"));
      return;
    }
    const payload = body();
    const local = parseCorporateRequest(payload);
    const errs: typeof errors = local.ok ? {} : { ...local.errors };
    if (hasLogo == null) errs.hasLogo = "required";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/shop/corporate-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await turnstileHeaders()) },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as {
        number?: number | null;
        error?: string;
        fields?: CorporateFieldErrors;
      } | null;
      if (res.ok) {
        const n = data?.number;
        router.push(href(`/shop/companii/multumim${n ? `?nr=${n}` : ""}`));
        return;
      }
      if (res.status === 403 && data?.error === TURNSTILE_ERROR) {
        // Anti-bot check failed: a fresh check starts now, the next «Trimite» retries.
        turnstileRejected();
        setFormError(turnstileText(lang, "failed"));
        return;
      }
      if (res.status === 400 && data?.fields) {
        setErrors(data.fields);
        focusFirstError(data.fields);
      }
      setFormError(res.status === 429 ? c("errTooMany") : c("errGeneric"));
    } catch {
      setFormError(c("errGeneric"));
    } finally {
      setSending(false);
    }
  };

  const field = (
    name: "companyName" | "contactName" | "phone" | "email" | "budget",
    label: string,
    value: string,
    set: (v: string) => void,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => {
    const err = errorText(name);
    return (
      <div data-corp-field className="flex flex-col gap-1.5 text-sm font-semibold">
        <label htmlFor={fid(name)}>{label}</label>
        <input
          id={fid(name)}
          className={inputCls}
          value={value}
          onChange={(e) => {
            set(e.target.value);
            clearErr(name);
          }}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? eid(name) : undefined}
          {...extra}
        />
        {err ? (
          <span id={eid(name)} className={errCls}>
            {err}
          </span>
        ) : null}
      </div>
    );
  };

  const productsErr = errorText("products");
  const otherErr = errorText("productsOther");
  const qtyErr = errorText("quantity");
  const deadlineErr = errorText("deadline");
  const consentErr = errorText("consent");
  const filesErr = errorText("files");

  return (
    <form
      id="cerere"
      aria-labelledby={`${uid}-title`}
      onSubmit={submit}
      noValidate
      className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${uid}-title`} className="m-0 text-xl font-extrabold">
          {c("formTitle")}
        </h2>
        <p className="m-0 text-sm text-(--muted)">{c("formIntro")}</p>
      </div>

      {/* Honeypot: off-screen, skipped by keyboard and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name={CORPORATE_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {field("companyName", c("company"), companyName, setCompanyName, { autoComplete: "organization", maxLength: 200 })}
      {field("contactName", c("contactName"), contactName, setContactName, { autoComplete: "name", maxLength: 120 })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("phone", c("phone"), phone, setPhone, { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 40 })}
        {field("email", c("email"), email, setEmail, { type: "email", autoComplete: "email", maxLength: 200 })}
      </div>

      <fieldset
        data-corp-field
        className="m-0 flex flex-col gap-2 border-0 p-0"
        aria-describedby={productsErr ? eid("products") : undefined}
      >
        <legend className="mb-2 p-0 text-sm font-semibold">{c("products")}</legend>
        <div className="flex flex-wrap gap-2">
          {CORPORATE_INTERESTS.map((p, i) => {
            const on = products.includes(p);
            const id = i === 0 ? fid("products") : `${fid("products")}-${p}`;
            return (
              <label
                key={p}
                htmlFor={id}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${chipFocusCls} ${
                  on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => toggleProduct(p)}
                  aria-invalid={productsErr ? true : undefined}
                  aria-describedby={productsErr ? eid("products") : undefined}
                />
                {CORP_INTEREST_LABEL[p][lang]}
              </label>
            );
          })}
        </div>
        {productsErr ? (
          <span id={eid("products")} className={errCls}>
            {productsErr}
          </span>
        ) : null}
      </fieldset>
      {products.includes("other") ? (
        <div data-corp-field className="flex flex-col gap-1.5 text-sm font-semibold">
          <label htmlFor={fid("productsOther")}>{c("productsOther")}</label>
          <input
            id={fid("productsOther")}
            className={inputCls}
            value={productsOther}
            onChange={(e) => {
              setProductsOther(e.target.value);
              clearErr("productsOther");
            }}
            maxLength={300}
            aria-invalid={otherErr ? true : undefined}
            aria-describedby={otherErr ? eid("productsOther") : undefined}
          />
          {otherErr ? (
            <span id={eid("productsOther")} className={errCls}>
              {otherErr}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div data-corp-field className="flex flex-col gap-1.5 text-sm font-semibold">
          <label htmlFor={fid("quantity")}>{c("quantity")}</label>
          <select
            id={fid("quantity")}
            className={inputCls}
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              clearErr("quantity");
            }}
            aria-invalid={qtyErr ? true : undefined}
            aria-describedby={qtyErr ? eid("quantity") : undefined}
          >
            <option value="">{c("quantityPick")}</option>
            {CORPORATE_QUANTITIES.map((q) => (
              <option key={q} value={q}>
                {corpQuantityLabel(q, lang)}
              </option>
            ))}
          </select>
          {qtyErr ? (
            <span id={eid("quantity")} className={errCls}>
              {qtyErr}
            </span>
          ) : null}
        </div>
        <div data-corp-field className="flex flex-col gap-1.5 text-sm font-semibold">
          <label htmlFor={fid("deadline")}>{c("deadline")}</label>
          <input
            id={fid("deadline")}
            type="date"
            className={inputCls}
            value={deadline}
            min={today}
            onChange={(e) => {
              setDeadline(e.target.value);
              clearErr("deadline");
            }}
            onBlur={(e) => {
              // A typed past date (the `min` does not stop typing): say so right away, not only on «Trimite».
              const v = e.target.value;
              if (v && v < today) setErrors((cur) => ({ ...cur, deadline: "invalid" }));
            }}
            aria-invalid={deadlineErr ? true : undefined}
            aria-describedby={deadlineErr ? eid("deadline") : undefined}
          />
          {deadlineErr ? (
            <span id={eid("deadline")} className={errCls}>
              {deadlineErr}
            </span>
          ) : null}
        </div>
      </div>

      {field("budget", c("budget"), budget, setBudget, { placeholder: c("budgetPlaceholder"), maxLength: 120 })}

      <fieldset
        data-corp-field
        className="m-0 flex flex-col gap-2 border-0 p-0"
      >
        <legend id={`${uid}-hasLogo-legend`} className="mb-2 p-0 text-sm font-semibold">
          {c("hasLogo")}
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-hasLogo-legend`}
          aria-invalid={errors.hasLogo ? true : undefined}
          aria-describedby={errors.hasLogo ? eid("hasLogo") : undefined}
          className="flex flex-wrap gap-2"
        >
          {([true, false] as const).map((v) => {
            const id = v ? fid("hasLogo") : `${fid("hasLogo")}-no`;
            return (
              <label
                key={String(v)}
                htmlFor={id}
                className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${chipFocusCls} ${
                  hasLogo === v ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name={`${uid}-logo`}
                  className="sr-only"
                  checked={hasLogo === v}
                  onChange={() => {
                    setHasLogo(v);
                    clearErr("hasLogo");
                  }}
                />
                {v ? c("yes") : c("no")}
              </label>
            );
          })}
        </div>
        {errors.hasLogo ? (
          <span id={eid("hasLogo")} className={errCls}>
            {c("errRequired")}
          </span>
        ) : null}
      </fieldset>

      <div data-corp-field role="group" aria-labelledby={`${uid}-files-title`} className="flex flex-col gap-2">
        <span id={`${uid}-files-title`} className="text-sm font-semibold">
          {c("files")}
        </span>
        <span id={`${uid}-files-hint`} className="text-xs text-(--muted)">
          {c("filesHint", { n: CORPORATE_MAX_FILES })}
        </span>
        {files.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-(--soft) px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {f.status === "done" ? f.ref.fileName : f.name}
                  {f.status === "uploading" ? <span className="ml-2 text-(--muted)">{f.pct}%</span> : null}
                  {f.status === "error" ? <span className={`ml-2 ${errCls}`}>{f.message}</span> : null}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-sm font-bold underline"
                  aria-label={`${c("remove")}: ${f.status === "done" ? f.ref.fileName : f.name}`}
                  onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                >
                  {c("remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length < CORPORATE_MAX_FILES ? (
          <>
            <input
              ref={fileInput}
              id={fid("files")}
              type="file"
              multiple
              accept={CORPORATE_FILE_ACCEPT}
              className="sr-only"
              aria-describedby={`${uid}-files-hint`}
              onChange={(e) => addFiles(e.target.files)}
            />
            <label
              htmlFor={fid("files")}
              className={`inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border-[1.5px] border-dashed border-(--line2) px-4 text-sm font-bold ${chipFocusCls}`}
            >
              + {c("addFile")}
            </label>
          </>
        ) : null}
        {filesErr ? (
          <span id={eid("files")} className={errCls}>
            {filesErr}
          </span>
        ) : null}
      </div>

      <div data-corp-field className="flex flex-col gap-1.5 text-sm font-semibold">
        <label htmlFor={fid("message")}>{c("message")}</label>
        <textarea
          id={fid("message")}
          className={`${inputCls} min-h-28`}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            clearErr("message");
          }}
          placeholder={c("messagePlaceholder")}
          maxLength={3000}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? eid("message") : undefined}
        />
        {errors.message ? (
          <span id={eid("message")} className={errCls}>
            {errorText("message")}
          </span>
        ) : null}
      </div>

      <div data-corp-field className="flex flex-col gap-2">
        <div className="flex items-start gap-2.5 text-sm">
          <input
            id={fid("consent")}
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clearErr("consent");
            }}
            aria-invalid={consentErr ? true : undefined}
            aria-describedby={consentErr ? eid("consent") : undefined}
          />
          <span>
            <label htmlFor={fid("consent")}>{c("consent")}</label>{" "}
            <a href={href("/shop/confidentialitate")} target="_blank" rel="noopener" className="underline">
              {c("privacyLink")}
            </a>
          </span>
        </div>
        {consentErr ? (
          <span id={eid("consent")} className={errCls}>
            {consentErr}
          </span>
        ) : null}
      </div>

      {formError ? (
        <div role="alert" className="rounded-[10px] bg-(--err-soft) px-3.5 py-3 text-sm font-semibold text-(--err)">
          {formError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={sending}
        className="shop-btn-dark rounded-xl bg-(--ink) py-3.5 font-extrabold text-white disabled:opacity-60"
      >
        {sending ? c("sending") : c("submit")}
      </button>

      {contacts.length ? (
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-(--muted)">{c("orWrite")}</span>
          <span className="flex flex-wrap gap-2">
            {contacts.map((ct) => (
              <a key={ct.href} href={ct.href} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 font-bold no-underline">
                {ct.label}
              </a>
            ))}
          </span>
        </div>
      ) : null}
    </form>
  );
}
