import { type AssistantContext, json, restGet } from './_lib';

type ReadResult<T> = { ok: true; data: T } | { ok: false; response: Response };

const cleanSearch = (value: string) => value.replace(/[%*,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
const params = (values: Record<string, string>) => new URLSearchParams(values).toString();

async function rows(ctx: AssistantContext, table: string, query: Record<string, string>): Promise<ReadResult<any[]>> {
  return restGet<any[]>(ctx, `${table}?${params(query)}`);
}

function failed(results: ReadResult<any[]>[]): Response | null {
  return results.find((result) => !result.ok)?.response || null;
}

function data(result: ReadResult<any[]>): any[] {
  return result.ok ? result.data : [];
}

function payloadMatches(row: any, ids: string[], names: string[]): boolean {
  const raw = JSON.stringify(row?.payload || {}).toLowerCase();
  return ids.some((id) => raw.includes(id.toLowerCase())) || names.some((name) => name && raw.includes(name.toLowerCase()));
}

export async function customerContext(ctx: AssistantContext, customerId: string): Promise<Response> {
  const customer = await rows(ctx, 'crm_customers', { select: '*', id: `eq.${customerId}`, limit: '1' });
  if (!customer.ok) return customer.response;
  const profile = customer.data[0];
  if (!profile) return json({ ok: false, error: 'customer_not_found' }, 404);
  const customerName = String(profile.customer_name || '');

  const result = await Promise.all([
    rows(ctx, 'crm_contacts', { select: '*', customer_id: `eq.${customerId}`, order: 'is_primary.desc,created_at.asc' }),
    rows(ctx, 'crm_followups', { select: '*', customer_id: `eq.${customerId}`, order: 'follow_up_date.desc,created_at.desc', limit: '50' }),
    rows(ctx, 'crm_activities', { select: '*', customer_id: `eq.${customerId}`, order: 'activity_at.desc', limit: '50' }),
    rows(ctx, 'crm_projects', { select: '*', customer_id: `eq.${customerId}`, order: 'updated_at.desc', limit: '100' }),
    rows(ctx, 'quotation_records', { select: '*', customer_id: `eq.${customerId}`, order: 'updated_at.desc', limit: '100' }),
    rows(ctx, 'invoice_drafts', { select: '*', customer_name: `eq.${customerName}`, order: 'created_at.desc', limit: '100' }),
    rows(ctx, 'executive_tasks', { select: '*', related_customer_id: `eq.${customerId}`, order: 'created_at.desc', limit: '100' }),
    rows(ctx, 'service_customers', { select: '*', customer_name: `eq.${customerName}`, order: 'updated_at.desc', limit: '20' }),
    rows(ctx, 'service_receivables', { select: 'id,state,payload,created_at,updated_at', order: 'created_at.desc', limit: '500' }),
    rows(ctx, 'service_payments', { select: 'id,state,payload,created_at,updated_at', order: 'created_at.desc', limit: '500' }),
    rows(ctx, 'payments', { select: 'id,state,payload,created_at,updated_at', order: 'created_at.desc', limit: '500' }),
  ]);
  const error = failed(result);
  if (error) return error;
  const [contacts, followups, activities, projects, quotations, invoices, tasks, services, serviceReceivables, servicePayments, tradePayments] = result.map(data);
  const serviceIds = services.map((service) => service.id).filter(Boolean);
  let serviceQuotes: any[] = [];
  let serviceDocuments: any[] = [];
  if (serviceIds.length) {
    const [quoteResult, documentResult] = await Promise.all([
      rows(ctx, 'service_quotes', { select: '*', customer_id: `in.(${serviceIds.join(',')})`, order: 'updated_at.desc', limit: '200' }),
      rows(ctx, 'service_customer_documents', { select: 'id,customer_id,document_name,document_type,issue_date,expiry_date,status,notes,created_at,updated_at', customer_id: `in.(${serviceIds.join(',')})`, order: 'updated_at.desc', limit: '200' }),
    ]);
    const serviceError = failed([quoteResult, documentResult]);
    if (serviceError) return serviceError;
    serviceQuotes = data(quoteResult);
    serviceDocuments = data(documentResult);
  }
  const projectIds = projects.map((p) => p.id);
  const names = [customerName];
  const ids = [customerId, ...projectIds];
  const matchedServiceReceivables = serviceReceivables.filter((row) => payloadMatches(row, ids, names));
  const matchedServicePayments = servicePayments.filter((row) => payloadMatches(row, ids, names));
  const matchedTradePayments = tradePayments.filter((row) => payloadMatches(row, ids, names));

  const openTasks = tasks.filter((task) => !['completed', 'cancelled'].includes(String(task.status || '')));
  const overdueTasks = openTasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now());
  const risks = [
    ...(profile.next_follow_up_at && String(profile.next_follow_up_at) < new Date().toISOString().slice(0, 10) ? ['follow_up_overdue'] : []),
    ...(overdueTasks.length ? ['task_overdue'] : []),
    ...(invoices.some((invoice) => invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10) && !['paid', 'cancelled'].includes(invoice.status)) ? ['invoice_overdue'] : []),
  ];
  return json({
    ok: true,
    context_type: 'customer',
    customer: profile,
    contacts,
    followups,
    activities,
    projects,
    quotations,
    invoices,
    payments: { service: matchedServicePayments, trade_legacy: matchedTradePayments },
    receivables: { service: matchedServiceReceivables },
    enterprise_services: services,
    service_quotations: serviceQuotes,
    documents: serviceDocuments,
    tasks,
    next_action: profile.next_action,
    risks,
    recent_activity: [...activities, ...followups].sort((a, b) => String(b.activity_at || b.created_at).localeCompare(String(a.activity_at || a.created_at))).slice(0, 20),
    gaps: ['invoice_drafts has no customer_id FK; invoice matching uses the exact CRM customer_name snapshot', 'no unified customer balance ledger across trade and enterprise-service JSONB ledgers'],
  });
}

