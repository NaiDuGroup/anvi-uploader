-- Item-level print methods: empty = the category's. Lets «Кружки» hold UV-only mugs.
ALTER TABLE "stock_items" ADD COLUMN "print_methods" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "stock_items" SET "print_methods" = ARRAY[]::TEXT[] WHERE "print_methods" IS NULL;
ALTER TABLE "stock_items" ALTER COLUMN "print_methods" SET NOT NULL;

-- Product categories for the Gor Factory / Stamina range (owner-approved 2026-10-28).
INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "print_methods", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'bottles',     'product', 'Sticle și termosuri', 'Бутылки',            'Bottles',      'pcs', ARRAY['uv']::TEXT[],  4,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'apparel',     'product', 'Îmbrăcăminte',        'Одежда',             'Apparel',      'pcs', ARRAY['dtf']::TEXT[], 6,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bags',        'product', 'Genți și trusouri',   'Сумки и косметички', 'Bags',         'pcs', ARRAY['dtf']::TEXT[], 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'plush_toys',  'product', 'Jucării de pluș',     'Мягкие игрушки',     'Plush toys',   'pcs', ARRAY['dtf']::TEXT[], 41, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'board_games', 'product', 'Jocuri de masă',      'Настольные игры',    'Board games',  'pcs', ARRAY['uv']::TEXT[],  42, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'christmas',   'product', 'Articole de Crăciun', 'Новогоднее',         'Christmas',    'pcs', ARRAY['uv']::TEXT[],  43, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'misc_goods',  'product', 'Diverse',             'Прочее',             'Other goods',  'pcs', ARRAY['uv']::TEXT[],  44, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
