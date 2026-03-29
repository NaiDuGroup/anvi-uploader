export async function generatePreview(file: File): Promise<string | undefined> {
  if (file.type.startsWith("image/")) {
    return URL.createObjectURL(file);
  }

  if (file.type === "application/pdf") {
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const buf = await file.arrayBuffer();
      const pdf = await getDocument({ data: buf }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
