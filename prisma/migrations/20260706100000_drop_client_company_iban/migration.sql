-- Client IBAN is no longer collected or shown anywhere (invoices do not need
-- the payer's IBAN). Drop the column from clients.
ALTER TABLE "clients" DROP COLUMN IF EXISTS "company_iban";
