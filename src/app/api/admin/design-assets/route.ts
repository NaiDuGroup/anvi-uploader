import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { readObjectBytes, writeObjectBytes } from "@/lib/design/objectStore";

const ASSET_PREFIX = "catalog/design-assets/";
const THUMB_MAX_PX = 400;

const createBody = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  /** Key returned by `/api/upload-url` with scope `designAsset`. */
  fileKey: z
    .string()
    .min(1)
    .refine((k) => k.startsWith(ASSET_PREFIX), {
      message: `fileKey must start with ${ASSET_PREFIX}`,
    }),
});

export type AdminDesignAssetJson = {
  id: string;
  name: string;
  category: string | null;
  tags: string[];
  fileKey: string;
  thumbKey: string | null;
  widthPx: number;
  heightPx: number;
  createdAt: string;
};

function toJson(row: {
  id: string;
  name: string;
  category: string | null;
  tags: string[];
  fileKey: string;
  thumbKey: string | null;
  widthPx: number;
  heightPx: number;
  createdAt: Date;
}): AdminDesignAssetJson {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags,
    fileKey: row.fileKey,
    thumbKey: row.thumbKey,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";

    const rows = await prisma.designAsset.findMany({
      where: {
        deletedAt: null,
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { tags: { has: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const categories = await prisma.designAsset.findMany({
      where: { deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    return NextResponse.json({
      items: rows.map(toJson),
      categories: categories
        .map((c) => c.category)
        .filter((c): c is string => !!c),
    });
  } catch (e) {
    console.error("GET /api/admin/design-assets:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createBody.parse(await request.json());

    const original = await readObjectBytes(body.fileKey, "catalog");
    if (!original) {
      return NextResponse.json({ error: "file_not_found" }, { status: 400 });
    }

    // Probe dimensions and build a small webp preview for the library grid.
    const image = sharp(original);
    const meta = await image.metadata();
    const widthPx = meta.width ?? 0;
    const heightPx = meta.height ?? 0;
    if (widthPx <= 0 || heightPx <= 0) {
      return NextResponse.json({ error: "not_an_image" }, { status: 400 });
    }

    let thumbKey: string | null = null;
    try {
      const thumb = await image
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      thumbKey = `${ASSET_PREFIX}thumbs/${Date.now()}-thumb.webp`;
      await writeObjectBytes(thumbKey, thumb, "image/webp", "catalog");
    } catch (thumbError) {
      // A missing thumbnail only degrades the grid — keep the asset usable.
      console.error("design-asset thumbnail generation failed:", thumbError);
      thumbKey = null;
    }

    const created = await prisma.designAsset.create({
      data: {
        name: body.name.trim(),
        category: body.category?.trim() || null,
        tags: (body.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        fileKey: body.fileKey,
        thumbKey,
        widthPx,
        heightPx,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ item: toJson(created) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/design-assets:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
