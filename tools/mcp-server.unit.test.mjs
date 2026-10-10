import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

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

const SECRET = 'TEST-UAT-MCP-secret';
const CLAUDE_SECRET = 'TEST-UAT-Claude-MCP-secret';
process.env.GCI_ASSISTANT_API_SECRET = SECRET;
process.env.GCI_CLAUDE_MCP_SECRET = CLAUDE_SECRET;
process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'TEST-UAT-server-only';

const { default: mcpHandler } = await import('../api/mcp.ts');

const ids = {
  customer: '11111111-1111-4111-8111-111111111111',
  product: '22222222-2222-4222-8222-222222222222',
  supplier: '33333333-3333-4333-8333-333333333333',
  project: '44444444-4444-4444-8444-444444444444',
  quotation: '55555555-5555-4555-8555-555555555555',
  invoice: '66666666-6666-4666-8666-666666666666',
  preview: '77777777-7777-4777-8777-777777777777',
  task: '88888888-8888-4888-8888-888888888888',
  commitment: '99999999-9999-4999-8999-999999999999',
  decision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  canonicalDecision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  asset: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
const calls = [];

async function assistantFixture(request) {
  const url = new URL(request.url);
  let expectedSecret = SECRET;
  if (url.pathname.startsWith('/api/assistant/actions/')) {
    const body = await request.clone().json();
    if (['update_task_status', 'update_task_due_date', 'complete_commitment', 'close_decision', 'mark_decision_duplicate', 'update_asset_review_status', 'update_asset_system_metadata', 'update_decision_execution_status'].includes(body.action_type)) {
      expectedSecret = CLAUDE_SECRET;
    }
  }
  assert.equal(request.headers.get('authorization'), `Bearer ${expectedSecret}`);
  calls.push({ path: url.pathname, method: request.method, idempotencyKey: request.headers.get('idempotency-key') });
  if (url.pathname === '/api/assistant/capabilities') return { status: 200, body: { ok: true, actions: { invoice_issue: 'high' }, forbidden: ['external_communication'] } };
  if (url.pathname === '/api/assistant/customers/search') return { status: 200, body: { ok: true, customers: [{ id: ids.customer, customer_name: 'TEST-UAT ABC' }] } };
  if (url.pathname === '/api/assistant/customers/create') return { status: 201, body: { ok: true, outcome: 'created', customer: { id: ids.customer, customer_name: 'TEST-UAT ABC' } } };
  if (url.pathname === `/api/assistant/context/customer/${ids.customer}`) return { status: 200, body: { ok: true, customer: { id: ids.customer }, projects: [{ id: ids.project }], quotations: [{ id: ids.quotation }], invoices: [{ id: ids.invoice }], receivables: { service: [] }, payments: {}, documents: [] } };
  if (url.pathname === '/api/assistant/followups/today') return { status: 200, body: { ok: true, date: '2026-10-06', today: [{ customer_id: ids.customer }], overdue: [] } };
  if (url.pathname === '/api/assistant/management/today') return { status: 200, body: { ok: true, tasks: { today: [], overdue: [], unscheduled: [] }, commitments: [], decisions: [] } };
  if (url.pathname === '/api/assistant/products/search') return { status: 200, body: { ok: true, products: [{ id: ids.product }] } };
  if (url.pathname === `/api/assistant/context/product/${ids.product}`) return { status: 200, body: { ok: true, product: { id: ids.product }, inventory: { standard_inventory_available: false }, latest_supplier_prices: [{ supplier_cost: 80 }], historical_selling_prices: [{ selling_price: 120 }], gaps: ['no standard inventory ledger'] } };
  if (url.pathname === '/api/assistant/search' && url.searchParams.get('module') === 'supplier') return { status: 200, body: { ok: true, records: [{ id: ids.supplier }] } };
  if (url.pathname === `/api/assistant/context/supplier/${ids.supplier}`) return { status: 200, body: { ok: true, supplier: { id: ids.supplier }, quotations: [{ id: 'quote' }], quotation_items: [{ supplier_cost: 80 }] } };
  if (url.pathname === `/api/assistant/context/project/${ids.project}`) return { status: 200, body: { ok: true, project: { id: ids.project, status: 'active' } } };
  if (url.pathname === '/api/assistant/overview') return { status: 200, body: { ok: true, invoices: {}, procurement: {}, management: {}, risks: [] } };
  if (url.pathname === '/api/assistant/actions/preview') return { status: 200, body: { ok: true, preview_id: ids.preview, confirmation_required: true } };
  if (url.pathname === '/api/assistant/actions/execute') return request.json().then((body) => {
    if (body.action_type === 'quotation_draft_create') return { status: 200, body: { ok: true, target_id: ids.quotation, risk: 'low' } };
    if (body.action_type === 'quotation_draft_update') return { status: 200, body: { ok: true, target_id: ids.quotation, risk: 'medium' } };
    if (body.action_type === 'invoice_draft_create') return { status: 200, body: { ok: true, target_id: ids.invoice, risk: 'low', result: { status: 'draft' } } };
    if (body.action_type === 'invoice_issue') return { status: 409, body: { ok: false, error: 'confirmation_required' } };
    if (['update_task_status', 'update_task_due_date', 'complete_commitment', 'close_decision', 'mark_decision_duplicate', 'update_asset_review_status', 'update_asset_system_metadata', 'update_decision_execution_status'].includes(body.action_type)) {
      return { status: 200, body: { ok: true, target_id: body.target_id, risk: body.action_type === 'update_task_due_date' ? 'low' : 'medium', result: body.payload } };
    }
    return { status: 422, body: { ok: false, error: 'unsupported_action' } };
  });
  return { status: 404, body: { ok: false, error: 'TEST-UAT_fixture_missing', path: url.pathname } };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  if (url.pathname === '/api/mcp') return mcpHandler(request);
  const fixture = await assistantFixture(request);
  return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: { 'Content-Type': 'application/json' } });
};

