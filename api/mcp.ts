import {
  McpServer,
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { CLAUDE_MCP_ACTION_CENTER_ACTIONS, authenticateMcpSecret } from './assistant/_lib.js';

export const config = { runtime: 'edge' };

const SERVER_NAME = 'gci-executive-assistant-mcp-server';
const SERVER_VERSION = '1.1.0';
const ASSISTANT_BASE_URL = 'https://app.globalcareinfo.com';
const CHARACTER_LIMIT = 25_000;
const ALLOWED_HOSTS = ['app.globalcareinfo.com'];
const ALLOWED_ORIGINS = ['app.globalcareinfo.com', 'claude.ai', 'www.claude.ai', 'claude.com', 'www.claude.com'];

type JsonObject = Record<string, unknown>;
type ToolInput = Record<string, unknown>;
type AssistantResponse = { status: number; data: unknown };

const ToolOutputSchema = z.object({
  status: z.number().int().describe('HTTP status returned by the existing Assistant Action Layer.'),
  data: z.unknown().describe('Structured response from the existing Assistant Action Layer.'),
}).strict();

const uuid = (label: string) => z.string().uuid().describe(`${label} UUID from GCI APP.`);
const reason = z.string().trim().min(1).max(1000).describe('Business reason recorded by the existing audit layer.');
const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/).optional()
  .describe('Stable retry key. Reuse the same value only for the exact same write request. Generated when omitted.');
const confirmationToken = uuid('Preview confirmation token');
const confirmedBy = z.string().trim().min(1).max(200).describe('Human confirmer, normally Chris.');

const readAnnotations: ToolAnnotations = {
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
};
const writeAnnotations: ToolAnnotations = {
  readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
};

function assistantUrl(path: string): string {
  return `${ASSISTANT_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function generatedIdempotencyKey(tool: string): string {
  return `mcp:${tool}:${crypto.randomUUID()}`;
}

async function callAssistant(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: JsonObject; idempotencyKey?: string } = {},
): Promise<AssistantResponse> {
  const actionType = typeof options.body?.action_type === 'string' ? options.body.action_type : '';
  const useClaudeActionCredential = CLAUDE_MCP_ACTION_CENTER_ACTIONS.has(actionType);
  const secret = useClaudeActionCredential
    ? process.env.GCI_CLAUDE_MCP_SECRET || ''
    : process.env.GCI_ASSISTANT_API_SECRET || '';
  if (!secret) return { status: 500, data: { ok: false, error: 'assistant_secret_not_configured' } };
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${secret}`,
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await fetch(assistantUrl(path), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'assistant_response_invalid' }));
    return { status: response.status, data };
  } catch {
    return { status: 502, data: { ok: false, error: 'assistant_action_layer_unreachable' } };
  }
}

function projected(response: AssistantResponse, fields: string[]): AssistantResponse {
  if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) return response;
  const source = response.data as JsonObject;
  const data: JsonObject = { ok: source.ok };
  for (const field of fields) if (field in source) data[field] = source[field];
  return { status: response.status, data };
}

function toolResult(response: AssistantResponse) {
  const output = { status: response.status, data: response.data };
  const serialized = JSON.stringify(output);
  const text = serialized.length <= CHARACTER_LIMIT
    ? serialized
    : JSON.stringify({ status: response.status, truncated: true, message: 'Structured response exceeded 25,000 characters. Narrow the search or use a specific record ID.' });
  return {
    isError: response.status < 200 || response.status >= 300,
    content: [{ type: 'text' as const, text }],
    structuredContent: output,
  };
}

function localError(status: number, error: string, detail: string) {
  return toolResult({ status, data: { ok: false, error, detail } });
}

function stringValue(input: ToolInput, key: string): string {
  return typeof input[key] === 'string' ? input[key] : '';
}

function optionalString(input: ToolInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value ? value : undefined;
}

