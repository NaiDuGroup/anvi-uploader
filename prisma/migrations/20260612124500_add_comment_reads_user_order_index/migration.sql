CREATE INDEX IF NOT EXISTS "comment_reads_user_id_order_id_idx"
  ON "comment_reads" ("user_id", "order_id");
