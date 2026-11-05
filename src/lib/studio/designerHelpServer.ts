import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { keepUpload, uploadedFileProblem } from "@/lib/corporate/requests";
import type { CorporateStoredFile } from "@/lib/corporate/requestRules";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import {
  designRequestToCorporate,
  isDesignRequestSpam,
  parseDesignRequest,
  parseDesignerPrice,
  type DesignRequestErrors,
} from "./designerHelp";

/**
 * «Помощь дизайнера» server side: the price setting (admin Settings → studio
 * card, `studioInfo.designerHelpPriceLei`) and storing a request as a
 * `corporate_requests` row (same staff list, files copied like the corporate form).
 */

/** The «from X lei» price, null when not set (or the profile can't be read). Never throws. */
export async function getDesignerHelpPrice(): Promise<number | null> {
  try {
    const p = await prisma.companyProfile.findFirst({ select: { studioInfo: true } });
    return parseDesignerPrice(resolveStudioInfo(p?.studioInfo).designerHelpPriceLei);
  } catch (e) {
    console.error("[designer-help] price read failed:", e);
    return null;
  }
}

export type DesignSubmitResult =
  | { kind: "created"; id: string; number: number }
  | { kind: "spam" }
  | { kind: "invalid"; errors: DesignRequestErrors };

export async function submitDesignRequest(
  raw: unknown,
  ctx: { ip?: string | null; userAgent?: string | null; now?: Date },
): Promise<DesignSubmitResult> {
  if (isDesignRequestSpam(raw)) return { kind: "spam" };
  const parsed = parseDesignRequest(raw);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const d = parsed.data;
  const now = ctx.now ?? new Date();

  for (const f of d.files) {
    const bad = await uploadedFileProblem(f.fileKey, f.fileName);
    if (bad) return { kind: "invalid", errors: { files: bad } };
  }
  const files: CorporateStoredFile[] = [];
  for (const f of d.files) {
    try {
      const key = await keepUpload(f.fileKey);
      if (key) files.push({ key, name: f.fileName, size: f.sizeBytes ?? null });
    } catch (e) {
      console.error("[designer-help] file copy failed:", e);
    }
  }

  const row = await prisma.corporateRequest.create({
    data: {
      ...designRequestToCorporate(d, now),
      files: files as unknown as Prisma.InputJsonValue,
      consentAt: now,
      ip: ctx.ip?.slice(0, 64) ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true, number: true },
  });
  return { kind: "created", id: row.id, number: row.number };
}
