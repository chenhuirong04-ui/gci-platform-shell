import { authenticateAssistant, isUuid, json, restGet } from '../../_lib';

export const config = { runtime: 'edge' };

const MAP: Record<string, { table: string; items?: { table: string; fk: string } }> = {
  quotation: { table: 'quotation_records', items: { table: 'quotation_items', fk: 'quotation_id' } },
  invoice: { table: 'invoice_drafts' },
  service_quote: { table: 'service_quotes', items: { table: 'service_quote_items', fk: 'service_quote_id' } },
  supplier_quote: { table: 'supplier_quotes', items: { table: 'supplier_quote_items', fk: 'supplier_quote_id' } },
  task: { table: 'executive_tasks' },
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const module = parts.at(-2) || '';
  const id = parts.at(-1) || '';
  const definition = MAP[module];
  if (!definition) return json({ ok: false, error: 'unsupported_module', supported: Object.keys(MAP) }, 400);
  if (!isUuid(id)) return json({ ok: false, error: 'invalid_id' }, 400);
  const recordParams = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const record = await restGet<any[]>(auth.ctx, `${definition.table}?${recordParams}`);
  if (!record.ok) return record.response;
  if (!record.data[0]) return json({ ok: false, error: 'record_not_found' }, 404);
  if (!definition.items) return json({ ok: true, module, record: record.data[0] });
  const itemParams = new URLSearchParams({ select: '*', [definition.items.fk]: `eq.${id}`, order: 'sort_order.asc' });
  const items = await restGet<any[]>(auth.ctx, `${definition.items.table}?${itemParams}`);
  if (!items.ok) return items.response;
  return json({ ok: true, module, record: record.data[0], items: items.data });
}
