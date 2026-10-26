-- Printer consumables: last purchase prices (VAT-inclusive, like `purchase_costs_include_vat`),
-- new items and the two printers at the pickup point, and supplier-line → stock mappings
-- so later e-Factura lines post after one manual confirmation. Stock stays 0 (inventory follows).
-- Source: purchase invoices 23.10.2025–24.10.2026, accounting/razbivka-faktur-chernovik.xlsx.
-- Data only; idempotent.

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'printer_misc', 'consumable', 'Alte consumabile imprimante', 'Прочие расходники принтеров', 'Other printer consumables', 'pcs', 160, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "printers" ("id", "code", "name", "technology", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'ricoh_point', 'Ricoh MP (точка выдачи)', 'toner_laser', 60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'epson_point', 'Epson (точка выдачи)',    'inkjet',      70, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  r RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_printer_id TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- printer code (NULL: no slot), slot label, role, category, sku, name ru, name ro, name en, share, sort
    (NULL::text, NULL::text, NULL::text, 'ink', 'INK-UV-PRIMER', 'Праймер UV', 'Primer UV', 'UV primer', NULL, 20),
    (NULL::text, NULL::text, NULL::text, 'dtf_film', 'UV-DTF-FILM-A', 'Плёнка UV DTF A (32 см)', 'Peliculă UV DTF A (32 cm)', 'UV DTF film A (32 cm)', NULL, 10),
    (NULL::text, NULL::text, NULL::text, 'dtf_film', 'UV-DTF-FILM-B', 'Плёнка UV DTF B (32 см)', 'Peliculă UV DTF B (32 cm)', 'UV DTF film B (32 cm)', NULL, 11),
    (NULL::text, NULL::text, NULL::text, 'sublimation_paper', 'SUBL-PAPER-A3', 'Сублимационная бумага A3', 'Hârtie de sublimare A3', 'Sublimation paper A3', NULL, 2),
    (NULL::text, NULL::text, NULL::text, 'printer_misc', 'RICOH-STAPLE-W', 'Скобы Ricoh тип W', 'Capse Ricoh tip W', 'Ricoh staples type W', NULL, 1),
    ('ricoh_point'::text, 'Cyan'::text, 'toner'::text, 'toner', 'TONER-RICOHPT-C', 'Тонер Ricoh MP (точка выдачи) Cyan', 'Toner Ricoh MP (punct de livrare) Cyan', 'Ricoh MP toner (pickup point) Cyan', NULL, 5),
    ('ricoh_point'::text, 'Magenta'::text, 'toner'::text, 'toner', 'TONER-RICOHPT-M', 'Тонер Ricoh MP (точка выдачи) Magenta', 'Toner Ricoh MP (punct de livrare) Magenta', 'Ricoh MP toner (pickup point) Magenta', NULL, 6),
    ('ricoh_point'::text, 'Yellow'::text, 'toner'::text, 'toner', 'TONER-RICOHPT-Y', 'Тонер Ricoh MP (точка выдачи) Yellow', 'Toner Ricoh MP (punct de livrare) Yellow', 'Ricoh MP toner (pickup point) Yellow', NULL, 7),
    ('ricoh_point'::text, 'Black'::text, 'toner'::text, 'toner', 'TONER-RICOHPT-K', 'Тонер Ricoh MP (точка выдачи) Black', 'Toner Ricoh MP (punct de livrare) Black', 'Ricoh MP toner (pickup point) Black', NULL, 8),
    ('epson_point'::text, 'Black'::text, 'ink'::text, 'ink', 'INK-EPSPT-K', 'Чернила Epson (точка выдачи) Black', 'Cerneală Epson (punct de livrare) Black', 'Epson ink (pickup point) Black', 0.2::numeric, 1),
    ('epson_point'::text, 'Cyan'::text, 'ink'::text, 'ink', 'INK-EPSPT-C', 'Чернила Epson (точка выдачи) Cyan', 'Cerneală Epson (punct de livrare) Cyan', 'Epson ink (pickup point) Cyan', 0.2::numeric, 2),
    ('epson_point'::text, 'Magenta'::text, 'ink'::text, 'ink', 'INK-EPSPT-M', 'Чернила Epson (точка выдачи) Magenta', 'Cerneală Epson (punct de livrare) Magenta', 'Epson ink (pickup point) Magenta', 0.2::numeric, 3),
    ('epson_point'::text, 'Yellow'::text, 'ink'::text, 'ink', 'INK-EPSPT-Y', 'Чернила Epson (точка выдачи) Yellow', 'Cerneală Epson (punct de livrare) Yellow', 'Epson ink (pickup point) Yellow', 0.2::numeric, 4),
    ('epson_point'::text, 'Light Cyan'::text, 'ink'::text, 'ink', 'INK-EPSPT-LC', 'Чернила Epson (точка выдачи) Light Cyan', 'Cerneală Epson (punct de livrare) Light Cyan', 'Epson ink (pickup point) Light Cyan', 0.1::numeric, 5),
    ('epson_point'::text, 'Light Magenta'::text, 'ink'::text, 'ink', 'INK-EPSPT-LM', 'Чернила Epson (точка выдачи) Light Magenta', 'Cerneală Epson (punct de livrare) Light Magenta', 'Epson ink (pickup point) Light Magenta', 0.1::numeric, 6)
  ) AS t(printer_code, label, role, category, sku, name_ru, name_ro, name_en, share, sort)
  LOOP
    SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = r.category;
    SELECT "id" INTO v_item_id FROM "stock_items" WHERE "sku" = r.sku;
    IF v_item_id IS NULL THEN
      v_item_id := gen_random_uuid()::text;
      INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "sort_order", "updated_at")
      VALUES (v_item_id, v_category_id, r.sku, r.name_ro, r.name_ru, r.name_en, r.sort, CURRENT_TIMESTAMP);
    END IF;
    SELECT "id" INTO v_variant_id FROM "stock_variants" WHERE "sku" = r.sku;
    IF v_variant_id IS NULL THEN
      v_variant_id := gen_random_uuid()::text;
      INSERT INTO "stock_variants" ("id", "item_id", "sku", "updated_at")
      VALUES (v_variant_id, v_item_id, r.sku, CURRENT_TIMESTAMP);
    END IF;
    IF r.printer_code IS NOT NULL THEN
      SELECT "id" INTO v_printer_id FROM "printers" WHERE "code" = r.printer_code;
      INSERT INTO "printer_slots" ("id", "printer_id", "label", "role", "variant_id", "share", "sort_order")
      VALUES (gen_random_uuid()::text, v_printer_id, r.label, r.role, v_variant_id, r.share, r.sort)
      ON CONFLICT ("printer_id", "label") DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Last purchase price per stock unit, VAT-inclusive (only where none is set yet).
