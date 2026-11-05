"use client";

import { STUDIO_FIELDS_STORAGE_KEY, accountStudioFields, cleanFields, mergeStudioFields, parseStudioFields, type StudioFields } from "./smartFields";

/**
 * Where «Datele mele» live: in the customer account when signed in
 * (`/api/shop/account/studio-fields`), else in this browser (localStorage).
 * The browser copy is always kept too (it holds the local logo); the first
 * signed-in load of an empty account moves the guest's values into it.
 */

const API = "/api/shop/account/studio-fields";

export type StudioFieldsSource = "account" | "local";

function readLocal(): StudioFields {
  try {
    const raw: string | null = localStorage.getItem(STUDIO_FIELDS_STORAGE_KEY);
    return raw ? parseStudioFields(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeLocal(f: StudioFields): void {
  try {
    localStorage.setItem(STUDIO_FIELDS_STORAGE_KEY, JSON.stringify(cleanFields(f)));
  } catch {
    /* private mode / full: the fields stay in memory for this visit */
  }
}

async function putAccount(f: StudioFields): Promise<boolean> {
  try {
    const r = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: accountStudioFields(f) }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** The customer's fields and where they came from. */
export async function loadStudioFields(): Promise<{ fields: StudioFields; source: StudioFieldsSource }> {
  const local: StudioFields = readLocal();
  try {
    const r = await fetch(API, { cache: "no-store" });
    if (r.ok) {
      const d = (await r.json()) as { fields: unknown };
      if (d.fields == null) {
        // Signed in for the first time with values typed as a guest: move them into the account.
        if (Object.keys(local).length > 0) await putAccount(local);
        return { fields: local, source: "account" };
      }
      // Account values win; the local logo (not kept in the account) stays.
      const fields: StudioFields = mergeStudioFields(local, parseStudioFields(d.fields));
      return { fields, source: "account" };
    }
  } catch {
    /* offline: local copy */
  }
  return { fields: local, source: "local" };
}

/** Save everywhere it can go; resolves with where it was saved. */
export async function saveStudioFields(fields: StudioFields): Promise<StudioFieldsSource> {
  writeLocal(fields);
  return (await putAccount(fields)) ? "account" : "local";
}
