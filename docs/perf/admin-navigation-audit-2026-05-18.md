# Admin navigation performance audit (2026-05-18)

## Goal

Investigate and optimize slower admin route transitions reported after recent commits.

## Suspected root causes

- Heavy `/api/orders` list payload included full comment bodies for every order row.
- Extra client refetch after hydration on `/admin/orders` when persisted filters are present.
- Polling ran every 10s even while tab is hidden.
- Protected admin layout performed independent server fetches sequentially.
- Query path for admin list lacked targeted indexes for the current filter/sort workload.

## Baseline (before changes)

Measured with authenticated `curl` against local server (`127.0.0.1:3000`):

- `/admin/orders` (warm runs 2-5): `0.093 - 0.099s`, TTFB `0.076 - 0.080s`
- `/api/orders?page=1&limit=25` (warm runs 2-5): `0.028 - 0.031s`, TTFB `0.029 - 0.031s`
- `/admin` (warm runs 2-3): `0.058 - 0.062s`
- `/admin/accounting` cold run: `5.324s`, warm runs: `0.063 - 0.092s`

## Implemented optimizations

1. **Slimmed list payload**
   - `src/lib/fetchOrders.ts`
   - Removed eager `comment.findMany(...)` for full list rows.
   - Kept only `commentCount` / `unreadCommentCount` aggregates in list API.
   - `comments` now defaults to empty array in list response; details are fetched on-demand by `CommentPanel`.

2. **Reduced duplicate fetches after hydration**
   - `src/stores/useOrdersStore.ts`
   - Added `lastFetchKey` + `lastFetchedAt` metadata.
   - `src/app/admin/_components/AdminPageClient.tsx`
   - Skip hydration-triggered refetch if same filter key was fetched recently.

3. **Conditional polling**
   - `src/app/admin/_components/AdminPageClient.tsx`
   - Polling now runs only on `/admin/orders` and pauses while the tab is hidden.
   - Refetch triggers on tab visibility restore.

4. **Lower protected layout latency**
   - `src/app/admin/(protected)/layout.tsx`
   - Parallelized `getSessionUser()` and `getOrCreateCompanyProfile()` via `Promise.all`.

5. **Index tuning for orders/comments workload**
   - `prisma/schema.prisma`
   - Added composite indexes for common `orders` filters and date sorting.
   - Added `comments(order_id, created_at desc)` index.
   - `prisma/migrations/20260518194000_optimize_order_list_indexes/migration.sql`

6. **Client bundle trimming step**
   - `src/app/admin/_components/AdminPageClient.tsx`
   - Replaced cross-route `NotebookPaperKindBadge` import with local lightweight badge.
   - Moved `DateRangeFilter` to dynamic import to reduce eager parse cost in initial chunk.

## Validation (after changes)

Measured with the same local authenticated `curl` scenario:

- `/admin/orders` (warm runs 2-5): `0.086 - 0.106s`, TTFB `0.060 - 0.068s`
- `/api/orders?page=1&limit=25` (warm runs 2-5): `0.027 - 0.034s`, TTFB `0.027 - 0.033s`
- `/admin` (warm runs 2-3): `0.082 - 0.083s`
- `/admin/accounting` cold run: `3.753s`, warm runs: `0.073 - 0.076s`

## Notes

- `/admin/orders` TTFB improved on warm runs; total transfer time is comparable.
- Local curl cannot fully represent client-side hydration improvements; browser profiling is still recommended.
- The biggest user-facing gains from this patch are expected from:
  - reduced duplicate refetches during navigation,
  - polling pause while hidden,
  - lighter list payload and DB indexes under larger datasets.
