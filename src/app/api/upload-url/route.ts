import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getPresignedUploadUrl } from "@/lib/r2";
import { saveLocalFile } from "@/lib/local-storage";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

export async function PUT(request: NextRequest) {
  if (isLocalDev) {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "Missing key param" }, { status: 400 });
    }
    const buf = Buffer.from(await request.arrayBuffer());
    await saveLocalFile(key, buf);
    return new NextResponse(null, { status: 200 });
  }
  await request.arrayBuffer();
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { fileName, contentType } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    const key = `uploads/${Date.now()}-${nanoid(8)}-${fileName}`;

    if (isLocalDev) {
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.json({
        uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
        fileKey: key,
      });
    }

    const uploadUrl = await getPresignedUploadUrl(
      key,
      contentType || "application/octet-stream"
    );

    return NextResponse.json({ uploadUrl, fileKey: key });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
