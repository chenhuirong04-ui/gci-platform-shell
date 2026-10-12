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

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const supplierId = '33333333-3333-4333-8333-333333333333';

process.env.GCI_ASSISTANT_API_SECRET = 'TEST-UAT-api-secret';
process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'TEST-UAT-server-only';

const { default: updateSupplier } = await import('../api/assistant/suppliers/[id]/update.ts');

function request(body) {
  return new Request(`https://app.globalcareinfo.com/api/assistant/suppliers/${supplierId}/update`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer TEST-UAT-api-secret',
      'content-type': 'application/json',
      'idempotency-key': 'TEST-UAT-SUPPLIER-FOLLOWUP-001',
    },
    body: JSON.stringify(body),
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => { process.env = { ...originalEnv }; });

test('assistant supplier update accepts only valid current follow-up fields', async () => {
  let rpcBody;
  globalThis.fetch = async (_url, init) => {
    rpcBody = JSON.parse(String(init.body));
    return Response.json({ ok: true, action: 'supplier_update', supplier_id: supplierId });
  };

  const response = await updateSupplier(request({ next_action: ' Confirm latest quote ', next_follow_up_at: '2026-10-20' }));
  assert.equal(response.status, 200);
  assert.deepEqual(rpcBody.p_payload, { next_action: 'Confirm latest quote', next_follow_up_at: '2026-10-20' });
  assert.equal((await updateSupplier(request({ next_follow_up_at: '20/10/2026' }))).status, 422);
  assert.equal((await updateSupplier(request({ unrelated_field: 'blocked' }))).status, 422);
});

test('migration is additive, preserves the existing controlled RPC boundary, and does not touch CRM or reminders', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261012090000_supplier_followup_fields.sql', import.meta.url), 'utf8');
  assert.match(sql, /alter table public\.suppliers[\s\S]*add column if not exists next_action text[\s\S]*add column if not exists next_follow_up_at date/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /current_user\s*<>\s*'service_role'/i);
  assert.match(sql, /supplier_idempotency_requests/i);
  assert.match(sql, /supplier_audit_log/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /crm_customers|crm_followups|supplier_followups|telegram/i);
  assert.doesNotMatch(sql, /alter table public\.(crm_customers|crm_followups)/i);
});

test('MCP, read projection, form, and detail expose both supplier follow-up fields', async () => {
  const [mcp, search, form, detail] = await Promise.all([
    readFile(new URL('../api/mcp.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/assistant/search.ts', import.meta.url), 'utf8'),
    readFile(new URL('../modules/suppliers/components/SupplierForm.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../modules/suppliers/components/SupplierDetail.tsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [mcp, search, form, detail]) {
    assert.match(source, /next_action/);
    assert.match(source, /next_follow_up_at/);
  }
  assert.doesNotMatch(mcp, /supplier_followups/);
});
