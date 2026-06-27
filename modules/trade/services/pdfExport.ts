// services/pdfExport.ts
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Export a DOM element to PDF (visual 1:1 with UI) using canvas snapshot.
 * - element: HTMLElement to capture
 * - filename: output filename (e.g., "PI_XXX.pdf")
 * - options: optional tuning
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  options?: {
    /**
     * Increase for sharper PDF (2 is a good balance; 3 for very sharp but heavier)
     */
    scale?: number;
    /**
     * PDF page format: "a4" or custom
     */
    format?: "a4";
    /**
     * Orientation: "p" portrait, "l" landscape
     */
    orientation?: "p" | "l";
    /**
     * Add extra margin in mm (default 0)
     */
    marginMm?: number;
    /**
     * Use white background even if transparent
     */
    background?: string;
  }
) {
  const scale = options?.scale ?? 2;
  const orientation = options?.orientation ?? "p";
  const format = options?.format ?? "a4";
  const marginMm = options?.marginMm ?? 0;
  const background = options?.background ?? "#ffffff";

  // Ensure fonts/images are ready
  await waitForFonts();
  await waitForImages(element);

  // Snapshot DOM
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: background,
    logging: false,
    // Important: keep same on-screen look
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.clientHeight,
  });

  const imgData = canvas.toDataURL("image/png", 1.0);

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format,
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const usableWidth = pageWidth - marginMm * 2;
  const usableHeight = pageHeight - marginMm * 2;

  // Convert canvas px -> mm using ratio
  const imgWidthMm = usableWidth;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  // If one page fits
  if (imgHeightMm <= usableHeight) {
    pdf.addImage(imgData, "PNG", marginMm, marginMm, imgWidthMm, imgHeightMm, undefined, "FAST");
    pdf.save(filename);
    return;
  }

  // Multi-page slicing (vertical)
  // We slice the big canvas into page-sized chunks to keep clarity.
  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) throw new Error("Canvas context not available");

  // Calculate slice height in px for one PDF page
  const sliceHeightPx = Math.floor((canvas.width * usableHeight) / usableWidth);

  pageCanvas.width = canvas.width;
  pageCanvas.height = sliceHeightPx;

  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    // Clear
    pageCtx.fillStyle = background;
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    // Draw slice
    pageCtx.drawImage(
      canvas,
      0,
      renderedHeight,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx
    );

    const sliceData = pageCanvas.toDataURL("image/png", 1.0);

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(sliceData, "PNG", marginMm, marginMm, imgWidthMm, usableHeight, undefined, "FAST");

    renderedHeight += sliceHeightPx;
    pageIndex += 1;
  }

  pdf.save(filename);
}

async function waitForFonts() {
  // @ts-ignore
  if (document.fonts && document.fonts.ready) {
    // @ts-ignore
    await document.fonts.ready;
  }
}

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return;

  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}
