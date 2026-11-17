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
  return latestActiveRows(rows).map((r) => r.payload as T);
}

/**
 * Same rule, returning the row objects themselves (for endpoints that also use
 * row columns such as created_at). Input must be ordered updated_at DESC and
 * must NOT be pre-filtered by state, or an older active row could stand in
 * for a newer voided / cancelled one.
 */
export function latestActiveRows<R extends { id?: string; state?: string | null; payload: any }>(rows: R[]): R[] {
  const seen = new Set<string>();
  const out: R[] = [];
  for (const r of rows || []) {
    if (!r?.payload) continue;
    const key = String(r.payload.id ?? r.id ?? '');
    if (key) { if (seen.has(key)) continue; seen.add(key); }
    if ((r.state ?? 'active') === 'active') out.push(r);
  }
  return out;
}
/**
 * For the older AI endpoints that read `orders` rows themselves
 * (customer-360, daily-brief, receivables-summary, sales-summary): current
 * rows per the app rule, then back in created_at DESC order as those
 * endpoints listed them before. Query must be `order=updated_at.desc`, no state filter.
 */
export function currentOrderRows<R extends { id?: string; state?: string | null; created_at?: string; payload: any }>(rows: R[]): R[] {
  return latestActiveRows(rows).sort((a, b) =>
    String(b.payload?.createdAt ?? b.created_at ?? '').localeCompare(String(a.payload?.createdAt ?? a.created_at ?? '')));
}

/**
 * Effective (valid) sales order — the ONE rule for 有效营业额 / 有效应收, identical to
 * the 经营看板 (modules/trade/services/annualDashboard.ts isRevenueOrder):
 * not VOIDED, not a consignment order, not an adjustment order.
 * 有效应收 = Σ outstandingAmount of effective orders (= 经营看板 「当前应收余额」).
 */
export function isEffectiveOrder(p: any): boolean {
  return !!p && p.order_type !== 'ADJUSTMENT' && p.status !== 'VOIDED' && p.transactionMode !== 'Consignment';
}

/**
 * Voided orders and the payment records still attached to them — reported
 * separately, never part of effective revenue or receivables. Includes voided
 * consignment / adjustment orders.
 */
export function voidedSummary(orders: any[], payments: any[]) {
  const voided = (orders || []).filter((o) => o?.status === 'VOIDED');
  const ids = new Set(voided.map((o) => o.id));
  const pays = (payments || []).filter((p) => ids.has(p?.orderId));
  return {
    orderCount: voided.length,
    orderIds: voided.map((o) => o.id),
    paymentCount: pays.length,
    paymentAmount: sum(pays, (p: any) => p.amount),
    note: '已作废订单及其收款记录单独列示，不计入有效营业额或应收',
  };
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
