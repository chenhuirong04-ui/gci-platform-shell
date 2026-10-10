import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCustomer } from '../api/assistant/_lib.ts';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const validBody = { customer_name: 'TEST-UAT China Railway No.4', business_type: 'Workforce/Technical Services' };

function request(body = validBody, headers = {}) {
  return new Request('https://app.globalcareinfo.com/api/assistant/customers/create', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-api-secret',
      'content-type': 'application/json',
      'idempotency-key': 'TEST-UAT-CUSTOMER-001',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.GCI_ASSISTANT_API_SECRET = 'test-api-secret';
  process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test('creates through the one scoped RPC with an idempotency hash and safe payload', async () => {
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url: String(url), body: JSON.parse(String(init.body)) };
    return Response.json({ ok: true, outcome: 'created', customer: { id: '00000000-0000-4000-8000-000000000001', customer_name: validBody.customer_name } });
  };
  const response = await createCustomer(request(), {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    actor: 'gci-executive-assistant',
  }, validBody);
  assert.equal(response.status, 201);
  assert.match(call.url, /\/rpc\/assistant_create_crm_customer$/);
  assert.deepEqual(call.body.p_payload, validBody);
  assert.match(call.body.p_request_hash, /^[0-9a-f]{64}$/);
  assert.equal(call.body.p_idempotency_key, 'TEST-UAT-CUSTOMER-001');
});

test('reports a duplicate across active/archive states instead of creating another customer', async () => {
  globalThis.fetch = async () => Response.json({
    ok: true,
    outcome: 'duplicate',
    customer: { id: '00000000-0000-4000-8000-000000000002', customer_name: validBody.customer_name, is_active: false },
  });
  const response = await createCustomer(request(), {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    actor: 'gci-executive-assistant',
  }, validBody);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).outcome, 'duplicate');
});

test('migration grants only service_role and does not alter tables or RLS', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261010090000_assistant_create_customer.sql', import.meta.url), 'utf8');
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /alter\s+table|create\s+table|enable\s+row\s+level\s+security/i);
});

test('API and MCP source expose only the approved create fields', async () => {
  const api = await readFile(new URL('../api/assistant/customers/create.ts', import.meta.url), 'utf8');
  const mcp = await readFile(new URL('../api/mcp.ts', import.meta.url), 'utf8');
  assert.match(api, /\['customer_name', 'business_type', 'country', 'city'\]/);
  assert.doesNotMatch(api, /service_role|owner|bank|passport/i);
  assert.match(mcp, /register\(server, 'create_customer'/);
});