async function withClient(run, bearerSecret = SECRET) {
  const client = new Client({ name: 'gci-mcp-TEST-UAT', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://app.globalcareinfo.com/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${bearerSecret}`, Host: 'app.globalcareinfo.com' } },
    fetch: globalThis.fetch,
  });
  await client.connect(transport);
  try { await run(client); } finally { await transport.close(); }
}

function status(result) {
  return result.structuredContent?.status;
}

test('MCP client lists all required GCI tools with schemas and safety annotations', async () => {
  await withClient(async (client) => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((tool) => tool.name));
    const required = [
      'create_customer', 'search_customers', 'get_customer_context', 'get_today_followups', 'get_overdue_actions',
      'search_products', 'get_product_context', 'get_inventory', 'get_price_history',
      'search_suppliers', 'get_supplier_context', 'get_supplier_quotes', 'get_quotation',
      'list_customer_quotations', 'get_project_context', 'list_customer_projects',
      'get_finance_context', 'get_customer_receivables', 'get_invoice', 'list_customer_invoices',
      'get_documents', 'get_action_center', 'get_business_overview', 'get_capabilities',
      'update_customer_followup', 'update_next_action', 'update_next_followup_date',
      'update_customer_priority', 'add_customer_note', 'upsert_contact',
      'create_quotation_draft', 'update_quotation_draft', 'create_invoice_draft', 'add_internal_task',
      'update_task_status', 'update_task_due_date', 'complete_commitment', 'close_decision',
      'mark_decision_duplicate', 'update_asset_review_status',
      'update_asset_system_metadata',
      'update_decision_execution_status',
      'preview_invoice_issue', 'issue_invoice', 'preview_quotation_send', 'send_quotation',
    ];
    assert.equal(result.tools.length, 47);
    for (const name of required) assert.ok(names.has(name), `missing tool ${name}`);
    for (const tool of result.tools) {
      assert.ok(tool.description);
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.outputSchema?.type, 'object');
      assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean');
    }
  });
});

test('MCP endpoint accepts the dedicated Claude connector secret', async () => {
  await withClient(async (client) => {
    assert.equal(client.getServerVersion()?.version, '1.4.0');
    const result = await client.listTools();
    assert.equal(result.tools.length, 47);
  }, CLAUDE_SECRET);
});

