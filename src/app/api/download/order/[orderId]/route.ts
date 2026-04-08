import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";
import archiver from "archiver";
import { PassThrough } from "stream";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { files: true },
  });

  if (!order || order.files.length === 0) {
    return NextResponse.json({ error: "Order not found or has no files" }, { status: 404 });
  }

  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(passthrough);

  const usedNames = new Map<string, number>();

  for (const file of order.files) {
    let name = file.fileName;
    const count = usedNames.get(name) ?? 0;
    if (count > 0) {
      const dot = name.lastIndexOf(".");
      name = dot > 0
        ? `${name.slice(0, dot)}_${count}${name.slice(dot)}`
        : `${name}_${count}`;
    }
    usedNames.set(file.fileName, count + 1);

    if (isLocalDev) {
      const localData = await readLocalFile(file.fileUrl);
      if (localData) {
        archive.append(localData, { name });
      } else {
        archive.append(Buffer.from(`[local-dev placeholder] ${file.fileName}\n`), { name });
      }
      continue;
    }

    try {
      const downloadUrl = await getPresignedDownloadUrl(file.fileUrl);
      const r2Response = await fetch(downloadUrl);
      if (!r2Response.ok || !r2Response.body) continue;

      const arrayBuffer = await r2Response.arrayBuffer();
      archive.append(Buffer.from(arrayBuffer), { name });
    } catch (err) {
      console.error(`Failed to add file ${file.fileName} to ZIP:`, err);
    }
  }

  archive.finalize();

  const readableStream = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  const orderNum = String(order.orderNumber).padStart(4, "0");

  return new NextResponse(readableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="order_${orderNum}.zip"`,
    },
  });
}
