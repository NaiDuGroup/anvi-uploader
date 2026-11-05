"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type TelegramStatus = { configured: boolean; hasToken: boolean; chatId: string | null; unpaidOrders: boolean };

/**
 * Settings «Уведомления»: whether the staff Telegram chat is configured
 * (env only, see docs/telegram-alerts.md) + «Отправить тест».
 */
export default function NotificationsSettingsSection() {
  const { t } = useLanguageStore();
  const c = t.corporate;
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/notify/telegram", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<TelegramStatus>) : null))
      .then((d) => {
        if (alive) setStatus(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notify/telegram", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      setResult(
        body?.status === "sent"
          ? { ok: true, text: c.telegramTestSent }
          : body?.status === "logged"
            ? { ok: true, text: c.telegramTestLogged }
            : { ok: false, text: c.telegramTestFailed },
      );
    } catch {
      setResult({ ok: false, text: c.telegramTestFailed });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.notifyTitle}</h2>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-gray-800">{c.telegramTitle}</b>
          {status ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                status.configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              {status.configured ? c.telegramOn : c.telegramOff}
            </span>
          ) : null}
        </div>
        {status ? (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-gray-600">
            {status.chatId ? (
              <li>
                {c.telegramChat}: <code>{status.chatId}</code>
              </li>
            ) : (
              <li>{c.telegramChatMissing}</li>
            )}
            {!status.hasToken ? <li>{c.telegramTokenMissing}</li> : null}
          </ul>
        ) : null}
        <div className="text-gray-600">
          {c.telegramEvents}
          <ul className="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5">
            <li>{c.telegramEventPaid}</li>
            <li>{c.telegramEventCorporate}</li>
            <li>{c.telegramEventUnpaid(status?.unpaidOrders ?? false)}</li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void sendTest()} disabled={sending}>
            <Send className="h-4 w-4" />
            {c.telegramSendTest}
          </Button>
          {result ? (
            <span role="status" className={result.ok ? "text-emerald-700" : "text-red-700"}>
              {result.text}
            </span>
          ) : null}
        </div>
        <p className="m-0 text-xs text-gray-400">{c.telegramDocsHint}</p>
      </div>
    </section>
  );
}