test('MCP TEST-UAT read flows and controlled draft flows use only Assistant APIs', async () => {
  await withClient(async (client) => {
    const scenarios = [
      ['get_capabilities', {}],
      ['create_customer', { customer_name: 'TEST-UAT ABC', business_type: 'Workforce/Technical Services', idempotency_key: 'TEST-UAT-MCP-customer-create' }],
      ['search_customers', { query: 'TEST-UAT ABC' }],
      ['get_customer_context', { customer_id: ids.customer }],
      ['get_today_followups', {}],
      ['get_inventory', { product_id: ids.product }],
      ['get_price_history', { product_id: ids.product }],
      ['get_supplier_quotes', { supplier_id: ids.supplier }],
      ['get_project_context', { project_id: ids.project }],
      ['get_finance_context', { customer_id: ids.customer }],
      ['create_quotation_draft', { customer_id: ids.customer, items: [{ item_name: 'TEST-UAT service', qty: 1, selling_price: 100, supplier_cost: 50 }], reason: 'TEST-UAT create quotation', idempotency_key: 'TEST-UAT-MCP-quote-create' }],
      ['preview_quotation_draft_update', { target_id: ids.quotation, payload: { terms_notes: 'TEST-UAT update' }, reason: 'TEST-UAT preview quotation update' }],
      ['update_quotation_draft', { target_id: ids.quotation, payload: { terms_notes: 'TEST-UAT update' }, reason: 'TEST-UAT update quotation', confirmation_token: ids.preview, confirmed_by: 'Chris TEST-UAT', idempotency_key: 'TEST-UAT-MCP-quote-update' }],
      ['create_invoice_draft', { customer_id: ids.customer, items: [{ description: 'TEST-UAT service fee', qty: 1, unit_price: 10000 }], reason: 'TEST-UAT invoice draft', idempotency_key: 'TEST-UAT-MCP-invoice-create' }],
    ];
    for (const [name, args] of scenarios) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(status(result), name === 'create_customer' ? 201 : 200, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
    }
    const blocked = await client.callTool({ name: 'issue_invoice', arguments: { target_id: ids.invoice, reason: 'TEST-UAT must stay blocked', confirmation_token: ids.preview, confirmed_by: 'Chris TEST-UAT', idempotency_key: 'TEST-UAT-MCP-invoice-issue' } });
    assert.equal(status(blocked), 409);
    assert.equal(blocked.isError, true);
  });
  assert.ok(calls.length >= 14);
  assert.ok(calls.filter((call) => call.method === 'POST').every((call) => call.path.startsWith('/api/assistant/')));
  assert.ok(calls.filter((call) => call.method === 'POST' && call.path.endsWith('/execute')).every((call) => call.idempotencyKey));
});

test('MCP Action Center writes preview controlled actions and execute only after confirmation', async () => {
  await withClient(async (client) => {
    const controlled = [
      ['update_task_status', { target_id: ids.task, status: 'completed', reason: 'TEST-UAT task status' }],
      ['complete_commitment', { target_id: ids.commitment, completion_note: 'TEST-UAT complete', reason: 'TEST-UAT commitment' }],
      ['close_decision', { target_id: ids.decision, note: 'TEST-UAT close', reason: 'TEST-UAT decision close' }],
      ['mark_decision_duplicate', { target_id: ids.decision, duplicate_of_id: ids.canonicalDecision, reason: 'TEST-UAT duplicate' }],
      ['update_asset_review_status', { target_id: ids.asset, review_status: 'safe_candidate', reason: 'TEST-UAT asset review' }],
      ['update_asset_system_metadata', {
        target_id: ids.asset,
        supabase_project_name: 'gci-ai-sales-agent',
        supabase_project_ref: 'wpozpsquijuauluapulg',
        supabase_url: 'https://wpozpsquijuauluapulg.supabase.co',
        reason: 'TEST-UAT asset Supabase metadata',
      }],
      ['update_decision_execution_status', { target_id: ids.decision, execution_status: 'completed', reason: 'TEST-UAT decision execution' }],
    ];
    for (const [name, args] of controlled) {
      const preview = await client.callTool({ name, arguments: args });
      assert.equal(status(preview), 200, `${name} preview failed`);
      assert.equal(preview.structuredContent?.data?.confirmation_required, true);
      const executed = await client.callTool({
        name,
        arguments: { ...args, confirmation_token: ids.preview, confirmed_by: 'Chris TEST-UAT', idempotency_key: `TEST-UAT-${name}` },
      });
      assert.equal(status(executed), 200, `${name} confirmed execute failed`);
    }
    const due = await client.callTool({
      name: 'update_task_due_date',
      arguments: { target_id: ids.task, due_at: '2026-10-07T09:00:00+04:00', reason: 'TEST-UAT due date', idempotency_key: 'TEST-UAT-task-due-date' },
    });
    assert.equal(status(due), 200);
  });
  assert.ok(calls.some((call) => call.path.endsWith('/preview')));
  assert.ok(calls.some((call) => call.path.endsWith('/execute') && call.idempotencyKey));
});

test('MCP endpoint rejects missing bearer token before protocol handling', async () => {
  const response = await mcpHandler(new Request('https://app.globalcareinfo.com/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Host: 'app.globalcareinfo.com' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  }));
  assert.equal(response.status, 401);
});

test.after(() => { globalThis.fetch = originalFetch; });
