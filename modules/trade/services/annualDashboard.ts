// 经营看板 · annual view — pure calculations (no I/O), shared with SalesDashboard.
//
// Same 统计口径 as the existing monthly KPIs in SalesDashboard.tsx:
//   • revenue orders = not ADJUSTMENT, not VOIDED, not Consignment (isRevenueOrder)
//   • a month's 营业额 = Σ grandTotal of revenue orders created that month
//   • a month's 已收款 = Σ paidAmount of those same orders (= the existing
//     「本月已收款」 card, so the current month's bar equals that card)
//   • 当前应收余额 = Σ outstandingAmount of ALL revenue orders (= 「应收账款总额」)
// Month = first 7 chars of createdAt (as the existing thisMonthKey does).
// Payment records (payments table) are shown as month detail for the orders
// of that month; they are not a second revenue source.
import { roundTo2 } from './currencyUtils';
import type { OrderRecord, PaymentRecord } from '../types';

export function isRevenueOrder(o: OrderRecord): boolean {
  const x = o as any;
  return x.order_type !== 'ADJUSTMENT' && x.status !== 'VOIDED' && x.transactionMode !== 'Consignment';
}

export function orderMonthKey(o: OrderRecord): string {
  return String(o.createdAt || (o as any).created_at || '').substring(0, 7);
}

/** Years that have orders, plus the current year; newest first. */
export function availableYears(orders: OrderRecord[], currentYear: number): number[] {
  const set = new Set<number>([currentYear]);
  for (const o of orders) {
    const y = Number(orderMonthKey(o).substring(0, 4));
    if (Number.isInteger(y) && y > 2000) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

export interface MonthRow {
  month: number;          // 1–12
  key: string;            // YYYY-MM
  revenue: number;
  collected: number;
  outstanding: number;
  orderCount: number;
  orders: OrderRecord[];
  payments: PaymentRecord[];
}

export interface AnnualView {
  year: number;
  months: MonthRow[];     // always 12 rows; months without business are 0
  totals: { revenue: number; collected: number; orderCount: number };
}

export function buildAnnualView(orders: OrderRecord[], payments: PaymentRecord[], year: number): AnnualView {
  const revenueOrders = orders.filter(isRevenueOrder);
  const months: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const mo = revenueOrders
      .filter((o) => orderMonthKey(o) === key)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const ids = new Set(mo.map((o) => o.id));
    const pays = payments
      .filter((p) => ids.has(p.orderId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    months.push({
      month: m,
      key,
      revenue: roundTo2(mo.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0)),
      collected: roundTo2(mo.reduce((s, o) => s + (Number(o.paidAmount) || 0), 0)),
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
  };
}
