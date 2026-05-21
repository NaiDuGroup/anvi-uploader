-- Add nullable `edited_at` column to comments. Populated by PATCH on
-- /api/orders/[id]/comments/[commentId] so the UI can show an
-- "(edited)" badge next to the message timestamp. Existing rows stay
-- NULL, which the UI interprets as "shown exactly as posted".
ALTER TABLE "comments" ADD COLUMN "edited_at" TIMESTAMP(3);
