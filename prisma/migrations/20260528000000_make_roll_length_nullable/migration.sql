-- Make roll_length_m nullable (field removed from UI and API; kept for historical rows)
ALTER TABLE "large_format_materials" ALTER COLUMN "roll_length_m" DROP NOT NULL;
