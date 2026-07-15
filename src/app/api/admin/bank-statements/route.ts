import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { parseStatement, type StatementFormat } from "@/lib/bankStatement";
import { putObjectBuffer, isLocalObjectStorage } from "@/lib/r2";
import {
  BANK_STATEMENT_INCLUDE,
  toSerializableBankStatement,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

function requireStaff(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: studio admin only" },
      { status: 403 },
    );
  }
  return null;
}

/** Decodes an uploaded file as text, falling back to Windows-1252 if UTF-8
 * produced replacement characters (MAIB exports are ASCII/Latin). */
function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("\uFFFD")) {
    return buffer.toString("latin1");
  }
  return utf8;
}

export async function GET() {
  const user = await getSessionUser();
  const denied = requireStaff(user);
  if (denied) return denied;

  try {
    const statements = await prisma.bankStatement.findMany({
      include: BANK_STATEMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      statements: statements.map(toSerializableBankStatement),
    });
  } catch (error) {
    console.error("GET /api/admin/bank-statements:", error);
    return NextResponse.json(
      { error: "Failed to load statements" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const denied = requireStaff(user);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const format = (form.get("format")?.toString() || "maib_csv") as StatementFormat;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided (expected multipart field 'file')" },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const content = decodeText(buffer);

    const profile = await getOrCreateCompanyProfile();
    const parsed = parseStatement(format, content, {
      ourFiscalCode: profile.fiscalCode,
      ourIban: profile.iban,
    });

    // A line-1 warning means the header itself was not recognized: the file is
    // not a supported statement layout, so reject it. An empty-but-recognized
    // statement (e.g. a card export with no activity) is imported with 0 rows.
    const headerUnrecognized = parsed.warnings.some((w) => w.line === 1);
    if (parsed.transactions.length === 0 && headerUnrecognized) {
      return NextResponse.json(
        {
          error: "Unrecognized statement format",
          warnings: parsed.warnings,
        },
        { status: 422 },
      );
    }

    const statement = await prisma.bankStatement.create({
      data: {
        fileName: file.name || "statement.csv",
        format,
        accountIban: parsed.accountIban,
        openingBalance: parsed.openingBalance,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        currency: parsed.currency,
        status: "PARSED",
        rowCount: parsed.transactions.length,
        errorReport:
          parsed.warnings.length > 0
            ? (parsed.warnings as unknown as Prisma.InputJsonValue)
            : undefined,
        uploadedById: user!.id,
      },
    });

    const inserted = await prisma.bankTransaction.createMany({
      data: parsed.transactions.map((tx) => ({
        statementId: statement.id,
        bookingDate: tx.bookingDate,
        valueDate: tx.valueDate,
        direction: tx.direction,
        amount: tx.amount,
        currency: tx.currency,
        counterpartyName: tx.counterpartyName,
        counterpartyIdno: tx.counterpartyIdno,
        counterpartyIban: tx.counterpartyIban,
        purpose: tx.purpose,
        documentNumber: tx.documentNumber,
        bankRef: tx.bankRef,
        txTypeCode: tx.txTypeCode,
        dedupeKey: tx.dedupeKey,
      })),
      skipDuplicates: true,
    });

    // Best-effort raw-file archival (skipped on the mocked local storage).
    let storageKey: string | null = null;
    if (!isLocalObjectStorage()) {
      try {
        storageKey = `bank-statements/${statement.id}/${statement.fileName}`;
        await putObjectBuffer(storageKey, buffer, "text/csv");
      } catch (err) {
        console.error("Bank statement archival failed:", err);
        storageKey = null;
      }
    }
    if (storageKey) {
      await prisma.bankStatement.update({
        where: { id: statement.id },
        data: { storageKey },
      });
    }

    const withMeta = await prisma.bankStatement.findUniqueOrThrow({
      where: { id: statement.id },
      include: BANK_STATEMENT_INCLUDE,
    });

    return NextResponse.json(
      {
        statement: toSerializableBankStatement(withMeta),
        insertedCount: inserted.count,
        parsedCount: parsed.transactions.length,
        duplicateCount: parsed.transactions.length - inserted.count,
        warnings: parsed.warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/admin/bank-statements:", error);
    const message =
      error instanceof Error ? error.message : "Failed to import statement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
