// Quotation Center: a quote opened from History shows the quote even when History was
// entered from the landing page (appMode 'landing').
// Run from the repo root:  node --test modules/quotation/__tests__/historyReopen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const M = fs.readFileSync(path.join(ROOT, 'modules/quotation/QuotationModule.tsx'), 'utf8').split('\r\n').join('\n');
const body = (name) => {
  const start = M.indexOf(`const ${name} = `);
  assert.ok(start >= 0, name);
  return M.slice(start, M.indexOf('\n  };\n', start));
};

test('cloud GCI quote reopened from history switches to the quote view', () => {
  assert.match(body('handleLoadDraft'), /setView\('configurator'\);[^\n]*\n\s+setAppMode\('customer-quote'\);/);
});

test('local history quote reopened switches to the quote view', () => {
  assert.match(body('restoreQuote'), /setView\('configurator'\);\n\s+setAppMode\('customer-quote'\);\n?$/);
});
