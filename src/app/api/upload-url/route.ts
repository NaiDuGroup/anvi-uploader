import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getPresignedUploadUrl } from "@/lib/r2";

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
