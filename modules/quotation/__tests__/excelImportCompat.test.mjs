// Quotation Center — Excel import compatibility (image column header, rels attribute order,
// absolute drawing targets, oneCellAnchor) + backward compatibility with the classic layout.
// Run from the repo root:  node --test modules/quotation/__tests__/excelImportCompat.test.mjs
// Optional real-file regression (not committed — public repo):
//   DAISY_TREE_XLSX="C:/path/GCI_Daisy_Tree_Quotation_CORRECTED_30percent_ONLY.xlsx" node --test ...
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const JSZip = require('jszip');
const XLSX = require('xlsx');
const DAISY = process.env.DAISY_TREE_XLSX || path.join(os.homedir(), 'Downloads', 'GCI_Daisy_Tree_Quotation_CORRECTED_30percent_ONLY.xlsx');

let lib;
before(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-xlsx-')), 'xlsxImages.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/quotation/lib/xlsxImages.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  lib = await import(pathToFileURL(out).href);
});

// Tiny distinct PNG-ish payloads (content only needs to round-trip byte-exact).
const img = (i) => Buffer.from(`fake-png-${i}`);
const b64 = (i) => `data:image/png;base64,${img(i).toString('base64')}`;
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const T = (t) => `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${t}`;

/** OpenXML-SDK style workbook, like the Daisy Tree file: Type/Target/Id order, absolute targets, oneCellAnchor. */
async function buildSdkStyle(rows = 3, headerRow = 6) {
  const z = new JSZip();
  z.file('xl/workbook.xml', `<?xml version="1.0"?><x:workbook xmlns:x="m"><x:sheets><x:sheet name="Quote &amp; Co" sheetId="1" r:id="Rabc" xmlns:r="${NS_R}" /></x:sheets></x:workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<Relationships><Relationship Type="${T('styles')}" Target="/xl/styles.xml" Id="Rsty" /><Relationship Type="${T('worksheet')}" Target="/xl/worksheets/sheet1.xml" Id="Rabc" /></Relationships>`);
  z.file('xl/worksheets/sheet1.xml', '<worksheet/>');
  z.file('xl/worksheets/_rels/sheet1.xml.rels', `<Relationships><Relationship Type="${T('drawing')}" Target="/xl/drawings/drawing1.xml" Id="Rdr" /></Relationships>`);
  let anchors = '', rels = '';
  for (let i = 0; i < rows; i++) {
    anchors += `<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${headerRow + 1 + i}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1" cy="1"/><xdr:pic><xdr:blipFill><a:blip r:embed="Rimg${i}" xmlns:r="${NS_R}"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    rels += `<Relationship Type="${T('image')}" Target="/xl/media/image${i + 1}.png" Id="Rimg${i}" />`;
    z.file(`xl/media/image${i + 1}.png`, img(i));
  }
  z.file('xl/drawings/drawing1.xml', `<xdr:wsDr xmlns:xdr="d">${anchors}</xdr:wsDr>`);
  z.file('xl/drawings/_rels/drawing1.xml.rels', `<Relationships>${rels}</Relationships>`);
  return z.generateAsync({ type: 'uint8array' });
}

/** Classic Excel/WPS layout that already worked: Id-first, relative targets, twoCellAnchor, + WPS DISPIMG. */
async function buildClassic() {
  const z = new JSZip();
  z.file('xl/workbook.xml', `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/><sheet name="Sheet2" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<Relationships><Relationship Id="rId1" Type="${T('worksheet')}" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${T('worksheet')}" Target="worksheets/sheet2.xml"/></Relationships>`);
  z.file('xl/worksheets/sheet1.xml', '<worksheet/>');
  z.file('xl/worksheets/_rels/sheet1.xml.rels', `<Relationships><Relationship Id="rId1" Type="${T('drawing')}" Target="../drawings/drawing1.xml"/></Relationships>`);
  z.file('xl/drawings/drawing1.xml', `<xdr:wsDr>` + [2, 5].map((r, i) => `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>${r}</xdr:row></xdr:from><xdr:to><xdr:row>${r + 1}</xdr:row></xdr:to><xdr:pic><a:blip r:embed="rId${i + 1}"/></xdr:pic></xdr:twoCellAnchor>`).join('') + `</xdr:wsDr>`);
  z.file('xl/drawings/_rels/drawing1.xml.rels', `<Relationships><Relationship Id="rId1" Type="${T('image')}" Target="../media/image1.png"/><Relationship Id="rId2" Type="${T('image')}" Target="../media/image2.jpeg"/></Relationships>`);
  z.file('xl/media/image1.png', img(10));
  z.file('xl/media/image2.jpeg', img(11));
  z.file('xl/cellimages.xml', `<etc:cellImages><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="ID_ABC123"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId9"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>`);
  z.file('xl/_rels/cellimages.xml.rels', `<Relationships><Relationship Id="rId9" Type="${T('image')}" Target="media/image3.png"/></Relationships>`);
  z.file('xl/media/image3.png', img(12));
  return z.generateAsync({ type: 'uint8array' });
}

test('OpenXML-SDK layout: rels in any attribute order, absolute targets, oneCellAnchor → every row has its image', async () => {
  const { floatingBySheet, imgDataUrls } = await lib.extractXlsxImages(await buildSdkStyle(14));
  assert.deepEqual(Object.keys(imgDataUrls), []);
  const map = floatingBySheet['Quote & Co'];                     // XML entity in sheet name decoded
  assert.ok(map, 'sheet not found: ' + Object.keys(floatingBySheet));
  assert.deepEqual(Object.keys(map).map(Number), Array.from({ length: 14 }, (_, i) => 7 + i));
  for (let i = 0; i < 14; i++) assert.equal(map[7 + i], b64(i), 'row ' + (7 + i));
});

test('classic Excel/WPS layout still works (relative targets, twoCellAnchor, DISPIMG, jpeg mime)', async () => {
  const { floatingBySheet, imgDataUrls } = await lib.extractXlsxImages(await buildClassic());
  assert.deepEqual(floatingBySheet, { Sheet1: { 2: b64(10), 5: `data:image/jpeg;base64,${img(11).toString('base64')}` } });
  assert.deepEqual(imgDataUrls, { ID_ABC123: b64(12) });
});

test('helpers: rels parsing / path resolution / sheet + anchor parsing', () => {
  assert.deepEqual(lib.parseRelationships('<Relationship Target="/a/b.xml" Type="t" Id="R1"/><Relationship Id="R2" TargetMode="External" Target="http://x" Type="t"/>'),
    [{ id: 'R1', type: 't', target: '/a/b.xml', external: false }, { id: 'R2', type: 't', target: 'http://x', external: true }]);
  assert.equal(lib.resolveZipTarget('xl/worksheets/sheet1.xml', '../drawings/drawing1.xml'), 'xl/drawings/drawing1.xml');
  assert.equal(lib.resolveZipTarget('xl/drawings/drawing1.xml', '/xl/media/image.png'), 'xl/media/image.png');
  assert.equal(lib.resolveZipTarget('xl/workbook.xml', 'worksheets/sheet1.xml'), 'xl/worksheets/sheet1.xml');
  assert.equal(lib.relsPathFor('xl/worksheets/sheet1.xml'), 'xl/worksheets/_rels/sheet1.xml.rels');
  assert.deepEqual(lib.parseWorkbookSheets('<sheet r:id="rId3" name="A" sheetId="9"/><x:sheet sheetId="1" name="B" r:id="R2" />'), [{ name: 'A', rid: 'rId3' }, { name: 'B', rid: 'R2' }]);
  assert.deepEqual(lib.parseDrawingAnchors('<xdr:absoluteAnchor><a:blip r:embed="X"/></xdr:absoluteAnchor><oneCellAnchor><from><row>4</row></from><a:blip r:embed="Y"/></oneCellAnchor>'), [{ row: 4, embed: 'Y' }]);
});

test('image headers are recognised, product-name headers are not', () => {
  for (const h of ['PRODUCT IMAGE', 'product image', 'Photo', 'Picture', 'IMG', '产品图片', '图片', '照片']) assert.equal(lib.isImageHeader(h), true, h);
  for (const h of ['PRODUCT NAME', 'Product', 'Item', 'Description', 'Specification', '产品名称', '品名', 'pick up', 'shipping', 'Unit Price', '']) assert.equal(lib.isImageHeader(h), false, h);
});

test('parseExcel picks the product-name column, never the image column', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules/quotation/QuotationModule.tsx'), 'utf8');
  assert.match(src, /const itemCol = headers\.findIndex\(\(h: string\) => !isImageHeader\(h\) && keywords\.item\.some/);
  assert.match(src, /item: itemCol,/);
  // Apply the same rule to the Daisy Tree header row.
  const headers = ['no.', 'product image', 'product name', 'size', 'gci unit price (usd)', 'order qty', 'total (usd)', 'carton pack'];
  const item = ['furniture item', 'item', 'product', 'description', '分项', '产品名称', '品名', '项目名称'];
  assert.equal(headers.findIndex(h => !lib.isImageHeader(h) && item.some(k => h === k || (h.length > 1 && h.includes(k)))), 2);
});

test('real Daisy Tree file (local only): 14 SKUs, names, prices and 14 distinct row-matched images', { skip: !fs.existsSync(DAISY) && 'Daisy Tree file not present' }, async () => {
  const buf = fs.readFileSync(DAISY);
  const { floatingBySheet } = await lib.extractXlsxImages(buf);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
  const headerIdx = rows.findIndex(r => (r || []).some(c => /product name/i.test(String(c))));
  const headers = rows[headerIdx].map(h => String(h || '').toLowerCase().trim());
  const nameCol = headers.findIndex(h => !lib.isImageHeader(h) && h.includes('product'));
  const priceCol = headers.findIndex(h => h.includes('unit price'));
  const items = rows.slice(headerIdx + 1).map((r, i) => ({ row: headerIdx + 1 + i, name: String(r?.[nameCol] || '').trim(), price: r?.[priceCol] }))
    .filter(it => /^Daisy Tree/.test(it.name));
  assert.equal(items.length, 14);
  assert.equal(items[0].name, 'Daisy Tree Hyaluronic Acid Moisture Cleansing Water');
  assert.equal(items[13].name, 'Daisy Tree Yuja C Bright FIT Serum Mask');
  assert.deepEqual(items.map(i => i.price), [3.9, 3.9, 4.5, 4.5, 4.5, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36]);
  const map = floatingBySheet[sheet];
  assert.ok(map, 'no images for sheet ' + sheet);
  const urls = items.map(it => map[it.row]);
  assert.ok(urls.every(u => typeof u === 'string' && u.startsWith('data:image/png;base64,')), 'missing image on some row');
  assert.equal(new Set(urls).size, 14, 'images not distinct');
  // Each row's image is the media file its own anchor points to (drawing order image, image2 … image14).
  const zip = await JSZip.loadAsync(buf);
  const order = ['image.png', ...Array.from({ length: 13 }, (_, i) => `image${i + 2}.png`)];
  for (let i = 0; i < 14; i++) assert.equal(urls[i], 'data:image/png;base64,' + (await zip.file('xl/media/' + order[i]).async('base64')), 'row ' + items[i].row);
});