function objectValue(input: ToolInput, key: string): JsonObject {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function arrayValue(input: ToolInput, key: string): unknown[] {
  return Array.isArray(input[key]) ? input[key] : [];
}

type ToolDefinition = {
  title: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  annotations: ToolAnnotations;
  run: (input: ToolInput) => Promise<ReturnType<typeof toolResult>>;
};

function register(server: McpServer, name: string, definition: ToolDefinition): void {
  server.registerTool(
    name,
    {
      title: definition.title,
      description: `${definition.description}\n\nOutput: { status: number, data: object }. Non-2xx responses are returned as MCP tool errors.`,
      inputSchema: definition.schema,
      outputSchema: ToolOutputSchema,
      annotations: definition.annotations,
    },
    async (input) => definition.run(input as ToolInput),
  );
}

function get(path: string): Promise<ReturnType<typeof toolResult>> {
  return callAssistant(path).then(toolResult);
}

function post(path: string, body: JsonObject, tool: string, key?: string): Promise<ReturnType<typeof toolResult>> {
  return callAssistant(path, {
    method: 'POST', body, idempotencyKey: key || generatedIdempotencyKey(tool),
  }).then(toolResult);
}

function actionBody(actionType: string, input: ToolInput, payload: JsonObject): JsonObject {
  return {
    action_type: actionType,
    target_id: optionalString(input, 'target_id') || null,
    payload,
    reason: stringValue(input, 'reason'),
    ...(optionalString(input, 'confirmation_token') ? { confirmation_token: stringValue(input, 'confirmation_token') } : {}),
    ...(optionalString(input, 'confirmed_by') ? { confirmed_by: stringValue(input, 'confirmed_by') } : {}),
  };
}

function controlledAction(
  tool: string,
  actionType: string,
  input: ToolInput,
  payload: JsonObject,
): Promise<ReturnType<typeof toolResult>> {
  const token = optionalString(input, 'confirmation_token');
  const confirmer = optionalString(input, 'confirmed_by');
  if ((token && !confirmer) || (!token && confirmer)) {
    return Promise.resolve(localError(422, 'confirmation_pair_required', 'Provide both confirmation_token and confirmed_by, or omit both to preview.'));
  }
  if (!token) {
    return callAssistant('/api/assistant/actions/preview', {
      method: 'POST', body: actionBody(actionType, input, payload),
    }).then(toolResult);
  }
  return post(
    '/api/assistant/actions/execute',
    actionBody(actionType, input, payload),
    tool,
    optionalString(input, 'idempotency_key'),
  );
}

function registerTools(server: McpServer): void {
  register(server, 'search_customers', {
    title: 'Search Customers',
    description: 'Search active GCI CRM customers by exact or partial customer name. Use this before customer-specific tools when only a name is known.',
    schema: z.object({ query: z.string().trim().min(1).max(100).describe('Customer name or partial name.') }).strict(),
    annotations: readAnnotations,
    run: (input) => get(`/api/assistant/customers/search?q=${encodeURIComponent(stringValue(input, 'query'))}`),
  });

  register(server, 'get_customer_context', {
    title: 'Get Customer Context',
    description: 'Read the unified customer profile, contacts, follow-ups, activity, quotations, projects, invoices, payments, receivables, documents, tasks, next action, and risks.',
    schema: z.object({ customer_id: uuid('Customer') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`),
  });

  register(server, 'get_today_followups', {
    title: 'Get Today Follow-ups', description: 'Return CRM customers due for follow-up today in Dubai time.',
    schema: z.object({}).strict(), annotations: readAnnotations,
    run: async () => toolResult(projected(await callAssistant('/api/assistant/followups/today'), ['date', 'today'])),
  });

  register(server, 'get_overdue_actions', {
    title: 'Get Overdue Actions', description: 'Return overdue CRM follow-ups and overdue internal Action Center tasks without changing them.',
    schema: z.object({}).strict(), annotations: readAnnotations,
    run: async () => {
      const [followups, management] = await Promise.all([
        callAssistant('/api/assistant/followups/today'), callAssistant('/api/assistant/management/today'),
      ]);
      const followupData = followups.data as JsonObject;
      const managementData = management.data as JsonObject;
      const tasks = managementData?.tasks as JsonObject | undefined;
      return toolResult({
        status: followups.status >= 300 ? followups.status : management.status,
        data: { ok: followups.status < 300 && management.status < 300, date: followupData?.date, overdue_followups: followupData?.overdue || [], overdue_tasks: tasks?.overdue || [] },
      });
    },
  });

  register(server, 'search_products', {
    title: 'Search Products', description: 'Search the current supplier product catalog by SKU, name, model, or specification. It does not invent standard inventory data.',
    schema: z.object({ query: z.string().trim().min(1).max(100).describe('SKU, product name, model, or specification.') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/products/search?q=${encodeURIComponent(stringValue(input, 'query'))}`),
  });

  register(server, 'get_product_context', {
    title: 'Get Product Context', description: 'Read supplier product details, supplier, supplier prices, historical selling prices, consignment matches, inventory availability, and explicit data gaps.',
    schema: z.object({ product_id: uuid('Supplier product') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/context/product/${stringValue(input, 'product_id')}`),
  });

  register(server, 'get_inventory', {
    title: 'Get Inventory', description: 'Read the inventory section and consignment evidence for a product. Null fields and gaps mean the standard inventory ledger is unavailable and must not be inferred.',
    schema: z.object({ product_id: uuid('Supplier product') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/product/${stringValue(input, 'product_id')}`), ['product', 'consignment_batches', 'inventory', 'gaps'])),
  });

  register(server, 'get_price_history', {
    title: 'Get Product Price History', description: 'Read supplier quotation prices and historical quotation selling prices for a product.',
    schema: z.object({ product_id: uuid('Supplier product') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/product/${stringValue(input, 'product_id')}`), ['product', 'supplier', 'latest_supplier_prices', 'historical_selling_prices', 'gaps'])),
  });

  register(server, 'search_suppliers', {
    title: 'Search Suppliers', description: 'Search GCI suppliers by display name, Chinese or English name, or short code.',
    schema: z.object({ query: z.string().trim().min(1).max(100).describe('Supplier name or code.') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/search?module=supplier&q=${encodeURIComponent(stringValue(input, 'query'))}`),
  });

  register(server, 'get_supplier_context', {
    title: 'Get Supplier Context', description: 'Read supplier profile, contacts, products, quotations, quote items, documents, payables, payments, and known procurement gaps.',
    schema: z.object({ supplier_id: uuid('Supplier') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/context/supplier/${stringValue(input, 'supplier_id')}`),
  });

  register(server, 'get_supplier_quotes', {
    title: 'Get Supplier Quotes', description: 'Read supplier quotations and their items for one supplier.',
    schema: z.object({ supplier_id: uuid('Supplier') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/supplier/${stringValue(input, 'supplier_id')}`), ['supplier', 'quotations', 'quotation_items', 'gaps'])),
  });

  register(server, 'get_quotation', {
    title: 'Get Quotation', description: 'Read one trade quotation and all quotation items by quotation UUID.',
    schema: z.object({ quotation_id: uuid('Quotation') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/records/quotation/${stringValue(input, 'quotation_id')}`),
  });

  register(server, 'list_customer_quotations', {
    title: 'List Customer Quotations', description: 'List quotations linked to one CRM customer.',
    schema: z.object({ customer_id: uuid('Customer') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`), ['customer', 'quotations', 'service_quotations'])),
  });

  register(server, 'get_project_context', {
    title: 'Get Project Context', description: 'Read project, customer, quotations, supplier quotations, finance vouchers, and explicit project structure gaps.',
    schema: z.object({ project_id: uuid('Project') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/context/project/${stringValue(input, 'project_id')}`),
  });

  register(server, 'list_customer_projects', {
    title: 'List Customer Projects', description: 'List projects linked to one CRM customer.',
    schema: z.object({ customer_id: uuid('Customer') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`), ['customer', 'projects'])),
  });

  register(server, 'get_finance_context', {
    title: 'Get Finance Context', description: 'Read customer-level invoices, receivables, and payments when customer_id is supplied; otherwise return the read-only business overview finance summaries.',
    schema: z.object({ customer_id: uuid('Customer').optional() }).strict(), annotations: readAnnotations,
    run: async (input) => {
      const customerId = optionalString(input, 'customer_id');
      if (customerId) return toolResult(projected(await callAssistant(`/api/assistant/context/customer/${customerId}`), ['customer', 'invoices', 'payments', 'receivables', 'gaps']));
      return toolResult(projected(await callAssistant('/api/assistant/overview'), ['as_of', 'invoices', 'procurement', 'management', 'risks']));
    },
  });

  register(server, 'get_customer_receivables', {
    title: 'Get Customer Receivables', description: 'Read the existing customer receivables, payments, and invoices. Values remain separated where GCI has no unified balance ledger.',
    schema: z.object({ customer_id: uuid('Customer') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`), ['customer', 'receivables', 'payments', 'invoices', 'gaps'])),
  });

  register(server, 'get_invoice', {
    title: 'Get Invoice', description: 'Read one invoice draft or issued invoice by UUID. This tool never issues or modifies the invoice.',
    schema: z.object({ invoice_id: uuid('Invoice') }).strict(), annotations: readAnnotations,
    run: (input) => get(`/api/assistant/records/invoice/${stringValue(input, 'invoice_id')}`),
  });

  register(server, 'list_customer_invoices', {
    title: 'List Customer Invoices', description: 'List invoices matched to one CRM customer through the existing customer context rules.',
    schema: z.object({ customer_id: uuid('Customer') }).strict(), annotations: readAnnotations,
    run: async (input) => toolResult(projected(await callAssistant(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`), ['customer', 'invoices', 'gaps'])),
  });

  register(server, 'get_documents', {
    title: 'Get Documents', description: 'Read customer or supplier document metadata, or search company documents. Supply exactly one of customer_id, supplier_id, or query.',
    schema: z.object({ customer_id: uuid('Customer').optional(), supplier_id: uuid('Supplier').optional(), query: z.string().trim().min(1).max(100).optional() }).strict(), annotations: readAnnotations,
    run: async (input) => {
      const choices = ['customer_id', 'supplier_id', 'query'].filter((key) => optionalString(input, key));
      if (choices.length !== 1) return localError(422, 'one_document_selector_required', 'Supply exactly one of customer_id, supplier_id, or query.');
      if (choices[0] === 'customer_id') return toolResult(projected(await callAssistant(`/api/assistant/context/customer/${stringValue(input, 'customer_id')}`), ['customer', 'documents']));
      if (choices[0] === 'supplier_id') return toolResult(projected(await callAssistant(`/api/assistant/context/supplier/${stringValue(input, 'supplier_id')}`), ['supplier', 'documents']));
      return toolResult(await callAssistant(`/api/assistant/search?module=document&q=${encodeURIComponent(stringValue(input, 'query'))}`));
    },
  });

  register(server, 'get_action_center', {
    title: 'Get Action Center', description: 'Read today and overdue internal tasks, commitments, decisions, and pending finance vouchers.',
    schema: z.object({}).strict(), annotations: readAnnotations,
    run: () => get('/api/assistant/management/today'),
  });

  register(server, 'get_business_overview', {
    title: 'Get Business Overview', description: 'Read the cross-module management overview for CRM, quotations, invoices, projects, procurement, task workload, and risks.',
    schema: z.object({}).strict(), annotations: readAnnotations,
    run: () => get('/api/assistant/overview'),
  });

  register(server, 'get_capabilities', {
    title: 'Get Assistant Capabilities', description: 'Read the authoritative module, action-risk, forbidden-action, and known-gap capability map before planning writes.',
    schema: z.object({}).strict(), annotations: readAnnotations,
    run: () => get('/api/assistant/capabilities'),
  });

  register(server, 'update_customer_followup', {
    title: 'Add Customer Follow-up', description: 'Create an audited CRM follow-up and optionally update next action/date. Low risk; never bulk updates.',
    schema: z.object({ customer_id: uuid('Customer'), notes: z.string().trim().min(1).max(5000), next_action: z.string().max(2000).nullable().optional(), next_follow_up_at: z.string().date().nullable().optional(), follow_up_date: z.string().date().optional(), method: z.string().max(100).optional(), idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post(`/api/assistant/customers/${stringValue(input, 'customer_id')}/followup`, { notes: stringValue(input, 'notes'), ...(input.next_action !== undefined ? { next_action: input.next_action } : {}), ...(input.next_follow_up_at !== undefined ? { next_follow_up_at: input.next_follow_up_at } : {}), ...(input.follow_up_date !== undefined ? { follow_up_date: input.follow_up_date } : {}), ...(input.method !== undefined ? { method: input.method } : {}) }, 'update_customer_followup', optionalString(input, 'idempotency_key')),
  });

  const customerFieldTool = (name: string, title: string, description: string, field: string, schema: z.ZodType) => register(server, name, {
    title, description,
    schema: z.object({ customer_id: uuid('Customer'), value: schema, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post(`/api/assistant/customers/${stringValue(input, 'customer_id')}/update`, { [field]: input.value }, name, optionalString(input, 'idempotency_key')),
  });
  customerFieldTool('update_next_action', 'Update Next Action', 'Update one customer next_action through the audited CRM Action API.', 'next_action', z.string().max(2000).nullable());
  customerFieldTool('update_next_followup_date', 'Update Next Follow-up Date', 'Update one customer next_follow_up_at date through the audited CRM Action API.', 'next_follow_up_at', z.string().date().nullable());
  customerFieldTool('update_customer_priority', 'Update Customer Priority', 'Set one customer priority to A, B, or C through the audited CRM Action API.', 'priority', z.enum(['A', 'B', 'C']));
  customerFieldTool('add_customer_note', 'Add Customer Note', 'Append or set one customer note through the existing audited CRM Action API.', 'notes', z.string().max(5000).nullable());

  register(server, 'upsert_contact', {
    title: 'Upsert Customer Contact', description: 'Create or update one contact for one customer. Provide contact_id only for an update.',
    schema: z.object({ customer_id: uuid('Customer'), contact_id: uuid('Contact').optional(), contact_name: z.string().max(300).nullable().optional(), phone: z.string().max(100).nullable().optional(), whatsapp: z.string().max(100).nullable().optional(), email: z.string().email().max(320).nullable().optional(), is_primary: z.boolean().optional(), idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post(`/api/assistant/customers/${stringValue(input, 'customer_id')}/contact`, Object.fromEntries(Object.entries(input).filter(([key, value]) => !['customer_id', 'idempotency_key'].includes(key) && value !== undefined)), 'upsert_contact', optionalString(input, 'idempotency_key')),
  });

  const quotationItem = z.object({ item_name: z.string().trim().min(1).max(500), description: z.string().max(2000).optional(), qty: z.number().nonnegative(), unit: z.string().max(50).default('PCS'), supplier_cost: z.number().nonnegative().default(0), selling_price: z.number().nonnegative(), notes: z.string().max(2000).optional() }).strict();
  const quotationPayloadSchema = z.object({ customer_id: uuid('Customer'), project_id: uuid('Project').optional(), project_name: z.string().max(500).optional(), quote_type: z.string().max(100).default('CUSTOM'), currency: z.string().trim().min(3).max(10).default('AED'), vat_rate: z.number().min(0).max(100).default(5), terms_notes: z.string().max(5000).optional(), items: z.array(quotationItem).min(1).max(100) }).strict();
  register(server, 'create_quotation_draft', {
    title: 'Create Quotation Draft', description: 'Create an internal DRAFT quotation only. This does not send, approve, or externally communicate the quotation.',
    schema: quotationPayloadSchema.extend({ reason, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('quotation_draft_create', input, Object.fromEntries(Object.entries(input).filter(([key]) => !['reason', 'idempotency_key'].includes(key)))), 'create_quotation_draft', optionalString(input, 'idempotency_key')),
  });

  const quotationUpdatePayload = z.object({ currency: z.string().trim().min(3).max(10).optional(), vat_rate: z.number().min(0).max(100).optional(), terms_notes: z.string().max(5000).optional(), items: z.array(quotationItem).min(1).max(100).optional() }).strict();
  register(server, 'preview_quotation_draft_update', {
    title: 'Preview Quotation Draft Update', description: 'Preview a medium-risk quotation draft update and return a short-lived confirmation token. This preview performs no business-data write.',
    schema: z.object({ target_id: uuid('Quotation'), payload: quotationUpdatePayload, reason }).strict(), annotations: readAnnotations,
    run: (input) => callAssistant('/api/assistant/actions/preview', { method: 'POST', body: actionBody('quotation_draft_update', input, objectValue(input, 'payload')) }).then(toolResult),
  });
  register(server, 'update_quotation_draft', {
    title: 'Update Quotation Draft', description: 'Execute a medium-risk quotation draft update only with the matching preview confirmation token and explicit human confirmer.',
    schema: z.object({ target_id: uuid('Quotation'), payload: quotationUpdatePayload, reason, confirmation_token: confirmationToken, confirmed_by: confirmedBy, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('quotation_draft_update', input, objectValue(input, 'payload')), 'update_quotation_draft', optionalString(input, 'idempotency_key')),
  });

  const invoiceItem = z.object({ description: z.string().trim().min(1).max(1000), qty: z.number().positive().default(1), unit_price: z.number().nonnegative() }).strict();
  register(server, 'create_invoice_draft', {
    title: 'Create Invoice Draft', description: 'Create an internal invoice draft only. This never issues, sends, marks paid, or records a payment.',
    schema: z.object({ customer_id: uuid('Customer'), currency: z.string().trim().min(3).max(10).default('AED'), vat_rate: z.number().min(0).max(100).default(5), invoice_date: z.string().date().optional(), due_date: z.string().date().optional(), payment_terms: z.string().max(2000).optional(), other_comments: z.string().max(5000).optional(), related_quotation: z.string().max(500).optional(), notes: z.string().max(5000).optional(), items: z.array(invoiceItem).min(1).max(100), reason, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('invoice_draft_create', input, Object.fromEntries(Object.entries(input).filter(([key]) => !['reason', 'idempotency_key'].includes(key)))), 'create_invoice_draft', optionalString(input, 'idempotency_key')),
  });

  register(server, 'add_internal_task', {
    title: 'Add Internal Task', description: 'Create one audited internal Executive Task. This does not contact customers or suppliers.',
    schema: z.object({ title: z.string().trim().min(1).max(500), description: z.string().max(5000).optional(), business_area: z.enum(['25H_AI', 'TRADE', 'ECOMMERCE', 'COMPANY_ADMIN', 'OTHER']).default('OTHER'), priority: z.enum(['P1', 'P2', 'P3']).default('P3'), due_at: z.string().datetime({ offset: true }).optional(), reminder_at: z.string().datetime({ offset: true }).optional(), related_customer_id: uuid('Customer').optional(), reason, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('task_create', input, Object.fromEntries(Object.entries(input).filter(([key]) => !['reason', 'idempotency_key'].includes(key)))), 'add_internal_task', optionalString(input, 'idempotency_key')),
  });

  const controlledConfirmation = {
    confirmation_token: confirmationToken.optional().describe('Omit on the first call to receive a preview token; provide it after Chris confirms.'),
    confirmed_by: confirmedBy.optional().describe('Omit on preview; provide with confirmation_token after explicit human confirmation.'),
    idempotency_key: idempotencyKey,
  };

  register(server, 'update_task_status', {
    title: 'Update Task Status',
    description: 'Preview or execute one Executive Task status change. The first call returns a confirmation token and performs no write; call again only after Chris confirms. Never bulk updates.',
    schema: z.object({ target_id: uuid('Executive Task'), status: z.enum(['open', 'in_progress', 'completed', 'cancelled']), reason, ...controlledConfirmation }).strict(),
    annotations: writeAnnotations,
    run: (input) => controlledAction('update_task_status', 'update_task_status', input, { status: input.status }),
  });

  register(server, 'update_task_due_date', {
    title: 'Update Task Due Date',
    description: 'Update or clear the due date of one Executive Task through the audited, idempotent Action Layer. This never changes task status.',
    schema: z.object({ target_id: uuid('Executive Task'), due_at: z.string().datetime({ offset: true }).nullable(), reason, idempotency_key: idempotencyKey }).strict(),
    annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('update_task_due_date', input, { due_at: input.due_at }), 'update_task_due_date', optionalString(input, 'idempotency_key')),
  });

  register(server, 'complete_commitment', {
    title: 'Complete Commitment',
    description: 'Preview or complete one open Executive Commitment. Completion requires a preview token and explicit Chris confirmation; it records completion time and an optional internal note.',
    schema: z.object({ target_id: uuid('Executive Commitment'), completion_note: z.string().max(5000).optional(), reason, ...controlledConfirmation }).strict(),
    annotations: writeAnnotations,
    run: (input) => controlledAction('complete_commitment', 'complete_commitment', input, input.completion_note === undefined ? {} : { completion_note: input.completion_note }),
  });

  register(server, 'close_decision', {
    title: 'Close Decision',
    description: 'Preview or dismiss one pending Executive Decision as closed. This requires a preview token and explicit Chris confirmation and never triggers external actions.',
    schema: z.object({ target_id: uuid('Executive Decision'), note: z.string().max(5000).optional(), reason, ...controlledConfirmation }).strict(),
    annotations: writeAnnotations,
    run: (input) => controlledAction('close_decision', 'close_decision', input, input.note === undefined ? {} : { note: input.note }),
  });

  register(server, 'mark_decision_duplicate', {
    title: 'Mark Decision Duplicate',
    description: 'Preview or dismiss one pending Executive Decision as a duplicate of another decision. Requires a valid duplicate decision ID and explicit Chris confirmation.',
    schema: z.object({ target_id: uuid('Executive Decision'), duplicate_of_id: uuid('Canonical Executive Decision'), note: z.string().max(5000).optional(), reason, ...controlledConfirmation }).strict(),
    annotations: writeAnnotations,
    run: (input) => controlledAction('mark_decision_duplicate', 'mark_decision_duplicate', input, { duplicate_of_id: input.duplicate_of_id, ...(input.note === undefined ? {} : { note: input.note }) }),
  });

  register(server, 'update_asset_review_status', {
    title: 'Update Asset Review Status',
    description: 'Preview or update one Systems Registry asset review classification (deletion_status). Requires explicit Chris confirmation and never deletes, archives, deploys, or changes lifecycle status.',
    schema: z.object({ target_id: uuid('Systems Registry Asset'), review_status: z.enum(['unknown', 'review', 'safe_candidate', 'do_not_delete']), reason, ...controlledConfirmation }).strict(),
    annotations: writeAnnotations,
    run: (input) => controlledAction('update_asset_review_status', 'update_asset_review_status', input, { review_status: input.review_status }),
  });

  register(server, 'preview_invoice_issue', {
    title: 'Preview Invoice Issue', description: 'Preview the high-risk issue-invoice transition. It returns a confirmation token but does not issue the invoice.',
    schema: z.object({ target_id: uuid('Invoice'), reason }).strict(), annotations: readAnnotations,
    run: (input) => callAssistant('/api/assistant/actions/preview', { method: 'POST', body: actionBody('invoice_issue', input, {}) }).then(toolResult),
  });
  register(server, 'issue_invoice', {
    title: 'Issue Invoice', description: 'Issue an approved invoice only after preview and explicit Chris confirmation. The existing high-risk confirmation gate remains authoritative.',
    schema: z.object({ target_id: uuid('Invoice'), reason, confirmation_token: confirmationToken, confirmed_by: confirmedBy, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('invoice_issue', input, {}), 'issue_invoice', optionalString(input, 'idempotency_key')),
  });

  register(server, 'preview_quotation_send', {
    title: 'Preview Quotation Send', description: 'Request a preview for formal quotation sending. The existing Action Layer currently forbids outbound quotation sending, so this returns an explicit unsupported/forbidden error and performs no write.',
    schema: z.object({ target_id: uuid('Quotation'), reason }).strict(), annotations: readAnnotations,
    run: (input) => callAssistant('/api/assistant/actions/preview', { method: 'POST', body: actionBody('quotation_send', input, {}) }).then(toolResult),
  });
  register(server, 'send_quotation', {
    title: 'Send Quotation', description: 'Attempt formal quotation sending only through the existing Action Layer. Outbound quotation sending is currently forbidden/unimplemented and cannot be bypassed by MCP.',
    schema: z.object({ target_id: uuid('Quotation'), reason, confirmation_token: confirmationToken, confirmed_by: confirmedBy, idempotency_key: idempotencyKey }).strict(), annotations: writeAnnotations,
    run: (input) => post('/api/assistant/actions/execute', actionBody('quotation_send', input, {}), 'send_quotation', optionalString(input, 'idempotency_key')),
  });
}

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server);
  return server;
}

const mcp = createMcpHandler(() => buildServer(), { responseMode: 'json' });

export default async function handler(request: Request): Promise<Response> {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'GET, POST, DELETE' } });
  }
  const hostRejected = hostHeaderValidationResponse(request, ALLOWED_HOSTS);
  if (hostRejected) return hostRejected;
  const originRejected = originValidationResponse(request, ALLOWED_ORIGINS);
  if (originRejected) return originRejected;
  if (!(await authenticateMcpSecret(request))) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'WWW-Authenticate': 'Bearer realm="gci-executive-assistant-mcp"' },
    });
  }
  const response = await mcp.fetch(request, { authInfo: { token: 'verified', clientId: 'claude-custom-connector', scopes: ['gci-assistant'] } });
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  headers.set('Vary', 'Authorization');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
