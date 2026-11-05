"use client";

import { useId, useRef, useState } from "react";
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
import { CORP_INTEREST_LABEL, corpQuantityLabel, corpT } from "@/lib/storefront/corporateText";
import { ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import type { ShopFileRef } from "@/lib/storefront/types";
import { useShopLang } from "./ShopLangProvider";

const inputCls = "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-(--soft) px-3.5 py-3 text-base font-medium";
const errCls = "text-[13px] font-semibold text-(--err)";

export interface CompanyContactLink {
  label: string;
  href: string;
}

type UploadItem =
  | { id: number; status: "uploading"; name: string; pct: number }
  | { id: number; status: "done"; ref: ShopFileRef }
  | { id: number; status: "error"; name: string; message: string };

const FILE_ACCEPT =
  ".pdf,.ai,.eps,.svg,.cdr,.psd,.png,.jpg,.jpeg,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,image/*,application/pdf";

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
  const [errors, setErrors] = useState<CorporateFieldErrors & { hasLogo?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const today = chisinauToday();

  const toggleProduct = (p: CorporateInterest) =>
    setProducts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = CORPORATE_MAX_FILES - files.length;
    for (const file of Array.from(list).slice(0, Math.max(0, room))) {
      const id = nextId.current++;
      setFiles((cur) => [...cur, { id, status: "uploading", name: file.name, pct: 0 }]);
      uploadArtwork(file, (pct) =>
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
                    message: e instanceof ShopUploadError && e.code === "too_big" ? "too_big" : c("errUpload"),
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
    if (field === "consent") return c("errConsent");
    return c("errRequired");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
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
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/shop/corporate-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (res.status === 400 && data?.fields) setErrors(data.fields);
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
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {label}
        <input
          className={inputCls}
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${uid}-${name}-err` : undefined}
          {...extra}
        />
        {err ? (
          <span id={`${uid}-${name}-err`} className={errCls}>
            {err}
          </span>
        ) : null}
      </label>
    );
  };

  const productsErr = errorText("products");
  const otherErr = errorText("productsOther");
  const qtyErr = errorText("quantity");
  const deadlineErr = errorText("deadline");
  const consentErr = errorText("consent");

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

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-invalid={productsErr ? true : undefined}>
        <legend className="mb-2 p-0 text-sm font-semibold">{c("products")}</legend>
        <div className="flex flex-wrap gap-2">
          {CORPORATE_INTERESTS.map((p) => {
            const on = products.includes(p);
            return (
              <label
                key={p}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${
                  on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleProduct(p)} />
                {CORP_INTEREST_LABEL[p][lang]}
              </label>
            );
          })}
        </div>
        {productsErr ? <span className={errCls}>{productsErr}</span> : null}
      </fieldset>
      {products.includes("other") ? (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {c("productsOther")}
          <input
            className={inputCls}
            value={productsOther}
            onChange={(e) => setProductsOther(e.target.value)}
            maxLength={300}
            aria-invalid={otherErr ? true : undefined}
          />
          {otherErr ? <span className={errCls}>{otherErr}</span> : null}
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {c("quantity")}
          <select
            className={inputCls}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={qtyErr ? true : undefined}
          >
            <option value="">{c("quantityPick")}</option>
            {CORPORATE_QUANTITIES.map((q) => (
              <option key={q} value={q}>
                {corpQuantityLabel(q, lang)}
              </option>
            ))}
          </select>
          {qtyErr ? <span className={errCls}>{qtyErr}</span> : null}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {c("deadline")}
          <input
            type="date"
            className={inputCls}
            value={deadline}
            min={today}
            onChange={(e) => setDeadline(e.target.value)}
            aria-invalid={deadlineErr ? true : undefined}
          />
          {deadlineErr ? <span className={errCls}>{deadlineErr}</span> : null}
        </label>
      </div>

      {field("budget", c("budget"), budget, setBudget, { placeholder: c("budgetPlaceholder"), maxLength: 120 })}

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-invalid={errors.hasLogo ? true : undefined}>
        <legend className="mb-2 p-0 text-sm font-semibold">{c("hasLogo")}</legend>
        <div className="flex flex-wrap gap-2">
          {([true, false] as const).map((v) => (
            <label
              key={String(v)}
              className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${
                hasLogo === v ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
              }`}
            >
              <input type="radio" name={`${uid}-logo`} className="sr-only" checked={hasLogo === v} onChange={() => setHasLogo(v)} />
              {v ? c("yes") : c("no")}
            </label>
          ))}
        </div>
        {errors.hasLogo ? <span className={errCls}>{c("errRequired")}</span> : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{c("files")}</span>
        <span className="text-xs text-(--muted)">{c("filesHint", { n: CORPORATE_MAX_FILES })}</span>
        {files.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-(--soft) px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {f.status === "done" ? f.ref.fileName : f.name}
                  {f.status === "uploading" ? <span className="ml-2 text-(--muted)">{f.pct}%</span> : null}
                  {f.status === "error" ? <span className={`ml-2 ${errCls}`}>{f.message === "too_big" ? c("errUpload") : f.message}</span> : null}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-sm font-bold underline"
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
              id={`${uid}-files`}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
            />
            <label
              htmlFor={`${uid}-files`}
              className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border-[1.5px] border-dashed border-(--line2) px-4 text-sm font-bold"
            >
              + {c("addFile")}
            </label>
          </>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {c("message")}
        <textarea
          className={`${inputCls} min-h-28`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={c("messagePlaceholder")}
          maxLength={3000}
        />
      </label>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={consentErr ? true : undefined}
        />
        <span>
          {c("consent")}{" "}
          <a href={href("/shop/confidentialitate")} target="_blank" rel="noopener" className="underline">
            {c("privacyLink")}
          </a>
        </span>
      </label>
      {consentErr ? <span className={`-mt-2 ${errCls}`}>{consentErr}</span> : null}

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
