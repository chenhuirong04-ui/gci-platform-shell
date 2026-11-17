// GET /api/finance/payables-due?supplier=   (GIA P3 step 2, read-only)
// 财务中心 → 应付账款: open supplier payables with overdue / due-in-7-days
// buckets (AccountsPayable.tsx kpi rule) and pending outgoing supplier
// cheques (AccountsPayable listPendingCheques).
// Auth: requireModule('finance'); RLS tables read as the caller.
import { requireModule } from '../_lib/auth';
import { json, userRows, sum, dubaiToday, daysUntil } from './_read';

export const config = { runtime: 'edge' };

export const PAYABLE_LIST_MAX = 20;

interface Payable {
  supplier_name?: string; reference_no?: string | null; invoice_no?: string | null;
  amount?: number; paid_amount?: number; outstanding_amount?: number; due_date?: string | null; status?: string;
}
interface SupplierCheque {
  supplier_name?: string; amount?: number; cheque_amount?: number | null; cheque_date?: string | null;
  cheque_number?: string | null; cheque_bank?: string | null; payment_date?: string | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.,]/g, '');

export function buildPayablesDue(payables: Payable[], cheques: SupplierCheque[], today: string, supplier = '') {
  const key = norm(supplier);
  const match = (name: unknown) => !key || norm(name).includes(key);
  const open = payables.filter((p) => p.status !== 'PAID' && p.status !== 'CANCELLED' && match(p.supplier_name));
  const withDays = open
    .map((p) => ({ p, d: daysUntil(p.due_date, today) }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  const overdue = withDays.filter((x) => x.d !== null && x.d < 0);
  const dueSoon = withDays.filter((x) => x.d !== null && x.d >= 0 && x.d <= 7);
  const chq = cheques.filter((c) => match(c.supplier_name));
  return {
    today,
    filters: { supplier: supplier || null },
    openCount: open.length,
    totalOutstanding: sum(open, (p) => p.outstanding_amount),
    overdue: { count: overdue.length, amount: sum(overdue, (x) => x.p.outstanding_amount) },
    dueIn7Days: { count: dueSoon.length, amount: sum(dueSoon, (x) => x.p.outstanding_amount) },
    payables: withDays.slice(0, PAYABLE_LIST_MAX).map(({ p, d }) => ({
      supplier: p.supplier_name || null,
      reference: p.reference_no || p.invoice_no || null,
      amount: p.amount ?? 0,
      paid: p.paid_amount ?? 0,
      outstanding: p.outstanding_amount ?? 0,
      dueDate: p.due_date || null,
      daysUntilDue: d,
      status: p.status,
    })),
    pendingSupplierCheques: {
      count: chq.length,
      amount: sum(chq, (c) => c.cheque_amount ?? c.amount),
      items: chq.slice(0, 10).map((c) => ({
        supplier: c.supplier_name || null, amount: c.cheque_amount ?? c.amount ?? 0,
        chequeDate: c.cheque_date || null, chequeNo: c.cheque_number || null, bank: c.cheque_bank || null,
      })),
    },
    note: open.length > PAYABLE_LIST_MAX ? `仅显示最早到期的 ${PAYABLE_LIST_MAX} 笔，共 ${open.length} 笔` : undefined,
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['finance']);
  if (!auth.ok) return auth.response;
  const supplier = new URL(request.url).searchParams.get('supplier')?.trim() || '';
  try {
    const [payables, cheques] = await Promise.all([
      userRows<Payable>(auth.ctx, 'supplier_payables',
        'select=supplier_name,reference_no,invoice_no,amount,paid_amount,outstanding_amount,due_date,status&order=due_date.asc.nullslast'),
      userRows<SupplierCheque>(auth.ctx, 'supplier_payments',
        'select=supplier_name,amount,cheque_amount,cheque_date,cheque_number,cheque_bank,payment_date&payment_method=eq.CHEQUE&cheque_status=eq.PENDING&order=payment_date.desc'),
    ]);
    return json({ ok: true, source: 'supplier_payables + supplier_payments (财务中心 · 应付账款)', currency: 'AED', ...buildPayablesDue(payables, cheques, dubaiToday(), supplier) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
