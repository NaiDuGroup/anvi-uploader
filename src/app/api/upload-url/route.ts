import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { fileName } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    const mockUploadUrl = `/api/mock-upload?file=${encodeURIComponent(fileName)}`;

    return NextResponse.json({
      uploadUrl: mockUploadUrl,
      fileUrl: `https://storage.example.com/uploads/${Date.now()}-${fileName}`,
    });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
