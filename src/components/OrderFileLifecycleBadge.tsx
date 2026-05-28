"use client";

import { useSyncExternalStore } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  computeLifecycleStatus,
  parseOrderFileExpiryAt,
} from "@/lib/orderFileLifecycle";

interface OrderFileLifecycleBadgeProps {
  /** R2 storage key (e.g. `uploads/1701234567890-abc-doc.pdf`) or an external URL. */
  fileUrl: string;
  /** Extra Tailwind classes appended to the default compact styling. */
  className?: string;
}

const TICK_INTERVAL_MS = 60 * 60 * 1000;

// Cached so that getClientNow returns a stable value between ticks.
// useSyncExternalStore requires getSnapshot to return the same reference
// until the store actually changes; calling Date.now() on every render
// would produce a new value each time and trigger an infinite loop.
let cachedNow: number = typeof window !== "undefined" ? Date.now() : 0;

function subscribeToHourlyTick(callback: () => void): () => void {
  const interval = setInterval(() => {
    cachedNow = Date.now();
    callback();
  }, TICK_INTERVAL_MS);
  return () => clearInterval(interval);
}

function getClientNow(): number {
  return cachedNow;
}

function getServerNow(): number | null {
  return null;
}

/**
 * Compact "X days left" badge for an order file.
 *
 * Renders nothing when the URL is not a managed `uploads/...` key
 * (external links, catalog photos, malformed input).
 *
 * Hydration-safe: `useSyncExternalStore` reads `null` on the server and a real
 * timestamp on the client, so server-rendered output never embeds wall-clock
 * time. Re-renders hourly to keep the day counter fresh on long-lived tabs.
 */
export function OrderFileLifecycleBadge({
  fileUrl,
  className,
}: OrderFileLifecycleBadgeProps) {
  const { t } = useLanguageStore();
  const expiry = parseOrderFileExpiryAt(fileUrl);
  const nowMs = useSyncExternalStore(
    subscribeToHourlyTick,
    getClientNow,
    getServerNow,
  );

  if (!expiry || nowMs == null) return null;

  const status = computeLifecycleStatus(expiry, new Date(nowMs));
  const label =
    status.kind === "expired"
      ? t.fileLifecycle.expired
      : status.kind === "expiresToday"
        ? t.fileLifecycle.expiresToday
        : t.fileLifecycle.daysLeft(status.days);

  const tone =
    status.kind === "expired" || status.kind === "expiresToday"
      ? "text-amber-600"
      : "text-gray-400";

  return (
    <span
      className={`text-[10px] leading-none ${tone}${className ? ` ${className}` : ""}`}
      title={expiry.toLocaleString()}
    >
      {label}
    </span>
  );
}