export async function businessOverview(ctx: AssistantContext): Promise<Response> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const result = await Promise.all([
    rows(ctx, 'crm_customers', { select: 'id,status,priority,next_follow_up_at,is_active,updated_at', is_active: 'eq.true', limit: '5000' }),
    rows(ctx, 'quotation_records', { select: 'id,status,grand_total,profit_total,created_at,updated_at', order: 'updated_at.desc', limit: '2000' }),
    rows(ctx, 'invoice_drafts', { select: 'id,status,total,due_date,currency,created_at,updated_at', order: 'updated_at.desc', limit: '2000' }),
    rows(ctx, 'crm_projects', { select: 'id,status,updated_at', order: 'updated_at.desc', limit: '2000' }),
    rows(ctx, 'supplier_payables', { select: 'id,status,amount,paid_amount,outstanding_amount,due_date,created_at,updated_at', order: 'updated_at.desc', limit: '2000' }),
    rows(ctx, 'executive_tasks', { select: 'id,status,priority,due_at,updated_at', status: 'in.(open,in_progress)', limit: '2000' }),
    rows(ctx, 'finance_vouchers', { select: 'id,status,ai_amount,ai_date,created_at', order: 'created_at.desc', limit: '1000' }),
  ]);
  const error = failed(result);
  if (error) return error;
  const [customers, quotations, invoices, projects, payables, tasks, vouchers] = result.map(data);
  const sum = (items: any[], field: string) => items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const openInvoices = invoices.filter((row) => !['paid', 'cancelled'].includes(String(row.status || '')));
  const openPayables = payables.filter((row) => !['paid', 'cancelled'].includes(String(row.status || '')));
  return json({
    ok: true,
    as_of: new Date().toISOString(),
    crm: {
      active_customers: customers.length,
      overdue_followups: customers.filter((row) => row.next_follow_up_at && row.next_follow_up_at < today).length,
      high_priority: customers.filter((row) => row.priority === 'A').length,
    },
    quotations: { total: quotations.length, draft: quotations.filter((row) => row.status === 'DRAFT').length, value: sum(quotations, 'grand_total'), profit: sum(quotations, 'profit_total'), recent: quotations.slice(0, 20) },
    invoices: { total: invoices.length, open: openInvoices.length, open_value: sum(openInvoices, 'total'), overdue: openInvoices.filter((row) => row.due_date && row.due_date < today).length, recent: invoices.slice(0, 20) },
    projects: { total: projects.length, active: projects.filter((row) => row.status === 'active').length, on_hold: projects.filter((row) => row.status === 'on_hold').length },
    procurement: { supplier_payables_open: openPayables.length, supplier_payables_outstanding: sum(openPayables, 'outstanding_amount'), purchase_orders: null, gap: 'No purchase_orders table exists.' },
    management: { open_tasks: tasks.length, overdue_tasks: tasks.filter((row) => row.due_at && new Date(row.due_at).getTime() < Date.now()).length, pending_finance_vouchers: vouchers.filter((row) => row.status === 'pending').length },
    risks: ['Invoice open_value is draft/issued invoice total, not a reconciled AR balance.', 'Legacy trade and enterprise-service ledgers remain separate.', 'No standard inventory or purchase-order ledger.'],
  });
}

