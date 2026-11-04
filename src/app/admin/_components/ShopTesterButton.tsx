"use client";

import { Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * «Открыть витрину (тест)»: asks for a signed 10-minute tester link and opens
 * it in a new tab; anvi.md then keeps a 7-day tester pass (test payment).
 */
export function ShopTesterButton() {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    // Open the tab inside the click so popup blockers allow it, then point it at the link.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shop-tester-link", { method: "POST", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !body?.url) {
        tab?.close();
        toast.error(
          body?.error === "tester_not_configured"
            ? "Не задан секрет SHOP_TESTER_SECRET / CRON_SECRET"
            : "Не удалось получить ссылку тестировщика",
        );
        return;
      }
      if (tab) tab.location.href = body.url;
      else window.location.href = body.url;
    } catch {
      tab?.close();
      toast.error("Не удалось получить ссылку тестировщика");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void open()}
      disabled={busy}
      className="hidden sm:inline-flex"
      title="Витрина anvi.md с тестовой оплатой (пропуск на 7 дней)"
    >
      <Store className="h-4 w-4" />
      Открыть витрину (тест)
    </Button>
  );
}
