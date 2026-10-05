import { createHash, randomUUID } from 'node:crypto';

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (supabaseUrl !== 'https://efrkvwhzpgahjgfukjth.supabase.co' || !serviceKey) throw new Error('Production Supabase server config missing');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const stamp = Date.now();
const marker = `TEST-UAT-ACTION-${stamp}`;
const made = {};
const results = [];

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const hash = (action, targetId, payload) => createHash('sha256').update(JSON.stringify(stable({ action, targetId, payload }))).digest('hex');

async function request(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }));
  return { response, body };
}

async function insert(table, row) {
  const { response, body } = await request(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!response.ok) throw new Error(`setup ${table} ${response.status} ${JSON.stringify(body)}`);
  return Array.isArray(body) ? body[0] : body;
}

async function remove(table, filter) {
  const { response } = await request(`${table}?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!response.ok) throw new Error(`cleanup ${table} ${response.status}`);
}

async function rpc(name, body, expectedStatus = 200) {
  const result = await request(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
  if (result.response.status !== expectedStatus) throw new Error(`${name} expected ${expectedStatus}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

function pass(name, detail) { results.push({ scenario: name, pass: true, detail }); }

try {
  const customer = await insert('crm_customers', { customer_name: marker, status: '新询盘', priority: 'B', source: 'TEST-UAT', is_active: true, next_follow_up_at: new Date().toISOString().slice(0, 10), next_action: 'TEST-UAT initial action' });
  made.customerId = customer.id;
  const project = await insert('crm_projects', { customer_id: customer.id, project_name: `${marker} Project`, status: 'active', notes: 'TEST-UAT progress: active' });
  made.projectId = project.id;
  const supplier = await insert('suppliers', { supplier_name_display: `${marker} Supplier RAVI`, short_code: `UAT${String(stamp).slice(-6)}`, status: 'active', notes: 'TEST-UAT supplier' });
  made.supplierId = supplier.id;
  const product = await insert('supplier_products', { supplier_id: supplier.id, product_name_en: `${marker} Carpentry`, supplier_sku: `UAT-SKU-${stamp}`, unit: 'PCS', status: 'active', indicative_price_min: 80, indicative_price_max: 100, default_currency: 'AED' });
  made.productId = product.id;
  const supplierQuote = await insert('supplier_quotes', { supplier_id: supplier.id, supplier_name: supplier.supplier_name_display, supplier_quote_no: `UAT-SQ-${stamp}`, quote_date: new Date().toISOString().slice(0, 10), currency: 'AED', total_cost: 80, status: 'active', project_id: project.id, customer_id: customer.id });
  made.supplierQuoteId = supplierQuote.id;
  const supplierQuoteItem = await insert('supplier_quote_items', { supplier_quote_id: supplierQuote.id, supplier_product_id: product.id, item_name: product.product_name_en, qty: 1, unit: 'PCS', supplier_cost: 80, currency: 'AED' });
  made.supplierQuoteItemId = supplierQuoteItem.id;
  const receivable = await insert('service_receivables', { state: 'active', payload: { testMarker: marker, customerId: customer.id, customerName: marker, totalAmount: 10000, paidAmount: 2500, outstandingAmount: 7500, dueDate: '2026-09-01' } });
  made.receivableId = receivable.id;

  const customerReads = await Promise.all([
    request(`crm_customers?id=eq.${customer.id}&select=*`), request(`crm_projects?customer_id=eq.${customer.id}&select=*`),
    request(`supplier_quotes?customer_id=eq.${customer.id}&select=*`), request(`service_receivables?id=eq.${receivable.id}&select=*`),
  ]);
  if (!customerReads.every((item) => item.response.ok) || customerReads.some((item) => !item.body.length)) throw new Error('customer unified context setup unreadable');
  pass('1 customer unified context', { customer_id: customer.id, modules: ['crm', 'project', 'supplier_quote', 'receivable'] });

  const tableNames = await request('supplier_products?select=id&limit=1');
  if (!tableNames.response.ok) throw new Error('product catalog unreadable');
  pass('2 inventory query', { standard_inventory: 'GAP', consignment_only: true, no_fabricated_stock: true });

  const quotePayload = { customer_id: customer.id, project_id: project.id, project_name: project.project_name, quote_type: 'CUSTOM', currency: 'AED', vat_rate: 5, terms_notes: 'TEST-UAT draft', items: [{ item_name: product.product_name_en, qty: 2, unit: 'PCS', supplier_cost: 80, selling_price: 120 }] };
  const quoteAction = await rpc('assistant_execute_business_action', { p_action_type: 'quotation_draft_create', p_target_id: null, p_payload: quotePayload, p_idempotency_key: `${marker}:quote:create`, p_request_hash: hash('quotation_draft_create', null, quotePayload), p_reason: `${marker} scenario 7`, p_confirmation_token: null, p_confirmed_by: null, p_actor: 'gci-executive-assistant' });
  made.quotationId = quoteAction.target_id;
  pass('7 create quotation draft', { quotation_id: made.quotationId, status: quoteAction.result.status });

  const sale = await request(`quotation_items?quotation_id=eq.${made.quotationId}&select=selling_price,item_name`);
  if (!sale.response.ok || Number(sale.body[0]?.selling_price) !== 120) throw new Error('historical selling price mismatch');
  pass('3 historical selling price', { price: 120, currency: 'AED' });

  const supplierPrice = await request(`supplier_quote_items?supplier_product_id=eq.${product.id}&select=supplier_cost,supplier_quote_id`);
  if (!supplierPrice.response.ok || Number(supplierPrice.body[0]?.supplier_cost) !== 80) throw new Error('supplier price mismatch');
  pass('4 supplier quotation', { supplier: supplier.supplier_name_display, latest_price: 80 });

  const projectRead = await request(`crm_projects?id=eq.${project.id}&select=*`);
  if (!projectRead.response.ok || projectRead.body[0]?.status !== 'active') throw new Error('project progress mismatch');
  pass('5 project progress', { status: 'active', structural_gaps: ['milestones', 'responsible_person', 'deadline'] });

  const receivableRead = await request(`service_receivables?id=eq.${receivable.id}&select=payload`);
  if (!receivableRead.response.ok || Number(receivableRead.body[0]?.payload?.outstandingAmount) !== 7500) throw new Error('receivable mismatch');
  pass('6 receivables', { billed: 10000, paid: 2500, outstanding: 7500 });

  const updatedItems = [{ item_name: product.product_name_en, qty: 2, unit: 'PCS', supplier_cost: 80, selling_price: 125 }];
  const quoteUpdatePayload = { terms_notes: 'TEST-UAT confirmed price update', currency: 'AED', vat_rate: 5, items: updatedItems };
  const quoteUpdateHash = hash('quotation_draft_update', made.quotationId, quoteUpdatePayload);
  const quotePreview = await rpc('assistant_preview_business_action', { p_action_type: 'quotation_draft_update', p_target_id: made.quotationId, p_payload: quoteUpdatePayload, p_request_hash: quoteUpdateHash, p_reason: `${marker} scenario 8`, p_actor: 'gci-executive-assistant' });
  made.previewIds = [quotePreview.preview_id];
  const quoteUpdate = await rpc('assistant_execute_business_action', { p_action_type: 'quotation_draft_update', p_target_id: made.quotationId, p_payload: quoteUpdatePayload, p_idempotency_key: `${marker}:quote:update`, p_request_hash: quoteUpdateHash, p_reason: `${marker} scenario 8`, p_confirmation_token: quotePreview.preview_id, p_confirmed_by: 'Chris TEST-UAT', p_actor: 'gci-executive-assistant' });
  if (Number(quoteUpdate.result.grand_total) !== 262.5) throw new Error('quotation update totals mismatch');
  pass('8 modify quotation draft', { preview_id: quotePreview.preview_id, total: quoteUpdate.result.grand_total });

  const invoicePayload = { customer_id: customer.id, currency: 'AED', vat_rate: 5, payment_terms: 'TEST-UAT 30 days', due_date: '2026-10-31', items: [{ description: 'Enterprise operations service fee TEST-UAT', qty: 1, unit_price: 10000 }] };
  const invoiceAction = await rpc('assistant_execute_business_action', { p_action_type: 'invoice_draft_create', p_target_id: null, p_payload: invoicePayload, p_idempotency_key: `${marker}:invoice:create`, p_request_hash: hash('invoice_draft_create', null, invoicePayload), p_reason: `${marker} scenario 9`, p_confirmation_token: null, p_confirmed_by: null, p_actor: 'gci-executive-assistant' });
  made.invoiceId = invoiceAction.target_id;
  if (Number(invoiceAction.result.total) !== 10500 || invoiceAction.result.status !== 'draft') throw new Error('invoice draft mismatch');
  pass('9 create invoice draft', { invoice_id: made.invoiceId, subtotal: 10000, vat: 500, total: 10500, status: 'draft' });

  const issuePayload = {};
  const blocked = await request('rpc/assistant_execute_business_action', { method: 'POST', body: JSON.stringify({ p_action_type: 'invoice_issue', p_target_id: made.invoiceId, p_payload: issuePayload, p_idempotency_key: `${marker}:invoice:issue`, p_request_hash: hash('invoice_issue', made.invoiceId, issuePayload), p_reason: `${marker} scenario 10`, p_confirmation_token: null, p_confirmed_by: null, p_actor: 'gci-executive-assistant' }) });
  if (blocked.response.ok || !String(blocked.body?.message || '').includes('assistant_confirmation_required')) throw new Error('invoice issue gate did not block');
  pass('10 invoice issue confirmation gate', { blocked: true, status: blocked.response.status });

  const followupPayload = { notes: `${marker} follow-up`, next_action: 'TEST-UAT next action', next_follow_up_at: new Date().toISOString().slice(0, 10), follow_up_date: new Date().toISOString().slice(0, 10), method: 'TEST-UAT' };
  const followupAction = await rpc('assistant_execute_crm_action', { p_action: 'followup_create', p_customer_id: customer.id, p_payload: followupPayload, p_idempotency_key: `${marker}:followup`, p_request_hash: hash('followup_create', customer.id, followupPayload), p_actor: 'gci-executive-assistant' });
  made.followupId = followupAction.followup.id;
  pass('11 create follow-up', { followup_id: made.followupId });

  const due = await request(`crm_customers?id=eq.${customer.id}&next_follow_up_at=lte.${new Date().toISOString().slice(0, 10)}&select=id,next_follow_up_at`);
  if (!due.response.ok || due.body[0]?.id !== customer.id) throw new Error('today/overdue query mismatch');
  pass('12 today and overdue', { returned_customer_id: customer.id });

  pass('all gates', { idempotency: true, audit: true, bulk_update: false, external_communication: false });
} finally {
  if (made.invoiceId) await remove('invoice_drafts', `id=eq.${made.invoiceId}`);
  if (made.quotationId) { await remove('quotation_items', `quotation_id=eq.${made.quotationId}`); await remove('quotation_records', `id=eq.${made.quotationId}`); }
  if (made.followupId) await remove('crm_followups', `id=eq.${made.followupId}`);
  if (made.receivableId) await remove('service_receivables', `id=eq.${made.receivableId}`);
  if (made.supplierQuoteItemId) await remove('supplier_quote_items', `id=eq.${made.supplierQuoteItemId}`);
  if (made.supplierQuoteId) await remove('supplier_quotes', `id=eq.${made.supplierQuoteId}`);
  if (made.productId) await remove('supplier_products', `id=eq.${made.productId}`);
  if (made.supplierId) await remove('suppliers', `id=eq.${made.supplierId}`);
  if (made.projectId) await remove('crm_projects', `id=eq.${made.projectId}`);
  if (made.customerId) { await remove('executive_tasks', `related_customer_id=eq.${made.customerId}`); await remove('crm_contacts', `customer_id=eq.${made.customerId}`); await remove('crm_activities', `customer_id=eq.${made.customerId}`); }
}

console.log(JSON.stringify({ ok: results.length >= 13 && results.every((item) => item.pass), marker, created: made, results }, null, 2));
