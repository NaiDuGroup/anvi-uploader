"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { newLineId } from "@/lib/storefront/cart";
import { dispatchCart } from "@/lib/storefront/cartStore";
import type { RepeatLine } from "@/lib/shop/account/accountRules";
import { useShopLang } from "../ShopLangProvider";

const inputCls =
  "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3.5 py-3 text-base font-medium text-(--ink) aria-[invalid=true]:border-(--err)";
const btnDark = "shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold text-white disabled:opacity-60";

async function postJson(url: string, body: unknown, method = "POST"): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

/** «Intră în cont»: e-mail → link + 6-digit code; the code can be typed here. */
export function AccountLogin({ next = null }: { next?: string | null }) {
  const { t, lang, href } = useShopLang();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (status: number, body: Record<string, unknown> | null): string =>
    status === 429
      ? t("accRateLimited")
      : body?.error === "invalid_email"
        ? t("errEmail")
        : body?.error === "accounts_unavailable"
          ? t("accUnavailable")
          : t("accError");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("errEmail"));
      return;
    }
    setBusy(true);
    try {
      const r = await postJson("/api/shop/account/login", { email: email.trim(), lang });
      if (r.status === 200) setStep("code");
      else setError(errorText(r.status, r.body));
    } catch {
      setError(t("errNetwork"));
    }
    setBusy(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await postJson("/api/shop/account/verify", { email: email.trim(), code, next });
      if (r.status === 200) {
        const to = typeof r.body?.next === "string" ? r.body.next : "/cont";
        window.location.assign(href(`/shop${to}`));
        return;
      }
      setError(r.status === 400 ? t("accCodeWrong") : errorText(r.status, r.body));
    } catch {
      setError(t("errNetwork"));
    }
    setBusy(false);
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={send} noValidate className="flex flex-col gap-3.5">
          <p className="m-0 leading-relaxed text-(--muted)">{t("accLoginText")}</p>
          <label htmlFor="acc-email" className="text-sm font-semibold">
            {t("accEmail")}
          </label>
          <input
            id="acc-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className={inputCls}
            value={email}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@example.md"
          />
          <button type="submit" disabled={busy} className={btnDark}>
            {busy ? t("accSending") : t("accSendLink")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="flex flex-col gap-3.5">
          <h2 className="m-0 text-xl font-extrabold">{t("accSentTitle")}</h2>
          <p role="status" className="m-0 leading-relaxed text-(--muted)">
            {t("accSentText", { email: email.trim() })}
          </p>
          <label htmlFor="acc-code" className="text-sm font-semibold">
            {t("accCodeLabel")}
          </label>
          <input
            id="acc-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className={`${inputCls} text-center text-2xl tracking-[0.4em]`}
            value={code}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={btnDark}>
            {t("accCodeSubmit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="inline-flex min-h-10 items-center self-start font-semibold underline"
          >
            {t("accOtherEmail")}
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-(--err)">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * «/cont/verifica?token=…»: one click signs in. A button (not an automatic
 * request on load), so mail scanners that open links do not burn the
 * single-use token.
 */
export function AccountVerify({ token, next = null }: { token: string; next?: string | null }) {
  const { t, href } = useShopLang();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(token ? null : t("accVerifyFailed"));
  const go = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const r = await postJson("/api/shop/account/verify", { token, next });
      if (r.status === 200) {
        const to = typeof r.body?.next === "string" ? r.body.next : "/cont";
        window.location.assign(href(`/shop${to}`));
        return;
      }
      setFailed(r.status === 429 ? t("accRateLimited") : r.status === 400 ? t("accVerifyFailed") : t("accError"));
    } catch {
      setFailed(t("errNetwork"));
    }
    setBusy(false);
  };
  return (
    <div className="flex max-w-md flex-col gap-4">
      {token ? <p className="m-0 leading-relaxed text-(--muted)">{t("accVerifyText")}</p> : null}
      {token ? (
        <button type="button" onClick={go} disabled={busy} className={btnDark}>
          {t("accLoginTitle")}
        </button>
      ) : null}
      {failed ? (
        <>
          <p role="alert" className="m-0 font-semibold text-(--err)">
            {failed}
          </p>
          <Link href={href("/shop/cont")} className="self-start font-semibold underline">
            {t("accNewLink")}
          </Link>
        </>
      ) : null}
    </div>
  );
}

export function LogoutButton() {
  const { t, href } = useShopLang();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/shop/account/logout", { method: "POST" }).catch(() => null);
        window.location.assign(href("/shop/cont"));
      }}
      className="inline-flex min-h-11 items-center self-start rounded-xl bg-(--soft) px-5 font-bold"
    >
      {t("accLogout")}
    </button>
  );
}

/** «Repetă comanda»: the order's lines (same stored files) go into the cart, then the cart opens. */
export function RepeatOrderButton({ orderNumber }: { orderNumber: number }) {
  const { t, lang, href } = useShopLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/shop/account/orders/${orderNumber}/repeat?lang=${lang}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { lines?: RepeatLine[]; skipped?: number } | null;
      if (!res.ok || !body?.lines) {
        setMsg(t("accError"));
        setBusy(false);
        return;
      }
      if (body.lines.length === 0) {
        setMsg(t("repeatNothing"));
        setBusy(false);
        return;
      }
      const now = Date.now();
      for (const l of body.lines) dispatchCart({ type: "add", line: { ...l, id: newLineId(), addedAt: now } });
      if (body.skipped) window.alert(t("repeatSkipped", { n: body.skipped }));
      router.push(href("/shop/cos"));
    } catch {
      setMsg(t("errNetwork"));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={busy} className={`${btnDark} self-start`}>
        {busy ? t("repeatAdding") : t("repeatOrder")}
      </button>
      {msg ? (
        <span role="alert" className="text-sm font-semibold text-(--err)">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
