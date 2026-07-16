import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * On Vercel each (cold) serverless instance opens its own connection(s) to the
 * database. When the connection string points at Neon's **pooled** endpoint
 * (`-pooler` / `*.neon.tech`), Prisma should be told it is talking to a
 * PgBouncer-style pooler (`pgbouncer=true`, which disables prepared statements
 * that the pooler's transaction mode cannot keep) and should cap each instance
 * to a single connection (`connection_limit=1`) to avoid connection churn /
 * exhaustion. We inject these params here instead of in the env var so the fix
 * ships with the code and does not require editing Vercel env. Local Postgres
 * (`localhost`) and any non-pooled host are left untouched.
 */
function buildRuntimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const isPooled =
    url.hostname.includes("-pooler") || url.hostname.endsWith(".neon.tech");
  if (!isPooled) return raw;
  if (!url.searchParams.has("pgbouncer")) {
    url.searchParams.set("pgbouncer", "true");
  }
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "1");
  }
  return url.toString();
}

/**
 * Options for `prisma.$transaction(cb, HEAVY_TX_OPTIONS)` on the order-create
 * and order-update paths.
 *
 * Defaults in Prisma 5 are `maxWait: 2_000ms`, `timeout: 5_000ms`. A
 * multi-line admin order (especially with large-format lines) runs ~25–30
 * sequential queries inside the txn (`orderLine.create` × N, LF roll stock
 * deduction, ink ledger, audit log, final `findUniqueOrThrow` with relations).
 * Combined with a cold Neon compute (auto-suspends after idle), the default
 * 5 s budget is easy to blow — the transaction is then aborted server-side
 * and the caller sees `Transaction API error: Transaction already closed`.
 *
 * Wider budget here is safe: it is an *upper bound*, not a delay. Transactions
 * still commit as soon as their callback resolves. The cost is only that a
 * genuinely stuck transaction holds row locks longer before being killed.
 */
export const HEAVY_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

/**
 * Increment when `schema.prisma` changes in a way that requires a **new**
 * `PrismaClient` instance (new/changed models, fields, or delegates). This
 * invalidates a cached global client after `git pull` without relying on
 * delegate `fields` metadata (Webpack can omit or distort `fields` and break
 * introspection-based freshness checks). **Also bump after new columns** on an
 * existing model (e.g. `LargeFormatMaterial.printableWidthMeters`): otherwise a
 * long-running dev server keeps an old client and Prisma throws
 * `Unknown argument '…'`.
 */
const PRISMA_CLIENT_EPOCH = 23;

const clientEpochByClient = new WeakMap<PrismaClient, number>();

function markClientEpoch(client: PrismaClient): void {
  clientEpochByClient.set(client, PRISMA_CLIENT_EPOCH);
}

function clientEpochMatches(client: PrismaClient): boolean {
  return clientEpochByClient.get(client) === PRISMA_CLIENT_EPOCH;
}

/**
 * After `prisma generate`, the old singleton on `globalThis` can still be the
 * previous PrismaClient shape (missing delegates), which causes
 * `undefined.findFirst` / `undefined.findMany`. Recreate when any expected delegate is missing.
 */
function studioCustomerReady(p: PrismaClient): boolean {
  const sc = (p as unknown as { studioCustomer?: { findFirst?: unknown } })
    .studioCustomer;
  return sc != null && typeof sc.findFirst === "function";
}

function mugProductReady(p: PrismaClient): boolean {
  const mp = (p as unknown as { mugProduct?: { findMany?: unknown } }).mugProduct;
  return mp != null && typeof mp.findMany === "function";
}

function mugStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { mugStockMovement?: { create?: unknown } })
    .mugStockMovement;
  return m != null && typeof m.create === "function";
}

function notebookProductReady(p: PrismaClient): boolean {
  const np = (p as unknown as { notebookProduct?: { findMany?: unknown } })
    .notebookProduct;
  return np != null && typeof np.findMany === "function";
}

function notebookStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { notebookStockMovement?: { create?: unknown } })
    .notebookStockMovement;
  return m != null && typeof m.create === "function";
}

function orderLineReady(p: PrismaClient): boolean {
  const ol = (p as unknown as { orderLine?: { create?: unknown } }).orderLine;
  return ol != null && typeof ol.create === "function";
}

function fileDelegateReady(p: PrismaClient): boolean {
  const f = (p as unknown as { file?: { create?: unknown } }).file;
  return f != null && typeof f.create === "function";
}

/**
 * `LargeFormatMaterial` + ink delegates: if missing from a cached `PrismaClient`,
 * stock/LF admin routes break (`undefined.create`). Included in {@link prismaAllDelegatesReady}.
 */
function largeFormatMaterialReady(p: PrismaClient): boolean {
  const lf = (p as unknown as { largeFormatMaterial?: { findMany?: unknown } })
    .largeFormatMaterial;
  return lf != null && typeof lf.findMany === "function";
}

