"use client";

import { useSyncExternalStore } from "react";
import { CART_STORAGE_KEY, cartReducer, parseCart, serializeCart, type CartAction, type CartLine } from "./cart";

/**
 * Browser cart store: `localStorage` + in-memory snapshot shared by the
 * header badge, product pages and the cart. Other tabs stay in sync through
 * the `storage` event. The server snapshot is always empty.
 */

const EMPTY: CartLine[] = [];
let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    return parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

function snapshot(): CartLine[] {
  if (lines == null) lines = read();
  return lines;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY) {
      lines = read();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function dispatchCart(action: CartAction) {
  lines = cartReducer(snapshot(), action);
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(lines));
  } catch {
    // Private mode / full storage: the cart still works for this page view.
  }
  emit();
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** True after hydration (the cart is client-only; avoids an «empty cart» flash). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

const LAST_ORDER_KEY = "anvi_shop_last_order";

export function rememberLastOrder(token: string) {
  try {
    window.localStorage.setItem(LAST_ORDER_KEY, token);
  } catch {
    /* ignore */
  }
}

export function useLastOrderToken(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return window.localStorage.getItem(LAST_ORDER_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