export async function projectContext(ctx: AssistantContext, projectId: string): Promise<Response> {
  const project = await rows(ctx, 'crm_projects', { select: '*', id: `eq.${projectId}`, limit: '1' });
  if (!project.ok) return project.response;
  const item = project.data[0];
  if (!item) return json({ ok: false, error: 'project_not_found' }, 404);
  const result = await Promise.all([
    rows(ctx, 'crm_customers', { select: '*', id: `eq.${item.customer_id}`, limit: '1' }),
    rows(ctx, 'quotation_records', { select: '*', project_id: `eq.${projectId}`, order: 'updated_at.desc', limit: '100' }),
    rows(ctx, 'supplier_quotes', { select: '*', project_id: `eq.${projectId}`, order: 'updated_at.desc', limit: '100' }),
    rows(ctx, 'finance_vouchers', { select: 'id,status,ai_date,ai_amount,ai_description,ai_counterparty,ai_suggested_category,created_at', ai_suggested_project_id: `eq.${projectId}`, order: 'created_at.desc', limit: '100' }),
  ]);
  const error = failed(result);
  if (error) return error;
  return json({
    ok: true,
    context_type: 'project',
    project: item,
    customer: data(result[0])[0] || null,
    quotations: data(result[1]),
    supplier_quotations: data(result[2]),
    finance_vouchers: data(result[3]),
    gaps: ['crm_projects has no milestone, responsible_person, deadline, issue, supplier_id, or document relationship fields', 'executive_tasks has no project_id'],
  });
}

export async function supplierContext(ctx: AssistantContext, supplierId: string): Promise<Response> {
  const supplier = await rows(ctx, 'suppliers', { select: '*', id: `eq.${supplierId}`, limit: '1' });
  if (!supplier.ok) return supplier.response;
  const item = supplier.data[0];
  if (!item) return json({ ok: false, error: 'supplier_not_found' }, 404);
  const result = await Promise.all([
    rows(ctx, 'supplier_contacts', { select: '*', supplier_id: `eq.${supplierId}`, order: 'is_primary.desc,created_at.asc' }),
    rows(ctx, 'supplier_products', { select: '*', supplier_id: `eq.${supplierId}`, order: 'updated_at.desc', limit: '500' }),
    rows(ctx, 'supplier_quotes', { select: '*', supplier_id: `eq.${supplierId}`, order: 'updated_at.desc', limit: '200' }),
    rows(ctx, 'supplier_documents', { select: 'id,document_name,document_type,issue_date,expire_date,verification_status,is_primary,created_at,updated_at', supplier_id: `eq.${supplierId}`, order: 'updated_at.desc', limit: '200' }),
    rows(ctx, 'supplier_payables', { select: '*', supplier_id: `eq.${supplierId}`, order: 'created_at.desc', limit: '200' }),
    rows(ctx, 'supplier_payments', { select: '*', supplier_id: `eq.${supplierId}`, order: 'payment_date.desc', limit: '200' }),
  ]);
  const error = failed(result);
  if (error) return error;
  const quotes = data(result[2]);
  const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
  let quoteItems: any[] = [];
  if (quoteIds.length) {
    const got = await rows(ctx, 'supplier_quote_items', { select: '*', supplier_quote_id: `in.(${quoteIds.join(',')})`, order: 'created_at.desc', limit: '1000' });
    if (!got.ok) return got.response;
    quoteItems = got.data;
  }
  return json({
    ok: true,
    context_type: 'supplier',
    supplier: item,
    contacts: data(result[0]),
    products: data(result[1]),
    quotations: quotes,
    quotation_items: quoteItems,
    documents: data(result[3]),
    payables: data(result[4]),
    payments: data(result[5]),
    gaps: ['no purchase_orders table', 'no procurement delivery-status workflow', 'supplier products contain indicative prices, not a governed latest-purchase-cost ledger'],
  });
}

