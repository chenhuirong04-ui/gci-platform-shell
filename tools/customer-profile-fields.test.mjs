import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const SECRET = 'TEST-UAT-assistant-secret';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
process.env.GCI_ASSISTANT_API_SECRET = SECRET;
process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'TEST-UAT-service-role';

const { default: updateCustomer } = await import('../api/assistant/customers/[id]/update.ts');

async function call(body) {
  return updateCustomer(new Request(`https://app.globalcareinfo.com/api/assistant/customers/${CUSTOMER_ID}/update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'TEST-UAT-profile-field-update',
    },
    body: JSON.stringify(body),
  }));
}

test('country and business_type use the existing authenticated audited customer update RPC', async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (_url, init = {}) => {
    payloads.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, action: 'customer_update' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    assert.equal((await call({ country: ' UAE ' })).status, 200);
    assert.equal((await call({ business_type: 'Trade' })).status, 200);
    assert.deepEqual(payloads.map((body) => body.p_payload), [{ country: 'UAE' }, { business_type: 'Trade' }]);
    assert.equal((await call({ country: '   ' })).status, 422);
    assert.equal((await call({ business_type: 'Unapproved' })).status, 422);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP and migration retain narrow field and role allowlists', async () => {
  const [mcp, migration] = await Promise.all([
    readFile(new URL('../api/mcp.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261011063157_assistant_crm_customer_fields.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(mcp, /update_customer_country/);
  assert.match(mcp, /update_customer_business_type/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_user is distinct from 'service_role'/i);
  assert.match(migration, /from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /alter table|create policy|alter policy/i);
});
