"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, LogOut } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useCabinetSession } from "@/hooks/useCabinetSession";

/**
 * Drop-in pill for public landing pages (`/`, `/mug`, `/notebook`) that
 * surfaces the customer cabinet for *signed-in* visitors only. Anonymous
 * visitors see a separate {@link CabinetLoginCta} block at the bottom of the
 * page — keeping the header next to the language switcher uncluttered (per
 * dealer feedback: "не хочу портить верстку ставя кнопку войти возле выбора
 * языков"). Renders nothing while the session is loading.
 */
export default function CabinetHeaderBadge({
  className,
}: {
  className?: string;
}) {
  const { t } = useLanguageStore();
  const router = useRouter();
  const session = useCabinetSession();

  if (session.status === "loading") return null;
  if (session.status === "anonymous") return null;

  const u = session.session!;
  const displayName = u.displayName || u.name;

  const handleLogout = async () => {
    await fetch("/api/cabinet/auth/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <div
      className={
        "inline-flex min-w-0 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 " +
        (className ?? "")
      }
    >
      {/* Only the name shrinks/truncates; badge and action buttons keep their size. */}
      <span
        className="hidden min-w-0 max-w-[9rem] truncate sm:inline"
        title={displayName}
      >
        {displayName}
      </span>
      {u.isDealer ? (
        <span className="shrink-0 rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
          {t.cabinet.dealerBadge}
        </span>
      ) : null}
      <Link
        href="/cabinet/orders"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-emerald-900 hover:bg-emerald-100"
      >
        <ClipboardList className="h-3 w-3" />
        <span className="hidden sm:inline">{t.cabinet.navOrders}</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-emerald-900 hover:bg-emerald-100"
      >
        <LogOut className="h-3 w-3" />
        <span className="hidden sm:inline">{t.cabinet.logout}</span>
      </button>
    </div>
  );
}
