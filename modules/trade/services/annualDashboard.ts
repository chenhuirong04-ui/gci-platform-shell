// 经营看板 · annual view — pure calculations (no I/O), shared with SalesDashboard.
//
// 营业额 (order-confirmation basis, same as the existing monthly KPIs):
//   • revenue orders = not ADJUSTMENT, not VOIDED, not Consignment (isRevenueOrder)
//   • a month's 营业额 = Σ grandTotal of revenue orders created that month
//   • 当前应收余额 = Σ outstandingAmount of ALL revenue orders (= 「应收账款总额」)
// 已收款 (cash basis, by the REAL payment date):
//   • a month's 已收款 = Σ amount of payment records whose date falls in that month
//   • only payments of revenue orders count (same scope as 营业额): payments on
//     voided / consignment / adjustment orders, or on an unknown order, are
//     not counted — they are reported in `excludedPayments` instead
//   • each payment record counts once (deduped by id)
//   • 全年已收款 = Σ of the 12 months
// Order paidAmount / status are shown as-is (e.g. a 0.22 rounding difference
// on a PAID order stays untouched).
import { roundTo2 } from './currencyUtils';
import type { OrderRecord, PaymentRecord } from '../types';

export function isRevenueOrder(o: OrderRecord): boolean {
  const x = o as any;
  return x.order_type !== 'ADJUSTMENT' && x.status !== 'VOIDED' && x.transactionMode !== 'Consignment';
}

export function orderMonthKey(o: OrderRecord): string {
  return String(o.createdAt || (o as any).created_at || '').substring(0, 7);
}

export function paymentMonthKey(p: PaymentRecord): string {
  return String(p.date || '').substring(0, 7);
}

/** Years that have orders or payments, plus the current year; newest first. */
export function availableYears(orders: OrderRecord[], currentYear: number, payments: PaymentRecord[] = []): number[] {
  const set = new Set<number>([currentYear]);
  const keys = [...orders.map(orderMonthKey), ...payments.map(paymentMonthKey)];
  for (const k of keys) {
    const y = Number(k.substring(0, 4));
    if (Number.isInteger(y) && y > 2000) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

export interface MonthRow {
  month: number;          // 1–12
  key: string;            // YYYY-MM
  revenue: number;        // orders created this month
  collected: number;      // payments dated this month
  outstanding: number;    // still unpaid on orders created this month
  orderCount: number;
  orders: OrderRecord[];
  payments: PaymentRecord[]; // payments dated this month
}

export interface AnnualView {
  year: number;
  months: MonthRow[];     // always 12 rows; months without business are 0
  totals: { revenue: number; collected: number; orderCount: number };
  /** Payments dated in this year that are NOT counted (voided/consignment/adjustment/unknown order). */
  excludedPayments: { count: number; amount: number };
}

export function buildAnnualView(orders: OrderRecord[], payments: PaymentRecord[], year: number): AnnualView {
  const revenueOrders = orders.filter(isRevenueOrder);
  const revenueIds = new Set(revenueOrders.map((o) => o.id));

  const seen = new Set<string>();
  const uniquePayments = payments.filter((p) => {
    const k = String(p.id || p._rowId || '');
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const yearPayments = uniquePayments.filter((p) => paymentMonthKey(p).startsWith(`${year}-`));
  const counted = yearPayments.filter((p) => revenueIds.has(p.orderId));
  const excluded = yearPayments.filter((p) => !revenueIds.has(p.orderId));

  const months: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const mo = revenueOrders
      .filter((o) => orderMonthKey(o) === key)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const pays = counted
      .filter((p) => paymentMonthKey(p) === key)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    months.push({
      month: m,
      key,
      revenue: roundTo2(mo.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0)),
      collected: roundTo2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
      outstanding: roundTo2(mo.reduce((s, o) => s + (Number(o.outstandingAmount) || 0), 0)),
      orderCount: mo.length,
      orders: mo,
      payments: pays,
    });
  }
  return {
    year,
    months,
    totals: {
      revenue: roundTo2(months.reduce((s, r) => s + r.revenue, 0)),
      collected: roundTo2(months.reduce((s, r) => s + r.collected, 0)),
      orderCount: months.reduce((s, r) => s + r.orderCount, 0),
    },
    excludedPayments: {
      count: excluded.length,
      amount: roundTo2(excluded.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    },
  };
}
