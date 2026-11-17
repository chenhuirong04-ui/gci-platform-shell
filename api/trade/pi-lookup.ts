// GET /api/trade/pi-lookup?customer=&pi=   (GIA P3 step 1, read-only)
// Trade PIs (table `quotes`, written by the Trade module's PI save) with line
// items when ≤3 PIs match. Cost / margin / profit fields are NOT returned.
// Auth: requireModule(trade|finance|crm) — same list as /api/ai/sales-summary.
import { requireModule } from '../_lib/auth';
import {
  json, loadPayloads, payloadIn, customerMatcher, docMatcher, sum, byCreatedDesc, PI_STATUS_ZH, ITEM_DETAIL_MAX,
} from './_read';

export const config = { runtime: 'edge' };

interface Pi {
  id: string; quoteRef?: string; createdAt: string; customerName: string; projectName?: string;
  subtotal: number; vat: number; grandTotal: number; status: string; currency?: string;
  paymentTerms?: string; dueDate?: string; convertedOrderId?: string; piType?: string;
}
interface PiItem { quoteId: string; desc: string; qty: number; price: number; unit_price?: number; lineTotal: number }

export const PI_LIST_MAX = 10;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['trade', 'finance', 'crm']);
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const customer = q.get('customer')?.trim() || '';
  const piNo = q.get('pi')?.trim() || '';
  const byCustomer = customerMatcher(customer);
  const byNo = docMatcher(piNo);

  try {
    const all = (await loadPayloads<Pi>('quotes')).sort(byCreatedDesc);
    const matched = all.filter((p) => byCustomer(p.customerName) && byNo(p.id, p.quoteRef));
    const shown = matched.slice(0, PI_LIST_MAX);
    const detailIds = shown.length <= ITEM_DETAIL_MAX ? shown.map((p) => p.id) : [];
    const items = detailIds.length ? await loadPayloads<PiItem>('quote_items', payloadIn('quoteId', detailIds), 500) : [];

    return json({
      ok: true,
      source: 'quotes + quote_items (Trade PI)',
      filters: { customer: customer || null, pi: piNo || null },
      matchedCount: matched.length,
      totalGrandTotal: sum(matched, (p) => p.grandTotal),
      currency: 'AED',
      pis: shown.map((p) => ({
        piNo: p.id,
        quoteRef: p.quoteRef || null,
        date: p.createdAt?.slice(0, 10) || null,
        customerName: p.customerName,
        projectName: p.projectName || null,
        status: p.status,
        statusZh: PI_STATUS_ZH[p.status] || p.status,
        subtotal: p.subtotal, vat: p.vat, grandTotal: p.grandTotal,
        paymentTerms: p.paymentTerms || null,
        dueDate: p.dueDate || null,
        convertedOrderId: p.convertedOrderId || null,
        items: detailIds.includes(p.id)
          ? items.filter((i) => i.quoteId === p.id).map((i) => ({ desc: i.desc, qty: i.qty, unitPrice: i.unit_price ?? i.price, lineTotal: i.lineTotal }))
          : undefined,
      })),
      note: matched.length > PI_LIST_MAX ? `仅显示最近 ${PI_LIST_MAX} 张，共 ${matched.length} 张` : undefined,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
