// Quotation Center: new customer typed into a quote + similar-name warning.
// Run from the repo root:  node --test modules/quotation/__tests__/quoteNewCustomer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCustomerName, coreSearchTerm, isSimilarCustomerName, similarCustomers } from '../lib/quoteCustomer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

test('similar names ignore case, punctuation and company suffixes', () => {
  assert.equal(normalizeCustomerName('DHCN Trading L.L.C.'), 'dhcn');
  assert.equal(normalizeCustomerName('深圳美妆贸易有限公司'), '深圳美妆');
  assert.ok(isSimilarCustomerName('DHCN Trading LLC', 'dhcn'));
  assert.ok(isSimilarCustomerName('Al Noor General Trading', 'AL-NOOR FZE'));
  assert.ok(isSimilarCustomerName('Hong Gourmet', 'Hong gourmet Restaurant'));
  assert.ok(!isSimilarCustomerName('ABC Hotel', 'XYZ Hotel'));
  assert.ok(!isSimilarCustomerName('Al', 'Al Noor')); // too short to call similar
  assert.ok(!isSimilarCustomerName('', 'DHCN'));
});

test('core search term is the most distinctive word', () => {
  assert.equal(coreSearchTerm('DHCN Trading LLC'), 'dhcn');
  assert.equal(coreSearchTerm('Al Noor General Trading'), 'noor');
  assert.equal(coreSearchTerm('LLC'), '');
});

test('similarCustomers only returns look-alike names, once each', () => {
  const hit = (id, name) => ({ customer: { id, customer_name: name }, contact: null });
  const out = similarCustomers('DHCN Trading', [hit('1', 'DHCN'), hit('2', 'Other Co'), hit('1', 'DHCN'), hit('3', 'DHCN Middle East')]);
  assert.deepEqual(out.map(h => h.customer.id), ['1', '3']);
});

test('quote wiring: ask before CRM, quote-only keeps name/phone without a CRM link, never auto-merges', () => {
  const C = read('modules/quotation/components/QuoteNewCustomer.tsx');
  assert.match(C, /Also save to CRM customer records\?/);
  // Yes → the shared create dialog (user confirms there), pre-filled; No → quote only
  assert.match(C, /<CustomerCreateModal[\s\S]*initialContact=\{\{ contactName: form\.contactName, mobile: form\.phone, email: form\.email \}\}/);
  assert.match(C, /onClick=\{\(\) => \{ setStage\('idle'\); onQuoteOnly\(form\); \}\}/);
  // similar customers: shown only; linking one needs an explicit click
  assert.match(C, /onClick=\{\(\) => useExisting\(c, contact\)\}/);
  assert.doesNotMatch(C, /quickCreateCustomer|\.update\(|\.insert\(/);

  const M = read('modules/quotation/QuotationModule.tsx');
  assert.match(M, /setQuoteInfo\(prev => \(\{ \.\.\.prev, customerProjectName: c\.name, customerId: null, projectId: null, phoneWhatsApp: c\.phone \}\)\);/);
  assert.match(M, /applyQuoteCustomer\(selectionFrom\(c, contact\)\);/);
  // a quote-only customer is a deliberate choice: no second "no CRM customer" prompt on save
  assert.match(M, /quoteSource === 'supplier-archive' && !quoteInfo\.customerId && !sqQuoteOnlyCustomer/);
  // any CRM pick (or archive restore) replaces the quote-only customer
  assert.match(M, /setSqCpSelection\(next\);\n\s+setSqQuoteOnlyCustomer\(null\);/);
  assert.equal((M.match(/<QuoteNewCustomer /g) || []).length, 2);

  const D = read('apps/shell/src/components/CustomerCreateModal.tsx');
  assert.match(D, /contactName: initialContact\?\.contactName \|\| '', mobile: initialContact\?\.mobile \|\| '', email: initialContact\?\.email \|\| ''/);
});
