// GIA P0 — read-only tool registry (pure metadata + permission policy).
//
// Every tool wraps ONE existing, verified read-only endpoint. The dispatch
// (api/gia/dispatch.ts) calls that endpoint's own handler in-process with
// the caller's own Authorization header, so the endpoint's requireModule
// check and data access run exactly as they do for the UI today.
//
// Permission policy (canUseTool): the caller needs one of `giaModules` when a
// tool sets it, otherwise one of `modules` (the wrapped endpoint's own
// requireModule list, so identical to the endpoint). Like requireModule
// (api/_lib/auth.ts) there is no Admin bypass: access comes only from
// user_profiles.modules; role labels (Admin / Editor / …) grant no module.
//
// Deliberate exception (approved by Chris, 2026-11-16): receivables_summary,
// sales_summary, invoice_pending_summary and daily_brief return finance data
// (receivables / revenue / invoice amounts), so via GIA they require the
// `finance` module — stricter than their endpoints (trade|finance|crm,
// finance|trade). The endpoints themselves are unchanged. Owner and LILI both
// hold `finance` in user_profiles.modules, so neither loses access.
// The other 9 tools stay identical to their endpoints. `sensitive` is a
// label only.
//
// No imports: this file must stay free of handlers, env and network so it
// can be unit-tested in isolation.

export type GiaArgSpec = { name: string; required: boolean };

export interface GiaToolAuthView {
  modules: string[];
}

export interface GiaTool {
  id: string;
  description: string;
  /** Existing endpoint this tool wraps (path only). */
  endpoint: string;
  method: 'GET' | 'POST';
  /** The endpoint's own requireModule list (caller needs one of them). */
  modules: string[];
  /** GIA-only stricter requirement; when set it replaces `modules` for dispatch. */
  giaModules?: string[];
  /** Label only, NOT enforced: returns finance / sales / receivables / cost / margin data. */
  sensitive: boolean;
  /** Why it is sensitive (fields it returns). */
  sensitiveReason?: string;
  args: GiaArgSpec[];
}

