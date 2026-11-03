-- Studio card (contacts, hours, public texts) for the cabinet and admin footers.
-- NULL / missing keys fall back to DEFAULT_STUDIO_INFO in src/lib/studioInfo,
-- so production shows the studio data right after this migration.
ALTER TABLE "company_profiles" ADD COLUMN "studio_info" JSONB;
