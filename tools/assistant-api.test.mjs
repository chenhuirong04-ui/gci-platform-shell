import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateAssistant,
  dubaiDate,
  executeWrite,
  getCustomerDetail,
  getTodayAndOverdue,
} from '../api/assistant/_lib.ts';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const ctx = {
  supabaseUrl: 'https://efrkvwhzpgahjgfukjth.supabase.co',
  serviceKey: 'test-service-role',
  actor: 'gci-executive-assistant',
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('assistant authentication rejects a wrong secret and accepts the dedicated secret', async () => {
  process.env.GCI_ASSISTANT_API_SECRET = 'assistant-test-secret';
  process.env.SUPABASE_URL = ctx.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ctx.serviceKey;
  const denied = await authenticateAssistant(new Request('https://app.globalcareinfo.com/api/assistant/followups/today'));
  assert.equal(denied.ok, false);
  assert.equal(denied.response.status, 401);
  const allowed = await authenticateAssistant(new Request('https://app.globalcareinfo.com/api/assistant/followups/today', {
    headers: { Authorization: 'Bearer assistant-test-secret' },
  }));
  assert.equal(allowed.ok, true);
});

test('scenario C customer detail uses read-only GET requests', async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];
  globalThis.fetch = async (url, init = {}) => {
    methods.push(init.method || 'GET');
    const value = String(url);
    if (value.includes('/crm_customers?')) return response([{ id: CUSTOMER_ID, customer_name: 'TEST-UAT ABC' }]);
    if (value.includes('/crm_contacts?')) return response([{ id: 'contact-1', customer_id: CUSTOMER_ID }]);
    if (value.includes('/crm_followups?')) return response([{ id: 'followup-1', customer_id: CUSTOMER_ID }]);
    return response({}, 404);
  };
  try {
    const result = await getCustomerDetail(CUSTOMER_ID, ctx);
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.customer.customer_name, 'TEST-UAT ABC');
    assert.equal(body.contacts.length, 1);
    assert.equal(body.followups.length, 1);
    assert.deepEqual(methods, ['GET', 'GET', 'GET']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('scenario D splits Dubai today and overdue while excluding closed customers', async () => {
  const originalFetch = globalThis.fetch;
  const today = dubaiDate();
  globalThis.fetch = async () => response([
    { id: 'today', customer_name: 'Today', next_follow_up_at: today, status: '待报价' },
    { id: 'overdue', customer_name: 'Overdue', next_follow_up_at: '2020-01-01', status: '执行中' },
    { id: 'closed', customer_name: 'Closed', next_follow_up_at: '2020-01-01', status: 'closed' },
  ]);
  try {
    const result = await getTodayAndOverdue(ctx);
    const body = await result.json();
    assert.deepEqual(body.today.map((row) => row.id), ['today']);
    assert.deepEqual(body.overdue.map((row) => row.id), ['overdue']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writes require an idempotency key and pass a stable request hash to the RPC', async () => {
  const missing = await executeWrite(
    new Request(`https://app.globalcareinfo.com/api/assistant/customers/${CUSTOMER_ID}/update`, { method: 'POST' }),
    ctx,
    'customer_update',
    CUSTOMER_ID,
    { priority: 'A' },
  );
  assert.equal(missing.status, 400);

  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    bodies.push(JSON.parse(init.body));
    return response({ ok: true, action: 'customer_update', idempotent_replay: false });
  };
  try {
    for (const payload of [{ priority: 'A', notes: '重点' }, { notes: '重点', priority: 'A' }]) {
      const request = new Request(`https://app.globalcareinfo.com/api/assistant/customers/${CUSTOMER_ID}/update`, {
        method: 'POST', headers: { 'Idempotency-Key': 'test-uat-priority-001' },
      });
      assert.equal((await executeWrite(request, ctx, 'customer_update', CUSTOMER_ID, payload)).status, 200);
    }
    assert.equal(bodies[0].p_request_hash, bodies[1].p_request_hash);
    assert.equal(bodies[0].p_actor, 'gci-executive-assistant');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