export const GIA_TOOLS: readonly GiaTool[] = [
  {
    id: 'resolve_product',
    description: 'Map a natural-language product phrase to catalog product names.',
    endpoint: '/api/ai/resolve-product', method: 'GET',
    modules: ['trade', 'quotation', 'crm'], sensitive: false,
    args: [{ name: 'q', required: true }],
  },
  {
    id: 'check_inventory',
    description: 'Consignment stock remaining per product (optional product filter).',
    endpoint: '/api/trade/check-inventory', method: 'GET',
    modules: ['trade', 'warehouse'], sensitive: false,
    args: [{ name: 'product', required: false }],
  },
  {
    id: 'inventory_table_alerts',
    description: 'Warehouse inventory table with low-stock alerts (optional product filter).',
    endpoint: '/api/ai/inventory-table-alerts', method: 'GET',
    modules: ['trade', 'warehouse'], sensitive: false,
    args: [{ name: 'product', required: false }],
  },
  {
    id: 'product_overview',
    description: 'Product master price, cost, stock and historical quote prices for one product.',
    endpoint: '/api/ai/product-overview', method: 'GET',
    modules: ['trade', 'quotation', 'crm'], sensitive: true,
    sensitiveReason: 'returns internal cost price (costPriceAED) and historical selling prices',
    args: [{ name: 'product', required: true }],
  },
  {
    id: 'quotation_history',
    description: 'Past quotations by customer and/or product.',
    endpoint: '/api/ai/quotation-history', method: 'GET',
    modules: ['quotation', 'crm', 'trade'], sensitive: true,
    sensitiveReason: 'returns quote totals and margin_percent',
    args: [{ name: 'customer', required: false }, { name: 'product', required: false }],
  },
  {
    id: 'check_quotation_followups',
    description: 'Quotations waiting for a customer reply.',
    endpoint: '/api/trade/check-quotation-followups', method: 'GET',
    modules: ['trade', 'quotation', 'crm'], sensitive: true,
    sensitiveReason: 'returns grand_total and margin_percent',
    args: [],
  },
  {
    id: 'customer_360',
    description: 'One customer: quotes, orders, payments and outstanding amount.',
    endpoint: '/api/ai/customer-360', method: 'GET',
    modules: ['crm', 'trade', 'quotation'], sensitive: true,
    sensitiveReason: 'returns order totals, paid and outstanding amounts',
    args: [{ name: 'customer', required: true }],
  },
  {
    id: 'consignment_summary',
    description: 'Consignment batches and settlement value by customer/product.',
    endpoint: '/api/ai/consignment-summary', method: 'GET',
    modules: ['trade', 'warehouse'], sensitive: true,
    sensitiveReason: 'returns per-customer unit prices and settlement amounts',
    args: [{ name: 'customer', required: false }, { name: 'product', required: false }],
  },
  {
    id: 'receivables_summary',
    description: 'Unpaid / outstanding receivables.',
    endpoint: '/api/ai/receivables-summary', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'receivables / outstanding amounts',
    args: [],
  },
  {
    id: 'sales_summary',
    description: 'Sales totals by period and/or customer.',
    endpoint: '/api/ai/sales-summary', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'sales revenue',
    args: [{ name: 'customer', required: false }, { name: 'period', required: false }],
  },
  {
    id: 'invoice_pending_summary',
    description: 'Invoice drafts not yet issued / paid.',
    endpoint: '/api/invoice/pending-summary', method: 'GET',
    modules: ['finance', 'trade'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'invoice amounts',
    args: [],
  },
  {
    id: 'supplier_search',
    description: 'Search the supplier library (name, category, product, service).',
    endpoint: '/api/suppliers/search', method: 'POST',
    modules: ['trade', 'quotation', 'crm'], sensitive: true,
    sensitiveReason: 'returns latest supplier quote total_cost (purchase cost)',
    args: [{ name: 'query', required: true }],
  },
  {
    id: 'daily_brief',
    description: 'Daily business brief (sales, receivables, follow-ups).',
    endpoint: '/api/ai/daily-brief', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'aggregates sales and receivables',
    args: [],
  },
  // GIA P3 step 1 (2026-11-17). The two service_* tools wrap existing
  // endpoints unchanged; the three trade_* tools wrap new read-only endpoints
  // under api/trade/ (same requireModule list and table access as
  // /api/ai/sales-summary). Amount-bearing tools follow the finance rule above.
  {
    id: 'pi_lookup',
    description: 'Trade PI (proforma invoices): by customer and/or PI number; amounts, status, converted order, line items when ≤3 match.',
    endpoint: '/api/trade/pi-lookup', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'PI amounts',
    args: [{ name: 'customer', required: false }, { name: 'pi', required: false }],
  },
  {
    id: 'order_lookup',
    description: 'Trade sales orders (SO): by customer, order number and/or status (PENDING|PARTIAL|PAID|CONSIGNMENT|VOIDED|UNPAID); total, paid, outstanding per order, line items when ≤3 match.',
    endpoint: '/api/trade/order-lookup', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'order amounts, paid and outstanding',
    args: [{ name: 'customer', required: false }, { name: 'order', required: false }, { name: 'status', required: false }],
  },
  {
    id: 'payment_list',
    description: 'Customer payments received on Trade orders: by customer, order number and/or period (today|week|month|YYYY-MM|all).',
    endpoint: '/api/trade/payment-list', method: 'GET',
    modules: ['trade', 'finance', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'payment amounts',
    args: [{ name: 'customer', required: false }, { name: 'order', required: false }, { name: 'period', required: false }],
  },
  {
    id: 'service_receivables_summary',
    description: 'Company Services (enterprise services) receivables: outstanding, overdue, due soon.',
    endpoint: '/api/bs/receivables-brief-summary', method: 'GET',
    modules: ['quotation', 'crm'], sensitive: true, giaModules: ['finance'],
    sensitiveReason: 'receivable amounts',
    args: [],
  },
  {
    id: 'service_contract_status',
    description: 'Company Services contract / quote status: revision requested, expired, contract pending.',
    endpoint: '/api/bs/contract-status-brief-summary', method: 'GET',
    modules: ['quotation', 'crm'], sensitive: false,
    args: [],
  },
];

export function findTool(id: unknown): GiaTool | null {
  if (typeof id !== 'string') return null;
  return GIA_TOOLS.find((t) => t.id === id) ?? null;
}

// The endpoint's own requireModule rule, or the GIA finance exception above.
export function canUseTool(auth: GiaToolAuthView, tool: GiaTool): boolean {
  return (tool.giaModules ?? tool.modules).some((m) => auth.modules.includes(m));
}

export function listToolsFor(auth: GiaToolAuthView) {
  return GIA_TOOLS.filter((t) => canUseTool(auth, t)).map((t) => ({
    id: t.id,
    description: t.description,
    sensitive: t.sensitive,
    args: t.args,
  }));
}

const MAX_ARG_LEN = 200;

export type ArgCheck =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string };

export function validateArgs(tool: GiaTool, raw: unknown): ArgCheck {
  const input = raw === undefined || raw === null ? {} : raw;
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'args must be an object' };
  const known = new Set(tool.args.map((a) => a.name));
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(key)) return { ok: false, error: `unknown arg: ${key}` };
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') return { ok: false, error: `arg ${key} must be a string` };
    const v = value.trim();
    if (v.length > MAX_ARG_LEN) return { ok: false, error: `arg ${key} too long` };
    if (v) values[key] = v;
  }
  for (const a of tool.args) {
    if (a.required && !values[a.name]) return { ok: false, error: `missing arg: ${a.name}` };
  }
  return { ok: true, values };
}

/** The Request handed to the wrapped endpoint (same origin, caller's own token only). */
export function buildUpstreamRequest(tool: GiaTool, values: Record<string, string>, baseUrl: string, authorization: string): Request {
  const url = new URL(tool.endpoint, baseUrl);
  const headers: Record<string, string> = { authorization };
  if (tool.method === 'GET') {
    for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
    return new Request(url.toString(), { method: 'GET', headers });
  }
  headers['content-type'] = 'application/json';
  return new Request(url.toString(), { method: 'POST', headers, body: JSON.stringify(values) });
}
