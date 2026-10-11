import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { executeSupplierWrite } = await import('../api/assistant/_lib.ts');
const { default: createHandler } = await import('../api/assistant/suppliers/create.ts');
const { default: contactHandler } = await import('../api/assistant/suppliers/[id]/contact.ts');

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const supplierId = '33333333-3333-4333-8333-333333333333';

function request(path, body, headers = {}) {
  return new Request(`https://app.globalcareinfo.com${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer TEST-UAT-api-secret', 'content-type': 'application/json', 'idempotency-key': 'TEST-UAT-SUPPLIER-001', ...headers },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.GCI_ASSISTANT_API_SECRET = 'TEST-UAT-api-secret';
  process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'TEST-UAT-server-only';
});
test.afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

test('supplier create uses only the scoped RPC with hash and idempotency key', async () => {
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url: String(url), headers: init.headers, body: JSON.parse(String(init.body)) };
    return Response.json({ ok: true, action: 'supplier_create', supplier_id: supplierId });
  };
  const response = await executeSupplierWrite(request('/api/assistant/suppliers/create', {}), {
    supabaseUrl: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, actor: 'gci-executive-assistant',
  }, 'supplier_create', null, { supplier_name_display: 'TEST-UAT Supplier' });
  assert.equal(response.status, 201);
  assert.match(call.url, /\/rpc\/assistant_execute_supplier_action$/);
  assert.equal(call.body.p_action, 'supplier_create');
  assert.match(call.body.p_request_hash, /^[0-9a-f]{64}$/);
  assert.equal(call.body.p_idempotency_key, 'TEST-UAT-SUPPLIER-001');
  assert.equal(call.headers.Authorization, 'Bearer TEST-UAT-server-only');
});

test('API rejects unauthenticated create and cross-supplier/invalid contact input before RPC', async () => {
  const unauthorized = await createHandler(request('/api/assistant/suppliers/create', { supplier_name_display: 'TEST-UAT Supplier' }, { authorization: '' }));
  assert.equal(unauthorized.status, 401);
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({}); };
  const invalid = await contactHandler(request(`/api/assistant/suppliers/${supplierId}/contact`, { job_title: 'Buyer' }));
  assert.equal(invalid.status, 422);
  assert.equal(called, false);
});

test('migration is service-role-only, security invoker, audited and does not change supplier grants/RLS or CRM', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261011090000_assistant_supplier_writes.sql', import.meta.url), 'utf8');
  assert.match(sql, /security invoker/i);
  assert.match(sql, /current_user\s*<>\s*'service_role'/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
  assert.match(sql, /supplier_idempotency_requests/i);
  assert.match(sql, /supplier_audit_log/i);
  assert.doesNotMatch(sql, /alter table public\.(suppliers|supplier_contacts)|grant (insert|update|delete) on public\.(suppliers|supplier_contacts)/i);
  assert.doesNotMatch(sql, /crm_customers|assistant_execute_crm_action|notion|telegram/i);
});
