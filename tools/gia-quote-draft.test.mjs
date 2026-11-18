// GIA → Quotation Center hand-off: instruction parsing (pure, no guessing).
// Run from the repo root:  node --test tools/gia-quote-draft.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let Q;
before(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-gqd-')), 'q.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'apps/shell/src/lib/giaQuoteDraft.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  Q = await import(pathToFileURL(out).href);
});

test('quote request: price-list file + quote wording only', () => {
  assert.ok(Q.isQuoteRequest('daisy-tree.xlsx', '加价30%给 Hong gourmet 报价'));
  assert.ok(Q.isQuoteRequest('list.pdf', 'make a quote in USD'));
  assert.ok(!Q.isQuoteRequest('contract.docx', '报价'));
  assert.ok(!Q.isQuoteRequest('daisy-tree.xlsx', '这是 SHADI 的劳务合同'));
});

test('full Chinese instruction', () => {
  const r = Q.parseQuoteInstruction('加价30%，USD，VAT 0%，给 Hong gourmet 报价，只要：面霜、Serum Mask');
  assert.deepEqual(r, { margin: 30, currency: 'USD', vat: 0, customer: 'Hong gourmet', products: ['面霜', 'Serum Mask'] });
});

test('variants: 毛利率 25% / 客户：X / 5% VAT / AED', () => {
  const r = Q.parseQuoteInstruction('毛利率25%，客户：DHCN，5% VAT，AED 报价');
  assert.equal(r.margin, 25); assert.equal(r.customer, 'DHCN'); assert.equal(r.vat, 5); assert.equal(r.currency, 'AED');
  assert.equal(Q.parseQuoteInstruction('markup 18.5% quote for Al Noor Trading').margin, 18.5);
  assert.equal(Q.parseQuoteInstruction('quote for Al Noor Trading, USD').customer, 'Al Noor Trading');
  assert.equal(Q.parseQuoteInstruction('出口免税报价').vat, 0);
});

test('nothing stated → nothing filled (never guessed)', () => {
  assert.deepEqual(Q.parseQuoteInstruction('帮我做个报价'), {});
  assert.equal(Q.parseQuoteInstruction('USD 和 AED 都报').currency, undefined); // both named → ask
  assert.equal(Q.parseQuoteInstruction('30 件 报价').margin, undefined);         // a number without % / margin word
});

test('product filter matches name / model / English description', () => {
  const items = [
    { originalName: 'Daisy Tree Calming Cream', model: 'DT-01' },
    { originalName: '테스트 수분 크림', englishDescription: 'Moisture Cream 50ml' },
    { originalName: 'Cleansing Water', model: 'DT-09' },
  ];
  assert.deepEqual(Q.matchProducts(items, ['cream']), [true, true, false]);
  assert.deepEqual(Q.matchProducts(items, ['dt-09']), [false, false, true]);
  assert.equal(Q.matchProducts(items, undefined), null);
});

test('customer resolved only when unambiguous', () => {
  const hit = (n) => ({ customer: { customer_name: n } });
  assert.equal(Q.pickCustomerHit('dhcn', [hit('DHCN'), hit('DHCN Trading')]).customer.customer_name, 'DHCN');
  assert.equal(Q.pickCustomerHit('Hong', [hit('Hong gourmet hypermarket L.L.C')]).customer.customer_name, 'Hong gourmet hypermarket L.L.C');
  assert.equal(Q.pickCustomerHit('Hong', [hit('Hong A'), hit('Hong B')]), null);
  assert.equal(Q.pickCustomerHit('X', []), null);
});

test('hand-off is read once', () => {
  Q.setQuoteHandoff({ file: { name: 'a.xlsx' }, instruction: { margin: 30 }, text: 't' });
  assert.equal(Q.takeQuoteHandoff().instruction.margin, 30);
  assert.equal(Q.takeQuoteHandoff(), null);
});

test('wiring: GIA card hands off, Quotation Center consumes once and saves nothing', () => {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
  const gia = read('apps/shell/src/components/BusinessAssistantEntry.tsx');
  assert.match(gia, /if \(can\('quotation'\) && isQuoteRequest\(selectedFile\.name, v\)\) \{/);
  assert.match(gia, /setQuoteHandoff\(\{ file: selectedFile, instruction: pendingQuoteDraft\.instruction, text: pendingQuoteDraft\.text \}\);/);
  const qc = read('modules/quotation/QuotationModule.tsx');
  const intake = qc.slice(qc.indexOf('const giaQuoteRef = useRef'), qc.indexOf('/** Auto-fills Supplier Name/Contact'));
  assert.match(intake, /const h = takeQuoteHandoff\(\);/);
  assert.ok(!/save(Quotation|SupplierQuote)\(|handleSave|updateQuotation\(/.test(intake), 'GIA intake must not save');
  assert.match(qc, /setTradeVatPercent\(giaQuoteRef\.current\?\.instruction\.vat === 0 \? 0 : 5\);/);
  assert.match(qc, /data-testid="gia-quote-banner"/);
});