function inkInventoryReady(p: PrismaClient): boolean {
  const i = (p as unknown as { inkInventory?: { findUnique?: unknown } })
    .inkInventory;
  return i != null && typeof i.findUnique === "function";
}

function inkStockReceiptReady(p: PrismaClient): boolean {
  const r = (p as unknown as { inkStockReceipt?: { create?: unknown } })
    .inkStockReceipt;
  return r != null && typeof r.create === "function";
}

function inkStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { inkStockMovement?: { create?: unknown } })
    .inkStockMovement;
  return m != null && typeof m.create === "function";
}

function lfRollStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { lfRollStockMovement?: { create?: unknown } })
    .lfRollStockMovement;
  return m != null && typeof m.create === "function";
}

function prismaSingletonReady(p: PrismaClient): boolean {
  return (
    studioCustomerReady(p) &&
    mugProductReady(p) &&
    mugStockMovementReady(p) &&
    notebookProductReady(p) &&
    notebookStockMovementReady(p) &&
    orderLineReady(p) &&
    fileDelegateReady(p)
  );
}

function prismaSingletonFailureLabels(p: PrismaClient): string[] {
  const out: string[] = [];
  if (!studioCustomerReady(p)) out.push("studioCustomer");
  if (!mugProductReady(p)) out.push("mugProduct");
  if (!mugStockMovementReady(p)) out.push("mugStockMovement");
  if (!notebookProductReady(p)) out.push("notebookProduct");
  if (!notebookStockMovementReady(p)) out.push("notebookStockMovement");
  if (!orderLineReady(p)) out.push("orderLine");
  if (!fileDelegateReady(p)) out.push("file");
  return out;
}

/** Full delegate set required by stock / large-format admin APIs (invalidates stale globals). */
function prismaAllDelegatesReady(p: PrismaClient): boolean {
  return (
    prismaSingletonReady(p) &&
    largeFormatMaterialReady(p) &&
    inkInventoryReady(p) &&
    inkStockReceiptReady(p) &&
    inkStockMovementReady(p) &&
    lfRollStockMovementReady(p)
  );
}

function prismaAllDelegatesFailureLabels(p: PrismaClient): string[] {
  return [
    ...prismaSingletonFailureLabels(p),
    ...(largeFormatMaterialReady(p) ? [] : ["largeFormatMaterial"]),
    ...(inkInventoryReady(p) ? [] : ["inkInventory"]),
    ...(inkStockReceiptReady(p) ? [] : ["inkStockReceipt"]),
    ...(inkStockMovementReady(p) ? [] : ["inkStockMovement"]),
    ...(lfRollStockMovementReady(p) ? [] : ["lfRollStockMovement"]),
  ];
}

/**
 * Reference to the last fully-validated client. Set after a successful slow-path
 * check; the Proxy fast-path uses identity comparison against
 * `globalForPrisma.prisma` to skip the 12 delegate readiness checks on every
 * property access. In production this means validation runs exactly once per
 * process; in dev, replacing `globalForPrisma.prisma` (after `prisma generate`
 * or a hot reload that recreates the singleton) breaks the identity match and
 * forces re-validation.
 */
let validatedClient: PrismaClient | null = null;

function resolvePrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (validatedClient !== null && existing === validatedClient) {
    return validatedClient;
  }
  if (existing && clientEpochMatches(existing) && prismaAllDelegatesReady(existing)) {
    validatedClient = existing;
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
  }
  const runtimeUrl = buildRuntimeDatabaseUrl();
  const fresh = runtimeUrl
    ? new PrismaClient({ datasources: { db: { url: runtimeUrl } } })
    : new PrismaClient();
  markClientEpoch(fresh);
  if (!prismaAllDelegatesReady(fresh)) {
    void fresh.$disconnect().catch(() => {});
    const missing = prismaAllDelegatesFailureLabels(fresh).join(", ");
    const msg =
      missing.length > 0
        ? `Prisma client is missing models or failed to load (@prisma/client): [${missing}]. Run \`npx prisma generate\` (or \`npm install\` — postinstall runs generate), then restart the dev server. If it persists, try \`rm -rf .next\` and \`npm run dev:clean\`.`
        : "Prisma client readiness check failed. Run `npx prisma generate`, then restart the dev server.";
    console.error(`[prisma] ${msg}`);
    throw new Error(msg);
  }
  globalForPrisma.prisma = fresh;
  validatedClient = fresh;
  return fresh;
}

/**
 * Proxy so every access runs `resolvePrismaClient()` — fixes stale global
 * singleton in dev without requiring a manual server restart after generate.
 * In prod the resolve is O(1) (single identity check) thanks to `validatedClient`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    void receiver;
    const p = resolvePrismaClient();
    const value = Reflect.get(p, prop, p);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(p);
    }
    return value;
  },
});
