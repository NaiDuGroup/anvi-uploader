-- Fixed-window rate-limit counters for anonymous public endpoints
-- (/api/upload-url, POST /api/orders). See src/lib/rateLimit.ts.
CREATE TABLE "rate_limit_hits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_window_start_idx" ON "rate_limit_hits"("window_start");
