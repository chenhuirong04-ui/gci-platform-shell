import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { findCustomerByEmail } from '../api/assistant/_lib.ts';

const originalFetch = globalThis.fetch;
const ctx = {
  supabaseUrl: 'https://efrkvwhzpgahjgfukjth.supabase.co',
  serviceKey: 'synthetic-service-key',
  actor: 'gci-executive-assistant',
};

function request(email) {
  return new Request(`https://app.globalcareinfo.com/api/assistant/customers/find-by-email?email=${encodeURIComponent(email)}`);
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('keeps the existing Assistant API authorization boundary', async () => {
  const route = await readFile(new URL('../api/assistant/customers/find-by-email.ts', import.meta.url), 'utf8');
  assert.match(route, /authenticateAssistant\(request\)/);
  assert.match(route, /if \(!auth\.ok\) return auth\.response/);
});

test('trims and case-folds an exact contact email and returns only customer_id', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json([
      { customer_id: '00000000-0000-4000-8000-000000000001', email: ' Sales@Example.COM ' },
    ]);
  };
  const response = await findCustomerByEmail(request('  SALES@example.com  '), ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, customer_id: '00000000-0000-4000-8000-000000000001' });
  assert.match(requestedUrl, /crm_contacts\?/);
  assert.match(decodeURIComponent(requestedUrl), /select=customer_id,email/);
  assert.match(decodeURIComponent(requestedUrl), /email=ilike.sales@example.com/);
});

test('returns not_found when no exact normalized email matches', async () => {
  globalThis.fetch = async () => Response.json([
    { customer_id: '00000000-0000-4000-8000-000000000001', email: 'other@example.com' },
  ]);
  const response = await findCustomerByEmail(request('sales@example.com'), ctx);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
});

test('returns ambiguous for matches belonging to different customers', async () => {
  globalThis.fetch = async () => Response.json([
    { customer_id: '00000000-0000-4000-8000-000000000001', email: 'sales@example.com' },
    { customer_id: '00000000-0000-4000-8000-000000000002', email: 'SALES@EXAMPLE.COM' },
  ]);
  const response = await findCustomerByEmail(request('sales@example.com'), ctx);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: 'ambiguous' });
});

test('deduplicates repeated contacts for the same customer', async () => {
  globalThis.fetch = async () => Response.json([
    { customer_id: '00000000-0000-4000-8000-000000000001', email: 'sales@example.com' },
    { customer_id: '00000000-0000-4000-8000-000000000001', email: 'SALES@EXAMPLE.COM' },
  ]);
  const response = await findCustomerByEmail(request('sales@example.com'), ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, customer_id: '00000000-0000-4000-8000-000000000001' });
});
