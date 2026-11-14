/**
 * Supplier Quote product-image persistence.
 *
 * Reuses the existing Supplier Library storage path end to end — no new
 * bucket, table, column or policy:
 *   upload  → uploadSupplierFile()  (/api/suppliers/upload-document, signed upload slot)
 *   restore → getSignedUrl()        (/api/suppliers/upload-document, action 'sign')
 *
 * The returned { b, p } reference is stored inside the owning
 * supplier_quote_items row (its existing `notes` GCI_V2 JSON), so each image
 * is tied to exactly that line-item id.
 */
import { uploadSupplierFile, getSignedUrl } from '../../suppliers/lib/documentsCloud';

export interface SupplierQuoteImageRef {
  b: string; // storage bucket
  p: string; // storage path
}

// Non-sensitive document type → existing bucket resolution (suppliers-public:
// private bucket, authenticated + module-scoped RLS, signed URLs only).
const IMAGE_DOCUMENT_TYPE = '产品图片';
const UNLINKED_SUPPLIER_FOLDER = 'unlinked-quotes';

function dataUrlToFile(dataUrl: string, baseName: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] || 'image/png';
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], `${baseName}.${ext}`, { type: mime });
}

export function isValidImageRef(ref: unknown): ref is SupplierQuoteImageRef {
  return !!ref && typeof (ref as any).b === 'string' && typeof (ref as any).p === 'string'
    && (ref as any).b.length > 0 && (ref as any).p.length > 0;
}

/** Upload one line-item image (data URL) and return its storage reference. */
export async function uploadSupplierQuoteImage(
  dataUrl: string,
  supplierId: string | undefined,
  quoteNo: string,
  rowIndex: number,
): Promise<SupplierQuoteImageRef> {
  const file = dataUrlToFile(dataUrl, `${quoteNo}-row${rowIndex + 1}`);
  const { bucket, path } = await uploadSupplierFile(
    supplierId || UNLINKED_SUPPLIER_FOLDER, file, IMAGE_DOCUMENT_TYPE,
  );
  return { b: bucket, p: path };
}

/** Re-load a stored image as a data URL (works for <img> and jsPDF addImage). */
export async function loadSupplierQuoteImage(ref: SupplierQuoteImageRef): Promise<string | null> {
  try {
    const url = await getSignedUrl(ref.b, ref.p, 600);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[supplierQuoteImages] restore failed', ref.p, e);
    return null;
  }
}

/** Run async jobs with a small concurrency cap (keeps the browser responsive). */
export async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
