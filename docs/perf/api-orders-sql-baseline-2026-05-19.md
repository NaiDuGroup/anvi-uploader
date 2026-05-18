# `/api/orders` SQL baseline (2026-05-19)

## Production measurements

Measured against production with authenticated requests (`limit=15`):

- `x-orders-server-time-ms`: **1593ms – 4443ms**
- `TTFB`: **~1948ms – 4691ms**
- `TTFB` ~ `x-orders-server-time-ms` => primary bottleneck is server-side query/processing, not browser rendering.

With `includeWorkshop=false` and date filter:

- `x-orders-server-time-ms`: **1116ms – 1576ms**

This confirms the workshop payload contributes, but core list query remains heavy.

## Local EXPLAIN snapshot

Local DB has small dataset, so absolute times are tiny, but plans confirm shape:

- Main list query uses sort across filtered orders.
- Unread/comment helpers use `comments_order_id_created_at_idx`.
- Existing path previously used correlated `EXISTS` in `ORDER BY`, which scales poorly with data growth.

## Baseline conclusions

1. Production latency is dominated by backend query path in `fetchOrdersData`.
2. Correlated unread sort + combined count/page query shape is the main optimization target.
3. Client dedupe helps UX, but does not solve server bottleneck.

## Applied optimization direction (this iteration)

- Replaced `COUNT(*) OVER()` with a dedicated `COUNT(*)` query.
- Reworked page-id SQL to:
  - build `filtered_orders` first,
  - compute unread flags only inside that filtered set,
  - remove correlated `EXISTS` in `ORDER BY`.
- Added index for default list sort path:
  - `orders_deleted_at_is_prio_created_at_idx`.
