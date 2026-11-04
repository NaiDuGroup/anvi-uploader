/**
 * E-mail provider abstraction. With `RESEND_API_KEY` + `EMAIL_FROM` set, mail
 * goes through the Resend HTTP API (plain `fetch`, no SDK). Without them the
 * e-mail is only logged (console; the full text outside production) and
 * counts as sent. Every attempt is recorded in `email_log` (no bodies — they
 * hold login links). `sendEmail` never throws: callers (checkout, payment,
 * admin) must not fail because of mail.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template id for the log («login», «order_paid», …). */
  template: string;
  lang?: string | null;
  orderId?: string | null;
  shopCustomerId?: string | null;
  replyTo?: string | null;
}

export interface SendResult {
  provider: "resend" | "console";
  status: "sent" | "logged" | "failed";
  providerId?: string;
  error?: string;
}

export interface EmailLogRow {
  to: string;
  template: string;
  subject: string;
  lang: string | null;
  provider: string;
  status: string;
  providerId: string | null;
  error: string | null;
  orderId: string | null;
  shopCustomerId: string | null;
}

export interface EmailDeps {
  env?: Env;
  fetch?: typeof fetch;
  /** Writes one `email_log` row; failures are ignored. */
  log?: (row: EmailLogRow) => Promise<unknown>;
  console?: Pick<Console, "info" | "error">;
}

export function emailProviderConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;

async function defaultLog(row: EmailLogRow) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.emailLog.create({ data: row });
}

export async function sendEmail(mail: OutgoingEmail, deps: EmailDeps = {}): Promise<SendResult> {
  const env = deps.env ?? process.env;
  const out = deps.console ?? console;
  const log = deps.log ?? defaultLog;
  let result: SendResult;
  try {
    if (!emailProviderConfigured(env)) {
      if (env.NODE_ENV === "production") {
        out.info(`[email] (no provider) ${mail.template} → ${mail.to}: ${mail.subject}`);
      } else {
        out.info(`[email] (no provider) ${mail.template} → ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n[/email]`);
      }
      result = { provider: "console", status: "logged" };
    } else {
      const doFetch = deps.fetch ?? fetch;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await doFetch(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: env.EMAIL_FROM!.trim(),
            to: [mail.to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            ...(mail.replyTo || env.EMAIL_REPLY_TO?.trim() ? { reply_to: mail.replyTo || env.EMAIL_REPLY_TO!.trim() } : {}),
          }),
          signal: ctrl.signal,
        });
        const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
        result = res.ok
          ? { provider: "resend", status: "sent", ...(body?.id ? { providerId: body.id } : {}) }
          : { provider: "resend", status: "failed", error: `${res.status} ${body?.message ?? ""}`.trim().slice(0, 300) };
      } finally {
        clearTimeout(timer);
      }
      if (result.status === "failed") out.error(`[email] resend failed ${mail.template} → ${mail.to}: ${result.error}`);
    }
  } catch (e) {
    result = { provider: emailProviderConfigured(env) ? "resend" : "console", status: "failed", error: String(e).slice(0, 300) };
    out.error(`[email] send failed ${mail.template} → ${mail.to}:`, e);
  }
  try {
    await log({
      to: mail.to,
      template: mail.template,
      subject: mail.subject.slice(0, 300),
      lang: mail.lang ?? null,
      provider: result.provider,
      status: result.status,
      providerId: result.providerId ?? null,
      error: result.error ?? null,
      orderId: mail.orderId ?? null,
      shopCustomerId: mail.shopCustomerId ?? null,
    });
  } catch (e) {
    out.error("[email] log write failed:", e);
  }
  return result;
}
