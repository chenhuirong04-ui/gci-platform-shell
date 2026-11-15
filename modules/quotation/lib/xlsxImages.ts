/**
 * XLSX image extraction for Quotation Center Excel imports.
 *
 * Same contract as the former in-component helper:
 *   imgDataUrls     — WPS DISPIMG cell images: { "ID_xxx" → dataUrl }
 *   floatingBySheet — drawing images:          { sheetName → { 0-based row → dataUrl } }
 *
 * Tolerant of the OOXML variations real supplier files use (e.g. files written
 * by the .NET OpenXML SDK): relationship attributes in any order, absolute
 * ("/xl/…") or relative ("../…") targets, any namespace prefix, and both
 * twoCellAnchor and oneCellAnchor drawings.
 */
import JSZip from 'jszip';

export interface XlsxImages {
  imgDataUrls: Record<string, string>;
  floatingBySheet: Record<string, Record<number, string>>;
}

const decodeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Attributes of one XML start tag, keyed by their qualified name (e.g. "r:id"). */
export function parseAttributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

export interface Relationship { id: string; type: string; target: string; external: boolean }

/** All <Relationship> entries of a .rels part, attribute order independent. */
export function parseRelationships(xml: string): Relationship[] {
  const rels: Relationship[] = [];
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/g)) {
    const a = parseAttributes(m[0]);
    if (!a.Id || !a.Target) continue;
    rels.push({ id: a.Id, type: a.Type || '', target: a.Target, external: a.TargetMode === 'External' });
  }
  return rels;
}

/** Resolve a relationship target against the folder of its source part → zip path (no leading "/"). */
export function resolveZipTarget(sourcePart: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const parts = sourcePart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** .rels path for a part: xl/worksheets/sheet1.xml → xl/worksheets/_rels/sheet1.xml.rels */
export function relsPathFor(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

/** Sheets declared in workbook.xml: [{ name, rid }], attribute order and prefix independent. */
export function parseWorkbookSheets(xml: string): { name: string; rid: string }[] {
  const out: { name: string; rid: string }[] = [];
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?sheet\b[^>]*>/g)) {
    const a = parseAttributes(m[0]);
    const ridKey = Object.keys(a).find(k => /(^|:)id$/.test(k) && k !== 'sheetId');
    if (a.name && ridKey) out.push({ name: a.name, rid: a[ridKey] });
  }
  return out;
}

/** Picture anchors of a drawing part: [{ row (0-based from-row), embed rId }]. */
export function parseDrawingAnchors(xml: string): { row: number; embed: string }[] {
  const out: { row: number; embed: string }[] = [];
  for (const m of xml.matchAll(/<([\w.-]+:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/\1?\2>/g)) {
    const a = m[0];
    const row = a.match(/<(?:[\w.-]+:)?from>[\s\S]*?<(?:[\w.-]+:)?row>(\d+)<\/(?:[\w.-]+:)?row>/)?.[1];
    const embed = a.match(/\b(?:[\w.-]+:)?embed="([^"]+)"/)?.[1];
    if (row != null && embed) out.push({ row: parseInt(row, 10), embed });
  }
  return out;
}

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || 'png';
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
}

async function readDataUrl(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.files[path];
  if (!f) return null;
  return `data:${mimeFor(path)};base64,${await f.async('base64')}`;
}

export async function extractXlsxImages(arrayBuffer: ArrayBuffer | Uint8Array): Promise<XlsxImages> {
  const imgDataUrls: Record<string, string> = {};
  const floatingBySheet: Record<string, Record<number, string>> = {};
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // ── WPS DISPIMG cell images (xl/cellimages.xml) ──
    const cellPart = 'xl/cellimages.xml';
    const cellRels = zip.files[relsPathFor(cellPart)];
    const cellImg = zip.files[cellPart];
    if (cellRels && cellImg) {
      const ridToPath: Record<string, string> = {};
      for (const r of parseRelationships(await cellRels.async('text'))) {
        if (!r.external && !r.target.toLowerCase().includes('null')) ridToPath[r.id] = resolveZipTarget(cellPart, r.target);
      }
      const cellText = await cellImg.async('text');
      for (const m of cellText.matchAll(/name="(ID_[A-F0-9]+)"[\s\S]*?r:embed="([^"]+)"/gi)) {
        const path = ridToPath[m[2]];
        const url = path ? await readDataUrl(zip, path) : null;
        if (url) imgDataUrls[m[1]] = url;
      }
    }

    // ── Floating / anchored drawing images ──
    try {
      const wbPart = 'xl/workbook.xml';
      const wbXml = zip.files[wbPart] ? await zip.files[wbPart].async('text') : '';
      const wbRelsFile = zip.files[relsPathFor(wbPart)];
      const wbRels = wbRelsFile ? parseRelationships(await wbRelsFile.async('text')) : [];
      for (const { name: sheetName, rid } of parseWorkbookSheets(wbXml)) {
        const sheetRel = wbRels.find(r => r.id === rid);
        if (!sheetRel) continue;
        const sheetPart = resolveZipTarget(wbPart, sheetRel.target);
        const sheetRelsFile = zip.files[relsPathFor(sheetPart)];
        if (!sheetRelsFile) continue;
        const rowMap: Record<number, string> = {};
        const drawingRels = parseRelationships(await sheetRelsFile.async('text'))
          .filter(r => !r.external && /\/drawing$/.test(r.type));
        for (const dRel of drawingRels) {
          const drawingPart = resolveZipTarget(sheetPart, dRel.target);
          const drawingFile = zip.files[drawingPart];
          const drawingRelsFile = zip.files[relsPathFor(drawingPart)];
          if (!drawingFile || !drawingRelsFile) continue;
          const ridToMedia: Record<string, string> = {};
          for (const r of parseRelationships(await drawingRelsFile.async('text'))) {
            if (!r.external && !r.target.toLowerCase().includes('null')) ridToMedia[r.id] = resolveZipTarget(drawingPart, r.target);
          }
          for (const { row, embed } of parseDrawingAnchors(await drawingFile.async('text'))) {
            const path = ridToMedia[embed];
            const url = path ? await readDataUrl(zip, path) : null;
            if (url) rowMap[row] = url;
          }
        }
        if (Object.keys(rowMap).length > 0) floatingBySheet[sheetName] = rowMap;
      }
    } catch (fErr) {
      console.warn('[extractXlsxImages] Floating image extraction failed (non-fatal):', fErr);
    }
  } catch (imgErr) {
    console.warn('[extractXlsxImages] Image extraction failed (non-fatal):', imgErr);
  }
  return { imgDataUrls, floatingBySheet };
}

// ── Header helpers ───────────────────────────────────────────────────────────

const IMAGE_HEADER_WORDS = ['image', 'photo', 'picture', 'pic', 'img', '图片', '照片', '图'];

/** True for header cells that name an image column ("PRODUCT IMAGE", "Photo", "产品图片"). */
export function isImageHeader(header: string): boolean {
  const h = header.toLowerCase().trim();
  return h.length > 0 && IMAGE_HEADER_WORDS.some(w => (w.length <= 3 && /^[a-z]+$/.test(w)) ? new RegExp(`\\b${w}\\b`).test(h) : h.includes(w));
}
