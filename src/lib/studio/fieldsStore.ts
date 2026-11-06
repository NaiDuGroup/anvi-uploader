"use client";

import { studioId, type StudioImageSrc } from "./document";
import { getBlob, putBlob } from "./storage";
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

/** Learned from the last GET: false for a guest (no PUT, which would only answer 401). */
let signedIn: boolean | null = null;

async function putAccount(f: StudioFields): Promise<boolean> {
  if (signedIn === false) return false;
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

/** The logo's file is in this browser (IndexedDB); false when it cannot be read. */
async function hasLocalBlob(id: string): Promise<boolean> {
  try {
    return (await getBlob(id)) != null;
  } catch {
    return false;
  }
}

/**
 * The logo as this browser can draw it: its local copy when it is still here;
 * else the account's durable copy brought into this browser (signed in);
 * else no logo — the cards then show the monogram instead of an empty spot.
 */
export async function logoHere(logo: StudioImageSrc | null | undefined, opts: { account: boolean }): Promise<StudioImageSrc | null> {
  if (!logo) return null;
  if (logo.localId && (await hasLocalBlob(logo.localId))) return logo;
  if (opts.account && logo.key?.startsWith("shop-orders/")) {
    try {
      const r = await fetch(`${API}/logo`, { cache: "no-store" });
      if (r.ok) {
        const blob: Blob = await r.blob();
        const localId: string = studioId("img");
        await putBlob(localId, blob);
        return { ...logo, localId, mime: blob.type || logo.mime };
      }
    } catch {
      /* offline: no logo this visit */
    }
  }
  return null;
}

async function withLogoHere(fields: StudioFields, account: boolean): Promise<StudioFields> {
  if (!fields.logo) return fields;
  const logo: StudioImageSrc | null = await logoHere(fields.logo, { account });
  if (logo === fields.logo) return fields;
  const out: StudioFields = { ...fields, logo };
  writeLocal(out);
  return out;
}

/** The customer's fields and where they came from (a logo no longer in this browser is restored from the account or dropped). */
export async function loadStudioFields(): Promise<{ fields: StudioFields; source: StudioFieldsSource }> {
  const r = await loadStudioFieldsRaw();
  return { ...r, fields: await withLogoHere(r.fields, r.source === "account") };
}

async function loadStudioFieldsRaw(): Promise<{ fields: StudioFields; source: StudioFieldsSource }> {
  const local: StudioFields = readLocal();
  try {
    const r = await fetch(API, { cache: "no-store" });
    if (r.ok) {
      const d = (await r.json()) as { fields: unknown; signedIn?: boolean };
      signedIn = d.signedIn !== false;
      if (!signedIn) return { fields: local, source: "local" };
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

/** Autosave of «Datele mele» while typing: this browser only (the account is saved on request). */
export function saveStudioFieldsLocal(fields: StudioFields): void {
  writeLocal(fields);
}

/** Signed in per the last GET (null before it answered). */
export function studioFieldsSignedIn(): boolean | null {
  return signedIn;
}

/** Save everywhere it can go; resolves with where it was saved. */
export async function saveStudioFields(fields: StudioFields): Promise<StudioFieldsSource> {
  writeLocal(fields);
  return (await putAccount(fields)) ? "account" : "local";
}
