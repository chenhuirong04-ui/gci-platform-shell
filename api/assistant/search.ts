import { authenticateAssistant, json, restGet } from './_lib';

export const config = { runtime: 'edge' };

const clean = (value: string) => value.replace(/[%*,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim();

const MAP: Record<string, { table: string; select: string; or: (q: string) => string; order: string }> = {
  supplier: { table: 'suppliers', select: 'id,supplier_name_display,name_cn,name_en,short_code,country,city,status,is_preferred,current_rating,updated_at', or: (q) => `(supplier_name_display.ilike.*${q}*,name_cn.ilike.*${q}*,name_en.ilike.*${q}*,short_code.ilike.*${q}*)`, order: 'updated_at.desc' },
  project: { table: 'crm_projects', select: 'id,customer_id,project_name,status,notes,updated_at', or: (q) => `(project_name.ilike.*${q}*,notes.ilike.*${q}*)`, order: 'updated_at.desc' },
  quotation: { table: 'quotation_records', select: 'id,quote_no,customer_id,project_id,customer_name,project_name,status,grand_total,quote_date,updated_at', or: (q) => `(quote_no.ilike.*${q}*,customer_name.ilike.*${q}*,project_name.ilike.*${q}*)`, order: 'updated_at.desc' },
  invoice: { table: 'invoice_drafts', select: 'id,invoice_no,customer_name,status,currency,total,invoice_date,due_date,updated_at', or: (q) => `(invoice_no.ilike.*${q}*,customer_name.ilike.*${q}*)`, order: 'updated_at.desc' },
  service_quote: { table: 'service_quotes', select: 'id,quote_no,customer_id,customer_name,status,currency,grand_total,valid_until,updated_at', or: (q) => `(quote_no.ilike.*${q}*,customer_name.ilike.*${q}*,quotation_title.ilike.*${q}*)`, order: 'updated_at.desc' },
  document: { table: 'company_documents', select: 'id,document_name,document_type,document_number,company_name,category,issue_date,expiry_date,ai_status,updated_at', or: (q) => `(document_name.ilike.*${q}*,document_type.ilike.*${q}*,document_number.ilike.*${q}*,company_name.ilike.*${q}*)`, order: 'updated_at.desc' },
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const module = url.searchParams.get('module') || '';
  const query = clean(url.searchParams.get('q') || '');
  const definition = MAP[module];
  if (!definition) return json({ ok: false, error: 'unsupported_module', supported: Object.keys(MAP) }, 400);
  if (!query || query.length > 100) return json({ ok: false, error: 'q_required_max_100' }, 400);
  const search = new URLSearchParams({ select: definition.select, or: definition.or(query), order: definition.order, limit: '50' });
  const result = await restGet<any[]>(auth.ctx, `${definition.table}?${search}`);
  if (!result.ok) return result.response;
  return json({ ok: true, module, query, records: result.data });
}
