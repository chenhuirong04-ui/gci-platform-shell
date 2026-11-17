// GIA P3 step 1 — shared read-only access to the legacy Trade tables
// (quotes / quote_items / orders / order_items / payments), used by
// api/trade/{pi-lookup,order-lookup,payment-list}.ts (GIA P3 tools).
//
// Same access pattern as api/ai/sales-summary.ts: the endpoint first passes
// requireModule (caller's own token), then reads with legacyTradeAnonHeaders()
// because these tables only carry the {anon} `anon_all` policy (see
// api/_lib/auth.ts). GET only; never writes. Rows are the cloudDb payload
// format ({ id, state, payload }); only state=active rows are read.
import { legacyTradeAnonHeaders } from '../_lib/auth';
import { expandAliases } from '../ai/_customerAliases';

export const ROW_LIMIT = 1000;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export type TradeTable = 'quotes' | 'quote_items' | 'orders' | 'order_items' | 'payments';

/**
 * Current payloads of one legacy Trade table — the same record set the Trade
 * module shows. Old saves sometimes inserted a new physical row instead of
 * updating, so one business id can have several rows. The app
 * (modules/trade/services/cloudDb.exportAll + persistenceService.mergeById /
 * normalizeCloudRow) reads every row by updated_at DESC and keeps the NEWEST
 * row per business id (payload.id, else row id), whatever its state; then
 * only state 'active' is shown. Mirrored here exactly. `extra` = PostgREST filters.
 */
export async function loadPayloads<T>(table: TradeTable, extra = '', limit = ROW_LIMIT): Promise<T[]> {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!base) throw new Error('supabase_not_configured');
  const url = `${base}/rest/v1/${table}?select=id,state,payload${extra}&order=updated_at.desc&limit=${limit}`;
  const res = await fetch(url, { method: 'GET', headers: { ...legacyTradeAnonHeaders(), 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`supabase_${res.status}`);
  const rows: Array<{ id?: string; state?: string | null; payload: (T & { id?: string }) | null }> = await res.json();
  return currentRows(rows);
}

/** Newest row per business id wins (rows arrive newest first); then active only. */
export function currentRows<T>(rows: Array<{ id?: string; state?: string | null; payload: (T & { id?: string }) | null }>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.payload) continue;
    const key = String(r.payload.id ?? r.id ?? '');
    if (key) { if (seen.has(key)) continue; seen.add(key); }
    if ((r.state ?? 'active') === 'active') out.push(r.payload);
  }
  return out;
}

/** Newest first by the business createdAt (for display after the dedupe). */
export function byCreatedDesc<T extends { createdAt?: string; date?: string }>(a: T, b: T): number {
  return String(b.createdAt ?? b.date ?? '').localeCompare(String(a.createdAt ?? a.date ?? ''));
}

/** PostgREST `in.(…)` filter on a payload key, values quoted. */
export function payloadIn(key: string, values: string[]): string {
  const list = values.map((v) => `"${v.replace(/"/g, '')}"`).join(',');
  return `&payload->>${key}=in.(${encodeURIComponent(list)})`;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.,]/g, '');

/** Customer filter: fuzzy contains on any known alias (same alias map as customer-360). */
export function customerMatcher(customer: string): (name: unknown) => boolean {
  // expandAliases('') would match the first alias group (''.includes check), so skip it.
  if (!customer.trim()) return () => true;
  const keys = expandAliases(customer).map(norm).filter(Boolean);
  if (!keys.length) return () => true;
  return (name) => { const n = norm(name); return keys.some((k) => n.includes(k)); };
}

/** Document-number filter: case/spacing-insensitive contains (PI-…, SO-…, partial numbers). */
export function docMatcher(no: string): (...ids: unknown[]) => boolean {
  const key = norm(no);
  return (...ids) => !key || ids.some((id) => norm(id).includes(key));
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = <T>(rows: T[], f: (r: T) => unknown) => round2(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0));

export const ORDER_STATUS_ZH: Record<string, string> = {
  PENDING: '待付款', PARTIAL: '部分付款', PAID: '已付清', CONSIGNMENT: '寄售', VOIDED: '已作废',
};
export const PI_STATUS_ZH: Record<string, string> = {
  DRAFT: '草稿', QUOTED: '已报价', CONVERTED: '已转订单', LOST: '未成交',
};

/** Items for at most `max` parent docs (keeps responses small). */
export const ITEM_DETAIL_MAX = 3;
