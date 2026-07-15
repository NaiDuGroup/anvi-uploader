-- CreateTable
CREATE TABLE "reconciliation_exclusions" (
    "id" TEXT NOT NULL,
    "idno" TEXT NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_exclusions_idno_key" ON "reconciliation_exclusions"("idno");