UPDATE "stock_variants" v SET "purchase_cost" = p.cost, "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('DTF-FILM', 5.79::numeric),  -- 2026-08-21 PRINTERRA SHOP S.R.L.: Pelicula PET Premium Plus pentru DTF  (33cm*100m) 
  ('DTF-POWDER', 0.21::numeric),  -- 2026-09-09 PROMO STOCK S.R.L.: POW-WH Pudra-pulbere Adeziva, White 1kg
  ('INK-DTF-C', 0.49::numeric),  -- 2026-05-06 PROMO STOCK S.R.L.: dtf-inkkj-cy DTF Cerneala Cyan 1L
  ('INK-DTF-M', 0.63::numeric),  -- 2026-02-22 PROMO STOCK S.R.L.: dtf-inkkj-mg DTF Cerneala Magenta 1L
  ('INK-DTF-W', 0.46::numeric),  -- 2026-10-23 PROMO STOCK S.R.L.: dtf-inkkj-wh DTF Cerneala White 1L
  ('INK-EPSPT-K', 0.353::numeric),  -- 2026-04-18 S.C. "INPRINT-COM" S.R.L.: Cerneala Epson E0017-01LB/32159080
  ('INK-EPSPT-LC', 0.48::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Cerneala Epson E0017-100MLC/32159080
  ('INK-EPSPT-LM', 0.48::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Cerneala Epson E0017-100MLM/32159080
  ('INK-EPSPT-Y', 0.291::numeric),  -- 2025-12-09 PRINTERRA SHOP S.R.L.: Cerneala InkTec Epson 1000 ml Yellow E0017-01LY
  ('INK-SUBL-C', 1.2::numeric),  -- 2025-12-09 PRINTERRA SHOP S.R.L.: Cerneala InkTec Sublimation Epson 100 ml Cyan DTI0
  ('INK-SUBL-K', 1.45::numeric),  -- 2026-08-17 S.C. "INPRINT-COM" S.R.L.: 32159080 Cerneala DT101-100MB
  ('INK-SUBL-LC', 1.2::numeric),  -- 2025-12-09 PRINTERRA SHOP S.R.L.: Cerneala InkTec Sublimation Epson 100 ml Light Cya
  ('INK-SUBL-LM', 1.45::numeric),  -- 2026-07-27 PROMO STOCK S.R.L.: SB-INK-100-LM Cerneala SUBLINOVA INKTEC Light Mage
  ('INK-SUBL-M', 1.2::numeric),  -- 2025-12-09 PRINTERRA SHOP S.R.L.: Cerneala InkTec Sublimation Epson 100 ml Magenta D
  ('INK-SUBL-Y', 1.45::numeric),  -- 2026-07-27 PROMO STOCK S.R.L.: SB-INK-100-YW Cerneala SUBLINOVA INKTEC Yellow 100
  ('INK-UV-C', 1.63::numeric),  -- 2026-06-04 ADVERTISING TECHNOLOGY S.R.L.: Cerneala ultraviolet i1600
  ('INK-UV-K', 1.63::numeric),  -- 2026-06-04 ADVERTISING TECHNOLOGY S.R.L.: Cerneala ultraviolet i1600
  ('INK-UV-M', 1.63::numeric),  -- 2026-06-04 ADVERTISING TECHNOLOGY S.R.L.: Cerneala ultraviolet i1600
  ('INK-UV-PRIMER', 1.733::numeric),  -- 2026-04-29 ADVERTISING TECHNOLOGY S.R.L.: Grund pentru cerneala ultraviolet
  ('INK-UV-V', 1.82::numeric),  -- 2026-04-29 ADVERTISING TECHNOLOGY S.R.L.: Varnish ultraviolet i1600
  ('INK-UV-W', 1.63::numeric),  -- 2026-06-04 ADVERTISING TECHNOLOGY S.R.L.: Cerneala ultraviolet i1600
  ('INK-UV-Y', 1.63::numeric),  -- 2026-06-04 ADVERTISING TECHNOLOGY S.R.L.: Cerneala ultraviolet i1600
  ('RICOH-STAPLE-W', 1760.004::numeric),  -- 2026-02-24 X-SERVICE S.R.L.: STAPLE TYPE W RICOH
  ('SUBL-PAPER-A3', 1.7::numeric),  -- 2026-09-14 PROMO STOCK S.R.L.: SB-A3-GL100 Hirtie p-u Sublimare, A3-GL100, 100 fo
  ('SUBL-PAPER-A4', 0.8::numeric),  -- 2026-02-27 PROMO STOCK S.R.L.: SB-A4-GL100/Hirtie p-u Sublimare, A4-GL100, 100 fo
  ('SUBL-TAPE', 1.0909::numeric),  -- 2026-08-17 S.C. "INPRINT-COM" S.R.L.: Heat Resistant Tape,Width: 6mm*33m roll/39219090
  ('TONER-RICOH-C', 1839.996::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh PRO C5300 Cyan/84439990
  ('TONER-RICOH-K', 1839.996::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh PRO C5300 Black/84439990
  ('TONER-RICOH-M', 1839.996::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh PRO C5300 Magenta/84439990
  ('TONER-RICOH-Y', 1839.996::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh PRO C5300 Yellow/84439990
  ('TONER-RICOHPT-C', 708.0::numeric),  -- 2026-06-16 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Cy
  ('TONER-RICOHPT-K', 594.996::numeric),  -- 2026-06-16 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Bl
  ('TONER-RICOHPT-M', 708.0::numeric),  -- 2026-06-16 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Ma
  ('TONER-RICOHPT-Y', 843.0::numeric),  -- 2026-10-17 S.C. "INPRINT-COM" S.R.L.: Toner cart for Ricoh MP C4503/4504 Yellow CET/8443
  ('UV-DTF-FILM-A', 9.9::numeric),  -- 2026-03-30 S.C. "INPRINT-COM" S.R.L.: UV DTF Film (32cm*100m) A Side OtterPro/39206900
  ('UV-DTF-FILM-B', 9.9::numeric)   -- 2026-03-30 S.C. "INPRINT-COM" S.R.L.: UV DTF Film (32cm*100m) B Side OtterPro/39206900
) AS p(sku, cost)
WHERE v."sku" = p.sku AND v."purchase_cost" IS NULL;

-- Supplier line → stock variant rules, confirmed once: the next invoice line is posted by hand,
-- after that the sync posts it automatically (AUTO_POST_CONFIRMATIONS = 2).
INSERT INTO "supplier_item_mappings" ("id", "supplier_idno", "supplier_name", "normalized_name", "sample_name", "target_kind", "target_id", "units_per_invoice_unit", "confirmed_count", "last_unit_price_ex_vat", "last_seen_at", "updated_at")
SELECT gen_random_uuid()::text, m.idno, m.supplier, m.nn, m.sample, 'stock_variant', v."id", m.coef, 1, m.price, m.seen::timestamp, CURRENT_TIMESTAMP
FROM (VALUES
  ('1020600043024', 'PROMO STOCK S.R.L.', 'dtf-roll-300/dtf pelicula, 300mm*100m', 'DTF-Roll-300/DTF Pelicula, 300mm*100m', 'DTF-FILM', 100::numeric, 583.333::numeric, '2025-11-17'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'pelicula pet premium plus pentru dtf (33cm*100m) 75 microni', 'Pelicula PET Premium Plus pentru DTF  (33cm*100m) 75 microni', 'DTF-FILM', 100::numeric, 482.5::numeric, '2026-08-21'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'dtf-pudra-pulbere adeziva, alba 1kg', 'DTF-Pudra-pulbere Adeziva, Alba 1kg', 'DTF-POWDER', 1000::numeric, 187.5::numeric, '2025-11-17'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'pow-wh pudra-pulbere adeziva, alba 1kg', 'POW-WH Pudra-pulbere Adeziva, Alba 1kg', 'DTF-POWDER', 1000::numeric, 187.5::numeric, '2026-02-22'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'pow-wh pudra-pulbere adeziva, white 1kg', 'POW-WH Pudra-pulbere Adeziva, White 1kg', 'DTF-POWDER', 1000::numeric, 175.0::numeric, '2026-09-09'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'pudră/pulbere adezivă pentru dtf 1000 gr in bag white (tpu std 150) plotterfilms', 'Pudră/Pulbere adezivă pentru DTF 1000 gr in bag White (TPU STD 150) Plotterfilms', 'DTF-POWDER', 1000::numeric, 185.0::numeric, '2026-01-20'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'dtf-inkkj-cy dtf cerneala cyan 1l', 'dtf-inkkj-cy DTF Cerneala Cyan 1L', 'INK-DTF-C', 1000::numeric, 408.33::numeric, '2026-05-06'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'dtf-inkkj-mg dtf cerneala magenta 1l', 'dtf-inkkj-mg DTF Cerneala Magenta 1L', 'INK-DTF-M', 1000::numeric, 525.0::numeric, '2026-02-22'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'dtf-inkkj-wh dtf cerneala white 1l', 'dtf-inkkj-wh DTF Cerneala White 1L', 'INK-DTF-W', 1000::numeric, 383.34::numeric, '2026-10-23'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'cerneala epson e0017-01lb/32159080', 'Cerneala Epson E0017-01LB/32159080', 'INK-EPSPT-K', 1000::numeric, 294.17::numeric, '2026-04-18'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'cerneala epson e0017-100mlc/32159080', 'Cerneala Epson E0017-100MLC/32159080', 'INK-EPSPT-LC', 100::numeric, 40.0::numeric, '2026-10-17'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'cerneala epson e0017-100mlm/32159080', 'Cerneala Epson E0017-100MLM/32159080', 'INK-EPSPT-LM', 100::numeric, 40.0::numeric, '2026-10-17'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'cerneala inktec epson 1000 ml yellow e0017-01ly', 'Cerneala InkTec Epson 1000 ml Yellow E0017-01LY', 'INK-EPSPT-Y', 1000::numeric, 242.5::numeric, '2025-12-09'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'cerneala inktec sublimation epson 100 ml cyan dti02-100mc sublinova smart', 'Cerneala InkTec Sublimation Epson 100 ml Cyan DTI02-100MC Sublinova Smart', 'INK-SUBL-C', 100::numeric, 100.0::numeric, '2025-12-09'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', '32159080 cerneala dt101-100mb', '32159080 Cerneala DT101-100MB', 'INK-SUBL-K', 100::numeric, 120.83::numeric, '2026-08-17'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'cerneala inktec sublimation epson 100 ml light cyan dti05-100mlc sublinova smart', 'Cerneala InkTec Sublimation Epson 100 ml Light Cyan DTI05-100MLC Sublinova Smart', 'INK-SUBL-LC', 100::numeric, 100.0::numeric, '2025-12-09'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'sb-ink-100-lm cerneala sublinova inktec light magenta 100ml', 'SB-INK-100-LM Cerneala SUBLINOVA INKTEC Light Magenta 100ml', 'INK-SUBL-LM', 100::numeric, 120.83::numeric, '2026-07-27'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'cerneala inktec sublimation epson 100 ml magenta dti03-100mm sublinova smart', 'Cerneala InkTec Sublimation Epson 100 ml Magenta DTI03-100MM Sublinova Smart', 'INK-SUBL-M', 100::numeric, 100.0::numeric, '2025-12-09'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'sb-ink-100-yw cerneala sublinova inktec yellow 100ml', 'SB-INK-100-YW Cerneala SUBLINOVA INKTEC Yellow 100ml', 'INK-SUBL-Y', 100::numeric, 120.83::numeric, '2026-07-27'),
  ('1017600050170', 'ADVERTISING TECHNOLOGY S.R.L.', 'grund pentru cerneala ultraviolet', 'Grund pentru cerneala ultraviolet', 'INK-UV-PRIMER', 1000::numeric, 1444.17::numeric, '2026-04-29'),
  ('1017600050170', 'ADVERTISING TECHNOLOGY S.R.L.', 'varnish ultraviolet i1600', 'Varnish ultraviolet i1600', 'INK-UV-V', 1000::numeric, 1516.67::numeric, '2026-04-29'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'staple type w ricoh', 'STAPLE TYPE W RICOH', 'RICOH-STAPLE-W', 1::numeric, 1466.67::numeric, '2026-02-24'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'sb-a3-gl100 hirtie p-u sublimare, a3-gl100, 100 foi/pac', 'SB-A3-GL100 Hirtie p-u Sublimare, A3-GL100, 100 foi/pac', 'SUBL-PAPER-A3', 100::numeric, 141.67::numeric, '2026-09-14'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'sb-a3-gl100/hirtie p-u sublimare, a3-gl100, 100 foi/pac', 'SB-A3-GL100/Hirtie p-u Sublimare, A3-GL100, 100 foi/pac', 'SUBL-PAPER-A3', 100::numeric, 137.5::numeric, '2025-12-26'),
  ('1020600043024', 'PROMO STOCK S.R.L.', 'sb-a4-gl100/hirtie p-u sublimare, a4-gl100, 100 foi/pac', 'SB-A4-GL100/Hirtie p-u Sublimare, A4-GL100, 100 foi/pac', 'SUBL-PAPER-A4', 100::numeric, 66.67::numeric, '2026-02-27'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'heat resistant tape,width: 6mm*33m roll/39219090', 'Heat Resistant Tape,Width: 6mm*33m roll/39219090', 'SUBL-TAPE', 33::numeric, 30.0::numeric, '2026-08-17'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'pro print cartridge cyan c5200', 'Pro print cartridge Cyan  C5200', 'TONER-RICOH-C', 1::numeric, 2186.25::numeric, '2026-02-24'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'pro print cartridge cyan c5300s/c5310s', 'Pro print cartridge Cyan  C5300s/C5310s', 'TONER-RICOH-C', 1::numeric, 2139.07::numeric, '2025-11-21'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh pro c5300 cyan/84439990', 'Toner cart for Ricoh PRO C5300 Cyan/84439990', 'TONER-RICOH-C', 1::numeric, 1533.33::numeric, '2026-10-17'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'pro print cartridge black c5200', 'Pro print cartridge Black  C5200', 'TONER-RICOH-K', 1::numeric, 2186.25::numeric, '2026-02-24'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh pro c5300 black/84439990', 'Toner cart for Ricoh PRO C5300 Black/84439990', 'TONER-RICOH-K', 1::numeric, 1533.33::numeric, '2026-10-17'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'pro print cartridge magenta c5200', 'Pro print cartridge Magenta  C5200', 'TONER-RICOH-M', 1::numeric, 2186.25::numeric, '2026-02-24'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh pro c5300 magenta/84439990', 'Toner cart for Ricoh PRO C5300 Magenta/84439990', 'TONER-RICOH-M', 1::numeric, 1533.33::numeric, '2026-10-17'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'pro print cartridge yellow c5200', 'Pro print cartridge Yellow  C5200', 'TONER-RICOH-Y', 1::numeric, 2186.25::numeric, '2026-02-24'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh pro c5300 yellow/84439990', 'Toner cart for Ricoh PRO C5300 Yellow/84439990', 'TONER-RICOH-Y', 1::numeric, 1533.33::numeric, '2026-10-17'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c3003/3004/4504/imc3000 cyan cet/84439990', 'Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Cyan CET/84439990', 'TONER-RICOHPT-C', 1::numeric, 590.0::numeric, '2026-06-16'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c4503/4504 cyan cet/84439990', 'Toner cart for Ricoh MP C4503/4504 Cyan CET/84439990', 'TONER-RICOHPT-C', 1::numeric, 673.33::numeric, '2026-05-16'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3003/c3004/c3503/c3504 cyan 18k integral', 'Toner cartridge Ricoh Aficio MP C3003/C3004/C3503/C3504 Cyan 18K Integral', 'TONER-RICOHPT-C', 1::numeric, 529.17::numeric, '2026-02-21'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3500/c4500 cyan 17k integral', 'Toner cartridge Ricoh Aficio MP C3500/C4500 Cyan 17k Integral', 'TONER-RICOHPT-C', 1::numeric, 542.71::numeric, '2026-03-03'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'toner f. ricoh mp c4503.5503.6003.4504.5504.6004 cyan', 'Toner f. Ricoh MP C4503.5503.6003.4504.5504.6004 cyan', 'TONER-RICOHPT-C', 1::numeric, 666.67::numeric, '2025-12-29'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c3003/3004/4504/imc3000 black cet/84439990', 'Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Black CET/84439990', 'TONER-RICOHPT-K', 1::numeric, 495.83::numeric, '2026-06-16'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c4503/4504 black cet/84439990', 'Toner cart for Ricoh MP C4503/4504 Black CET/84439990', 'TONER-RICOHPT-K', 1::numeric, 566.67::numeric, '2026-05-16'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3500/c4500 black 23k integral', 'Toner cartridge Ricoh Aficio MP C3500/C4500 Black 23k Integral', 'TONER-RICOHPT-K', 1::numeric, 537.5::numeric, '2026-03-03'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'toner f. ricoh mp c4503.5503.6003.4504.5504.6004 black', 'Toner f. Ricoh MP C4503.5503.6003.4504.5504.6004 black', 'TONER-RICOHPT-K', 1::numeric, 666.67::numeric, '2025-12-29'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c3003/3004/4504/imc3000 magenta cet/84439990', 'Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Magenta CET/84439990', 'TONER-RICOHPT-M', 1::numeric, 590.0::numeric, '2026-06-16'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c4503/4504 magenta cet/84439990', 'Toner cart for Ricoh MP C4503/4504 Magenta CET/84439990', 'TONER-RICOHPT-M', 1::numeric, 673.335::numeric, '2026-03-30'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3003/c3004/c3503/c3504 magenta 18k integral', 'Toner cartridge Ricoh Aficio MP C3003/C3004/C3503/C3504 Magenta 18K Integral', 'TONER-RICOHPT-M', 1::numeric, 529.17::numeric, '2026-01-20'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3500/c4500 magenta 17k integral', 'Toner cartridge Ricoh Aficio MP C3500/C4500 Magenta 17k Integral', 'TONER-RICOHPT-M', 1::numeric, 542.71::numeric, '2026-03-03'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'toner f. ricoh mp c4503.5503.6003.4504.5504.6004 magenta', 'Toner f. Ricoh MP C4503.5503.6003.4504.5504.6004 magenta', 'TONER-RICOHPT-M', 1::numeric, 666.67::numeric, '2025-12-29'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c3003/3004/4504/imc3000 yellow cet/84439990', 'Toner cart for Ricoh MP C3003/3004/4504/IMC3000 Yellow CET/84439990', 'TONER-RICOHPT-Y', 1::numeric, 590.0::numeric, '2026-09-19'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'toner cart for ricoh mp c4503/4504 yellow cet/84439990', 'Toner cart for Ricoh MP C4503/4504 Yellow CET/84439990', 'TONER-RICOHPT-Y', 1::numeric, 702.5::numeric, '2026-10-17'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c2800/c3300/c3001/c3501 yellow 15k integral', 'Toner cartridge Ricoh Aficio MP C2800/C3300/C3001/C3501 Yellow 15K Integral', 'TONER-RICOHPT-Y', 1::numeric, 609.17::numeric, '2025-12-09'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3003/c3004/c3503/c3504 yellow 18k integral', 'Toner cartridge Ricoh Aficio MP C3003/C3004/C3503/C3504 Yellow 18K Integral', 'TONER-RICOHPT-Y', 1::numeric, 529.17::numeric, '2026-03-30'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'toner cartridge ricoh aficio mp c3500/c4500 yellow 17k integral', 'Toner cartridge Ricoh Aficio MP C3500/C4500 Yellow 17k Integral', 'TONER-RICOHPT-Y', 1::numeric, 542.71::numeric, '2026-03-03'),
  ('1014600029652', 'X-SERVICE S.R.L.', 'toner f. ricoh mp c4503.5503.6003.4504.5504.6004 yellow', 'Toner f. Ricoh MP C4503.5503.6003.4504.5504.6004 yellow', 'TONER-RICOHPT-Y', 1::numeric, 666.67::numeric, '2025-12-29'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'uv dtf film (32cm*100m) a side otterpro/39206900', 'UV DTF Film (32cm*100m) A Side OtterPro/39206900', 'UV-DTF-FILM-A', 100::numeric, 825.0::numeric, '2026-03-30'),
  ('1010600012034', 'PRINTERRA SHOP S.R.L.', 'pelicula uv dtf b rolă albă 31см (310 mm) pentru imprimare cu jet de cerneală de tip uv 100 de metri', 'Pelicula UV DTF "B" rolă albă 31см (310 mm) pentru imprimare cu jet de cerneală de tip UV 100 de metri', 'UV-DTF-FILM-B', 100::numeric, 412.5::numeric, '2026-03-02'),
  ('1004600016671', 'S.C. "INPRINT-COM" S.R.L.', 'uv dtf film (32cm*100m) b side otterpro/39206900', 'UV DTF Film (32cm*100m) B Side OtterPro/39206900', 'UV-DTF-FILM-B', 100::numeric, 825.0::numeric, '2026-03-30')
) AS m(idno, supplier, nn, sample, sku, coef, price, seen)
JOIN "stock_variants" v ON v."sku" = m.sku
ON CONFLICT ("supplier_idno", "normalized_name") DO NOTHING;