export async function searchProducts(ctx: AssistantContext, rawQuery: string): Promise<Response> {
  const query = cleanSearch(rawQuery);
  if (!query || query.length > 100) return json({ ok: false, error: 'q_required_max_100' }, 400);
  const like = `*${query}*`;
  const products = await rows(ctx, 'supplier_products', {
    select: 'id,supplier_id,supplier_sku,product_name_cn,product_name_en,model,specification,category,unit,indicative_price_min,indicative_price_max,default_currency,status,updated_at',
    or: `(supplier_sku.ilike.${like},product_name_cn.ilike.${like},product_name_en.ilike.${like},model.ilike.${like},specification.ilike.${like})`,
    order: 'updated_at.desc',
    limit: '50',
  });
  if (!products.ok) return products.response;
  return json({ ok: true, query, products: products.data, source: 'supplier_products', gap: 'No standard Product Master table exists in GCI APP Production.' });
}

export async function productContext(ctx: AssistantContext, productId: string): Promise<Response> {
  const product = await rows(ctx, 'supplier_products', { select: '*', id: `eq.${productId}`, limit: '1' });
  if (!product.ok) return product.response;
  const item = product.data[0];
  if (!item) return json({ ok: false, error: 'product_not_found' }, 404);
  const names = [item.product_name_en, item.product_name_cn, item.supplier_sku, item.model].filter(Boolean).map(String);
  const searchName = cleanSearch(names[0] || '');
  const result = await Promise.all([
    rows(ctx, 'suppliers', { select: 'id,supplier_name_display,name_cn,name_en,country,city,status,is_preferred,current_rating,payment_terms,default_lead_time_days', id: `eq.${item.supplier_id}`, limit: '1' }),
    rows(ctx, 'supplier_quote_items', { select: '*', supplier_product_id: `eq.${productId}`, order: 'created_at.desc', limit: '100' }),
    searchName ? rows(ctx, 'quotation_items', { select: '*', or: `(item_name.ilike.*${searchName}*,description.ilike.*${searchName}*)`, order: 'created_at.desc', limit: '100' }) : Promise.resolve({ ok: true as const, data: [] }),
    rows(ctx, 'consignment_stock', { select: 'id,state,payload,created_at,updated_at', state: 'eq.active', order: 'created_at.desc', limit: '500' }),
  ]);
  const error = failed(result);
  if (error) return error;
  const supplierQuoteItems = data(result[1]);
  const sales = data(result[2]);
  const consignment = data(result[3]).filter((row) => names.some((name) => JSON.stringify(row.payload || {}).toLowerCase().includes(name.toLowerCase())));
  return json({
    ok: true,
    context_type: 'product',
    product: item,
    supplier: data(result[0])[0] || null,
    latest_supplier_prices: supplierQuoteItems,
    historical_selling_prices: sales,
    consignment_batches: consignment,
    inventory: {
      standard_inventory_available: false,
      total_stock: null,
      reserved_quantity: null,
      available_quantity: null,
      warehouse: null,
      latest_movement: null,
    },
    gaps: ['supplier_products is a supplier catalog, not a standard Product Master', 'consignment_stock is batch-specific JSONB and must not be represented as total stock', 'no reserved/available/warehouse movement ledger', 'no governed latest purchase cost'],
  });
}

export async function managementToday(ctx: AssistantContext): Promise<Response> {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const result = await Promise.all([
    rows(ctx, 'executive_tasks', { select: '*', status: 'in.(open,in_progress)', order: 'due_at.asc.nullslast,priority.asc', limit: '500' }),
    rows(ctx, 'executive_commitments', { select: '*', order: 'created_at.desc', limit: '200' }),
    rows(ctx, 'executive_decisions', { select: '*', order: 'created_at.desc', limit: '200' }),
    rows(ctx, 'finance_vouchers', { select: 'id,status,ai_date,ai_amount,ai_counterparty,ai_description,created_at', status: 'eq.pending', order: 'created_at.asc', limit: '200' }),
  ]);
  const error = failed(result);
  if (error) return error;
  const tasks = data(result[0]);
  return json({
    ok: true,
    date: today,
    tasks: {
      today: tasks.filter((task) => String(task.due_at || '').slice(0, 10) === today),
      overdue: tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < now.getTime() && String(task.due_at).slice(0, 10) !== today),
      unscheduled: tasks.filter((task) => !task.due_at),
    },
    commitments: data(result[1]),
    decisions: data(result[2]),
    pending_finance_vouchers: data(result[3]),
  });
}
