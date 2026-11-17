// GET /api/trade/payment-list?customer=&order=&period=   (GIA P3 step 1, read-only)
// Customer payments recorded in the Trade module (table `payments`), joined to
// `orders` for the customer name. period: today | week | month | YYYY-MM | all
// (default all). Auth: requireModule(trade|finance|crm) — same as sales-summary.
// totalAmount = payments of 有效订单 only (isEffectiveOrder, same as 经营看板 已收款);
// payments on voided / consignment / adjustment / unknown orders are listed with
// counted=false and reported separately in `excluded` (voided ones in `voided`).
import { requireModule } from '../_lib/auth';
import { json, loadPayloads, customerMatcher, docMatcher, sum, isEffectiveOrder, voidedSummary } from './_read';

export const config = { runtime: 'edge' };

interface Payment { id: string; orderId: string; date: string; amount: number; method: string; note?: string }
interface Order { id: string; customerName: string; status: string; transactionMode?: string; order_type?: string }

export const PAYMENT_LIST_MAX = 20;
const METHOD_ZH: Record<string, string> = { CASH: '现金', BANK: '银行转账', BANK_TRANSFER: '银行转账', CHEQUE: '支票', OTHER: '其他' };

/** [start, end) as YYYY-MM-DD in Dubai time, or null = no date filter. */
export function periodRange(period: string, now = new Date()): { from: string; to: string } | null {
  const p = period.trim().toLowerCase();
  const d = new Date(now.getTime() + 4 * 3600 * 1000); // Dubai (UTC+4)
  const day = (x: Date) => x.toISOString().slice(0, 10);
  const add = (x: Date, n: number) => new Date(x.getTime() + n * 86400000);
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split('-').map(Number);
    return { from: `${p}-01`, to: day(new Date(Date.UTC(y, m, 1))) };
  }
  if (p === 'today') return { from: day(d), to: day(add(d, 1)) };
  if (p === 'week') return { from: day(add(d, -d.getUTCDay())), to: day(add(d, 1)) };
  if (p === 'month') return { from: `${day(d).slice(0, 7)}-01`, to: day(add(d, 1)) };
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['trade', 'finance', 'crm']);
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const customer = q.get('customer')?.trim() || '';
  const orderNo = q.get('order')?.trim() || '';
  const period = q.get('period')?.trim() || 'all';
  const range = periodRange(period);
  const byCustomer = customerMatcher(customer);
  const byNo = docMatcher(orderNo);

  try {
    const [payments, orders] = await Promise.all([loadPayloads<Payment>('payments'), loadPayloads<Order>('orders')]);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const matched = payments
      .map((p) => ({ p, o: orderById.get(p.orderId) }))
      .filter(({ p, o }) =>
        byNo(p.orderId) &&
        (!customer || byCustomer(o?.customerName)) &&
        (!range || ((p.date || '').slice(0, 10) >= range.from && (p.date || '').slice(0, 10) < range.to)))
      .sort((a, b) => String(b.p.date).localeCompare(String(a.p.date)));
    const shown = matched.slice(0, PAYMENT_LIST_MAX);
    const counted = matched.filter(({ o }) => isEffectiveOrder(o));
    const excluded = matched.filter(({ o }) => !isEffectiveOrder(o));
    const matchedOrders = Array.from(new Set(matched.map(({ o }) => o).filter(Boolean))) as Order[];

    return json({
      ok: true,
      source: 'payments + orders (Trade customer payments)',
      filters: { customer: customer || null, order: orderNo || null, period, range },
      matchedCount: matched.length,
      totalAmount: sum(counted, (x) => x.p.amount),
      countedCount: counted.length,
      excluded: { count: excluded.length, amount: sum(excluded, (x) => x.p.amount), note: '已作废 / 寄售 / 调整单或找不到订单的收款，不计入有效已收款' },
      voided: voidedSummary(matchedOrders, matched.map(({ p }) => p)),
      currency: 'AED',
      payments: shown.map(({ p, o }) => ({
        date: (p.date || '').slice(0, 10) || null,
        amount: p.amount,
        method: p.method,
        methodZh: METHOD_ZH[p.method] || p.method,
        orderNo: p.orderId,
        customerName: o?.customerName ?? null,
        orderStatus: o?.status ?? null,
        counted: isEffectiveOrder(o),
        note: p.note ? String(p.note).slice(0, 120) : null,
      })),
      note: matched.length > PAYMENT_LIST_MAX ? `仅显示最近 ${PAYMENT_LIST_MAX} 笔，共 ${matched.length} 笔` : undefined,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
