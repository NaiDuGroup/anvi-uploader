"use client";

import { useEffect, useState } from "react";

export interface CabinetSession {
  id: string;
  name: string;
  displayName: string | null;
  isDealer: boolean;
  studioCustomer: {
    id: string;
    kind: string;
    phone: string | null;
    personName: string | null;
    companyName: string | null;
    email: string | null;
  } | null;
}

interface CabinetSessionState {
  status: "loading" | "anonymous" | "authenticated";
  session: CabinetSession | null;
}

/**
 * Lightweight client-side hook to read the current customer-portal session
 * from public pages (`/`, `/mug`, `/notebook`). Returns `anonymous` when no
 * cookie / not a customer — so the existing fast checkout flow continues to
 * work for visitors who never sign in.
 */
export function useCabinetSession(): CabinetSessionState {
  const [state, setState] = useState<CabinetSessionState>({
    status: "loading",
    session: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cabinet/me", { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setState({ status: "anonymous", session: null });
          return;
        }
        if (!res.ok) {
          setState({ status: "anonymous", session: null });
          return;
        }
        const data = (await res.json()) as CabinetSession;
        setState({ status: "authenticated", session: data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous", session: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
