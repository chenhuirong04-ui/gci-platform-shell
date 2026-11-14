// Quotation Center — Supplier Quote currency ↔ exchange-rate linkage + Excel header currency detection.
// Run from the repo root:  node --test modules/quotation/__tests__/currencyRate.test.mjs
// Optional real-file check (not committed — public repo): DAISY_TREE_XLSX=... (defaults to ~/Downloads).
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
const XLSX = require('xlsx');
const DAISY = process.env.DAISY_TREE_XLSX || path.join(os.homedir(), 'Downloads', 'GCI_Daisy_Tree_Quotation_CORRECTED_30percent_ONLY.xlsx');
const SRC = fs.readFileSync(path.join(ROOT, 'modules/quotation/QuotationModule.tsx'), 'utf8').replace(/\r\n/g, '\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'missing: ' + a); const j = s.indexOf(b, i + a.length); return s.slice(i, j < 0 ? undefined : j); };

let lib;
before(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-cur-')), 'currencyRates.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/quotation/lib/currencyRates.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  lib = await import(pathToFileURL(out).href);
});

test('acceptance: CNY 100 → AED 50.50, USD 100 → AED 367.25, AED 100 → AED 100.00', () => {
  assert.equal(lib.convertAmount(100, lib.defaultRate('CNY', 'AED')), '50.50');
  assert.equal(lib.convertAmount(100, lib.defaultRate('USD', 'AED')), '367.25');
  assert.equal(lib.convertAmount(100, lib.defaultRate('AED', 'AED')), '100.00');
  assert.equal(lib.defaultRate('USD', 'USD'), 1);
});

test('existing rate table is unchanged', () => {
  assert.deepEqual(lib.DEFAULT_RATES, {
    AED: { AED: 1.0, USD: 0.2723 }, USD: { AED: 3.6725, USD: 1.0 }, CNY: { AED: 0.505, USD: 0.1375 },
    EUR: { AED: 4.00, USD: 1.09 }, GBP: { AED: 4.67, USD: 1.27 },
  });
});

test('header detection: one explicit currency is used, none/several require confirmation', () => {
  const d = h => lib.detectHeaderCurrency(h);
  assert.equal(d(['gci unit price (usd)', 'total']).currency, 'USD');
  assert.equal(d(['unit price rmb', '']).currency, 'CNY');
  assert.equal(d(['单价(人民币)']).currency, 'CNY');
  assert.equal(d(['price cny']).currency, 'CNY');
  assert.equal(d(['aed price', 'total aed']).currency, 'AED');
  const multi = d(['price (usd)', 'total (rmb)']);
  assert.equal(multi.currency, null); assert.deepEqual(multi.found, ['USD', 'CNY']);
  const none = d(['unit price', 'amount']);
  assert.equal(none.currency, null); assert.deepEqual(none.found, []);
  for (const h of ['thousand', 'raed', 'focused', '单价(元)']) assert.equal(d([h]).currency, null, h); // no guessing
});

test('supplier quote page: rate follows the currency pair, manual edit kept, gates before save/convert', () => {
  assert.ok(!/useState<number>\(0\.505\); \/\/ Supplier currency/.test(SRC), 'hard-coded 0.505 default is back');
  assert.match(SRC, /setSqExchangeRate\(defaultRate\(supplierMeta\.currency \|\| 'AED', sqCustomerCurrency\)\);\n  \}, \[supplierMeta\.currency, sqCustomerCurrency\]\);/);
  assert.match(SRC, /onChange=\{e => setSqExchangeRate\(Number\(e\.target\.value\) \|\| 0\)\}/); // manual override still allowed
  assert.equal((SRC.match(/onChange=\{e => changeSupplierCurrency\(e\.target\.value\)\}/g) || []).length, 2);
  const save = between(SRC, 'const handleSaveSupplierQuote = async', "setSqSaveStatus('saving');");
  assert.match(save, /if \(sqCurrencyNeedsConfirm\)/);
  assert.match(save, /window\.confirm\(/);
  assert.match(save, /convertAmount\(100, sqExchangeRate\)/);
  assert.match(between(SRC, '{/* PRIMARY: Convert to GCI Quote */}', 'setShowCurrencyModal(true);'), /if \(sqCurrencyNeedsConfirm\)/);
});

test('Excel parse uses the header currency for rows; package quote CNY defaults untouched', () => {
  const parse = between(SRC, 'const parseExcel = async', 'const parsePDF = async');
  assert.match(parse, /detectHeaderCurrency\(\[headers\[autoMappings\.price\]/);
  assert.match(parse, /const supplierCurrencyAtParse = parseCurrency;/);
  assert.match(SRC, /const \[pqExchangeRate, setPqExchangeRate\] = useState<number>\(0\.505\); \/\/ default CNY→AED/);
  assert.match(SRC, /const defaultRate = base === 'CNY' \? 0\.505 : base === 'USD' \? 3\.6725/);
});

test('real Daisy Tree file (local only): price header is detected as USD', { skip: !fs.existsSync(DAISY) && 'Daisy Tree file not present' }, () => {
  const wb = XLSX.read(fs.readFileSync(DAISY));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const headerRow = rows.find(r => r.some(c => /^product name$/i.test(String(c).trim())));
  const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
  const price = headers.find(h => h.includes('price'));
  const total = headers.find(h => h.includes('total')) || '';
  assert.equal(price, 'gci unit price (usd)');
  assert.equal(lib.detectHeaderCurrency([price, total]).currency, 'USD');
});
