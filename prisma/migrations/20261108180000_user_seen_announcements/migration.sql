-- «Что нового»: which announcements / contextual hints a staff user has already seen.
ALTER TABLE "users" ADD COLUMN "seen_announcements" TEXT[] DEFAULT ARRAY[]::TEXT[];
