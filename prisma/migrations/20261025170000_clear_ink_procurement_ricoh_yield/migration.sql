-- 1) Orders flagged «докупить чернила» by the old shared ink tank.
--    Ink no longer blocks orders (printer consumables may go negative), and these
--    orders were printed long ago, so the ink entries are dropped WITHOUT writing
--    anything off. Other procurement entries (paper, rolls, mugs…) are kept.

-- Single-entry meta that is only ink → clear the flag.
UPDATE "orders"
SET "procurement_meta" = NULL,
    "needs_procurement" = false
WHERE jsonb_typeof("procurement_meta") = 'object'
  AND "procurement_meta"->>'kind' = 'ink';

-- List meta: drop ink entries; clear the flag when nothing is left.
WITH cleaned AS (
  SELECT o."id",
         COALESCE(
           (SELECT jsonb_agg(e) FROM jsonb_array_elements(o."procurement_meta") e WHERE e->>'kind' IS DISTINCT FROM 'ink'),
           '[]'::jsonb
         ) AS meta
  FROM "orders" o
  WHERE jsonb_typeof(o."procurement_meta") = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(o."procurement_meta") e WHERE e->>'kind' = 'ink')
)
UPDATE "orders" o
SET "procurement_meta" = CASE WHEN jsonb_array_length(c.meta) = 0 THEN NULL ELSE c.meta END,
    "needs_procurement" = CASE WHEN jsonb_array_length(c.meta) = 0 THEN false ELSE o."needs_procurement" END
FROM cleaned c
WHERE o."id" = c."id";

-- 2) Ricoh C5200: approximate cartridge yields (A4 sheets at ~5% cover) so toner is
--    written off from now on. Only fills empty values; refine on the «Принтеры» page.
UPDATE "printer_slots" s
SET "sheets_per_unit" = CASE WHEN s."label" = 'Black' THEN 40000 ELSE 30000 END
FROM "printers" p
WHERE p."id" = s."printer_id"
  AND p."code" = 'ricoh'
  AND s."role" = 'toner'
  AND s."sheets_per_unit" IS NULL;
