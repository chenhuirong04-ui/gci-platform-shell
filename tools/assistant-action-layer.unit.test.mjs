import assert from 'node:assert/strict';
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

const { default: executeHandler } = await import('../api/assistant/actions/execute.ts');
const { default: previewHandler } = await import('../api/assistant/actions/preview.ts');

const SECRET = 'test-assistant-secret';
const authHeaders = { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

function configure() {
  process.env.GCI_ASSISTANT_API_SECRET = SECRET;
  process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
}

test('medium and high actions cannot execute without a preview confirmation', async () => {
  configure();
  for (const action_type of [
    'quotation_draft_update', 'invoice_issue', 'update_task_status',
    'complete_commitment', 'close_decision', 'mark_decision_duplicate',
    'update_asset_review_status',
  ]) {
    const response = await executeHandler(new Request('https://app.globalcareinfo.com/api/assistant/actions/execute', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ action_type, target_id: '11111111-1111-4111-8111-111111111111', payload: {}, reason: 'TEST-UAT gate' }),
    }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'confirmation_required');
  }
});

test('low actions require an idempotency key', async () => {
  configure();
  for (const [action_type, target_id, payload] of [
    ['task_create', null, { title: 'TEST-UAT' }],
    ['update_task_due_date', '11111111-1111-4111-8111-111111111111', { due_at: null }],
  ]) {
    const response = await executeHandler(new Request('https://app.globalcareinfo.com/api/assistant/actions/execute', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ action_type, target_id, payload, reason: 'TEST-UAT idempotency' }),
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'valid_idempotency_key_required');
  }
});

test('preview calls only the server-side preview RPC and never executes a write action', async () => {
  configure();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, preview_id: '22222222-2222-4222-8222-222222222222', risk: 'medium' }), { status: 200 });
  };
  try {
    const response = await previewHandler(new Request('https://app.globalcareinfo.com/api/assistant/actions/preview', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ action_type: 'customer_owner_update', target_id: '11111111-1111-4111-8111-111111111111', payload: { owner: 'Chris' }, reason: 'TEST-UAT preview' }),
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /rpc\/assistant_preview_business_action$/);
    assert.equal(calls[0].body.p_action_type, 'customer_owner_update');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Action Center preview routes to the dedicated RPC and never executes', async () => {
  configure();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, preview_id: '22222222-2222-4222-8222-222222222222', risk: 'medium' }), { status: 200 });
  };
  try {
    const response = await previewHandler(new Request('https://app.globalcareinfo.com/api/assistant/actions/preview', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ action_type: 'complete_commitment', target_id: '11111111-1111-4111-8111-111111111111', payload: { completion_note: 'TEST-UAT' }, reason: 'TEST-UAT preview' }),
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /rpc\/assistant_preview_action_center_action$/);
    assert.equal(calls[0].body.p_action_type, 'complete_commitment');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unsupported action is rejected before any database call', async () => {
  configure();
  const response = await previewHandler(new Request('https://app.globalcareinfo.com/api/assistant/actions/preview', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ action_type: 'delete_finance', target_id: '11111111-1111-4111-8111-111111111111', payload: {}, reason: 'forbidden' }),
  }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'unsupported_action');
});
