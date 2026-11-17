// GET /api/trade/order-lookup?customer=&order=&status=   (GIA P3 step 1, read-only)
// Trade sales orders (table `orders`) with paid / outstanding per order and
// line items when ≤3 orders match. Totals exclude VOIDED orders (same as the
// receivables / sales endpoints); voided orders are still listed, labelled.
// Auth: requireModule(trade|finance|crm) — same list as /api/ai/sales-summary.
import { requireModule } from '../_lib/auth';
import {
  json, loadPayloads, payloadIn, customerMatcher, docMatcher, sum, byCreatedDesc, ORDER_STATUS_ZH, ITEM_DETAIL_MAX,
} from './_read';

export const config = { runtime: 'edge' };

interface Order {
  id: string; quoteId?: string; createdAt: string; customerName: string;
  subtotal: number; vat: number; grandTotal: number; paidAmount: number; outstandingAmount: number;
  status: string; paymentTerms?: string; dueDate?: string; transactionMode?: string; order_type?: string;
}
interface OrderItem { orderId: string; desc: string; qty: number; price: number; unit_price?: number; lineTotal: number }

export const ORDER_LIST_MAX = 15;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['trade', 'finance', 'crm']);
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const customer = q.get('customer')?.trim() || '';
  const orderNo = q.get('order')?.trim() || '';
  const status = (q.get('status')?.trim() || '').toUpperCase();
  const byCustomer = customerMatcher(customer);
  const byNo = docMatcher(orderNo);
  const wantStatus = Object.keys(ORDER_STATUS_ZH).includes(status) ? status
    : status === 'UNPAID' ? 'UNPAID' : '';

  try {
    const all = (await loadPayloads<Order>('orders')).sort(byCreatedDesc);
    const matched = all.filter((o) => byCustomer(o.customerName) && byNo(o.id, o.quoteId) && (
      !wantStatus ? true
        : wantStatus === 'UNPAID' ? o.status !== 'VOIDED' && (Number(o.outstandingAmount) || 0) > 0
          : o.status === wantStatus));
    const live = matched.filter((o) => o.status !== 'VOIDED');
    const shown = matched.slice(0, ORDER_LIST_MAX);
    const detailIds = shown.length <= ITEM_DETAIL_MAX ? shown.map((o) => o.id) : [];
    const items = detailIds.length ? await loadPayloads<OrderItem>('order_items', payloadIn('orderId', detailIds), 500) : [];

    return json({
      ok: true,
      source: 'orders + order_items (Trade sales orders)',
      filters: { customer: customer || null, order: orderNo || null, status: wantStatus || null },
      matchedCount: matched.length,
      voidedCount: matched.length - live.length,
      totals: {
        grandTotal: sum(live, (o) => o.grandTotal),
        paid: sum(live, (o) => o.paidAmount),
        outstanding: sum(live, (o) => o.outstandingAmount),
        currency: 'AED',
        note: 'totals exclude VOIDED orders',
      },
      orders: shown.map((o) => ({
        orderNo: o.id,
        piNo: o.quoteId || null,
        date: o.createdAt?.slice(0, 10) || null,
        customerName: o.customerName,
        status: o.status,
        statusZh: ORDER_STATUS_ZH[o.status] || o.status,
        mode: o.transactionMode || null,
        grandTotal: o.grandTotal, paid: o.paidAmount, outstanding: o.outstandingAmount,
        dueDate: o.dueDate || null,
        items: detailIds.includes(o.id)
          ? items.filter((i) => i.orderId === o.id).map((i) => ({ desc: i.desc, qty: i.qty, unitPrice: i.unit_price ?? i.price, lineTotal: i.lineTotal }))
          : undefined,
      })),
      note: matched.length > ORDER_LIST_MAX ? `仅显示最近 ${ORDER_LIST_MAX} 张，共 ${matched.length} 张` : undefined,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
