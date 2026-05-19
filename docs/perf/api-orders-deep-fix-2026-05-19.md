# `/api/orders` deep optimisation pass (2026-05-19)

Iteration that targets the remaining 1.1–2.6 s server-time floor on `/api/orders`
described in [`api-orders-sql-baseline-2026-05-19.md`](./api-orders-sql-baseline-2026-05-19.md).

## What shipped

1. **Per-step `Server-Timing`** in `fetchOrdersData` — every block (`countAndListIds`,
   `ordersFindMany`, `commentCounts`, `unreadCounts`, `procurementToday`, `staffUsersMap`,
   `workshopSidebar`) writes its own `dur=` entry into the `Server-Timing` header
   (`/api/orders` route). This makes future regressions self-diagnostic.
2. **Single CTE for COUNT + page IDs.** `count` and `listIds` were two sequential
   round-trips against Neon despite using the same `filtered_orders` CTE. Merged
   into one `$queryRaw` (`countAndListIds`). Effect: −1 round-trip per request.
3. **In-process TTL cache for staff users.** `prisma.user.findMany` for
   `assignedTo` / `createdBy` / `sentToWorkshopBy` names sat AFTER the main
   `Promise.all` batch as a serialised round-trip. Replaced with
   `getStaffUsersMap()` (TTL 60 s, in `src/lib/staffUsersCache.ts`) so a warm
   Lambda issues zero round-trips for that lookup. Effect: −1 sequential
   round-trip on cache hit.
4. **Trimmed list payload.** `studioClient` include and `invoiceLineItems → invoice`
   include both removed from the listing `findMany`. Studio-client badge now
   keys off the existing `clientId` scalar; invoice badges load lazily via the
   new `GET /api/orders/invoice-info?ids=…` batch endpoint after the list is
   already on screen. Effect: smaller JSON payload + the listing `findMany` no
   longer joins two extra tables (`StudioCustomer`, `Invoice`).
5. **Workshop sidebar moved to its own endpoint.** New
   `GET /api/orders/workshop-sidebar` driven by `fetchWorkshopSidebarData`
   (`src/lib/fetchWorkshopSidebar.ts`). The admin page client polls it on a
   30 s cadence (vs. 10 s for the main list). The main `/api/orders` request
   now always passes `includeWorkshop=false`, so the CTE + extra `findMany`
   that previously powered the sidebar are no longer in the hot path.
   `/api/orders?includeWorkshop=true` keeps working unchanged for integration
   tests / SSR.
6. **`procurementTodayCount` cached** for 60 s per process via
   `getProcurementTodayCount` (`src/lib/procurementTodayCache.ts`). Removed
   from the main `Promise.all` batch on cache hit. Effect: zero round-trip
   for the procurement counter on the polling cadence.

## Outstanding environmental finding (action required outside this PR)

The biggest single lever I cannot pull from code is the Vercel↔Neon **region**
mismatch:

- **Neon project**: `ep-still-frost-agejduaz-pooler.c-2.eu-central-1.aws.neon.tech`
  → `eu-central-1` (Frankfurt). The pooler hostname is correct (`-pooler`),
  so PgBouncer is in use; this part is healthy.
- **Vercel deployment region**: not pinned in `vercel.json`, so the project
  uses Vercel's account default (`iad1`, US East / Washington for Hobby; could
  be `fra1` or `iad1` for Pro depending on the team default).

If Vercel is in `iad1` and Neon in `eu-central-1`, every DB round-trip costs
~100–150 ms of pure transatlantic RTT. After the fixes above the `/api/orders`
hot path still issues ≥3 sequential RTs (auth lookup, `countAndListIds`, batch),
so a region mismatch alone can pin the floor at 300–500 ms even with all SQL
optimisations in place.

### Recommended action

1. Open the Vercel dashboard → Project → Settings → Functions → "Function Region".
2. Confirm the region. If it is anything other than `fra1` (Frankfurt) or
   `cdg1` (Paris), change it to `fra1` to colocate with Neon. **Pro plan
   required** — Hobby tier is locked to a single account default and cannot
   be reassigned per project.
3. Once Pro is confirmed, add an explicit pin to `vercel.json` so future
   deployments cannot drift:

   ```json
   {
     "regions": ["fra1"],
     "crons": [
       { "path": "/api/cron/cleanup-trash", "schedule": "0 3 * * *" }
     ]
   }
   ```

4. Re-measure with `curl -w "%{time_starttransfer}"` and the new
   `Server-Timing` header — the per-step durations will tell us whether the
   remaining latency is truly the network hop or DB-side work.

I have intentionally NOT changed `vercel.json` in this PR because pinning a
region on a Hobby project would fail the deploy. Treat the change above as an
operator follow-up.

## How to read the new headers

Every successful `/api/orders` response now carries something like:

```
Server-Timing: fetchOrdersData;dur=812.0,ordersHandler;dur=820.4,
  countAndListIds;dur=160.1,ordersFindMany;dur=420.2,commentCounts;dur=85.4,
  unreadCounts;dur=110.6,procurementToday;dur=0.4,workshopSidebar;dur=0.0,
  batchTotal;dur=420.5,staffUsersMap;dur=0.6
X-Orders-Server-Time-Ms: 820.4
```

A few reading tips:

- `batchTotal` ≈ `max(ordersFindMany, commentCounts, unreadCounts, procurementToday, workshopSidebar)`
  — that's the wall-clock cost of the parallel batch.
- `procurementToday` and `staffUsersMap` should be ~0 ms on warm Lambdas
  (cache hit). If you ever see them spike, the process was cold or the TTL
  expired during this request.
- `workshopSidebar` is 0 when the client passes `includeWorkshop=false`
  (admin polling default after this PR).

Verify after each follow-up:

- Capture 5+ samples of the headers from prod.
- Sum check: `fetchOrdersData ≈ countAndListIds + batchTotal + staffUsersMap`
  (within ~10 ms drift). Big mismatches mean a new step appeared somewhere
  outside the instrumented blocks.
