import type { ServiceQuoteLineItem } from '../types';

export interface QuoteTotals {
  subtotalOneTime: number;
  subtotalMonthly: number;
  subtotalAnnual: number;
  discountAmount: number;
  totalOneTime: number;
  monthlyFee: number;
  annualRecurring: number;
  grandTotal: number;
}

export function calcLineTotal(item: ServiceQuoteLineItem): number {
  const bt = item.billing_type;
  const qty = item.quantity || 1;
  const months = item.months || 1;
  if (bt === 'monthly') return item.monthly_fee * qty * months;
  if (bt === 'yearly' || bt === 'quarterly') return item.annual_fee * qty;
  if (bt === 'per_cbm' || bt === 'per_kg' || bt === 'per_unit' || bt === 'per_shipment')
    return item.unit_price * qty;
  if (bt === 'percentage' || bt === 'commission') return item.unit_price * qty;
  // fixed / custom / default
  return item.one_time_fee * qty + item.monthly_fee * qty * months;
}

export function calcQuoteTotals(
  items: ServiceQuoteLineItem[],
  discountType: 'fixed' | 'percent' | undefined,
  discountValue: number,
): QuoteTotals {
  let subtotalOneTime = 0;
  let subtotalMonthly = 0;
  let subtotalAnnual = 0;

  for (const it of items) {
    const bt = it.billing_type;
    const qty = it.quantity || 1;
    const months = it.months || 1;
    if (bt === 'monthly') {
      subtotalMonthly += it.monthly_fee * qty;
    } else if (bt === 'yearly' || bt === 'quarterly') {
      subtotalAnnual += it.annual_fee * qty;
    } else {
      // fixed/custom: one-time portion + optional monthly
      subtotalOneTime += it.one_time_fee * qty;
      if (it.monthly_fee > 0) subtotalMonthly += it.monthly_fee * qty * months;
    }
  }

  const baseTotal = subtotalOneTime + subtotalMonthly + subtotalAnnual;
  let discountAmount = 0;
  if (discountType === 'fixed') discountAmount = Math.min(discountValue || 0, baseTotal);
  else if (discountType === 'percent') discountAmount = baseTotal * ((discountValue || 0) / 100);

  const totalOneTime = Math.max(0, subtotalOneTime - discountAmount * (subtotalOneTime / (baseTotal || 1)));
  const monthlyFee = subtotalMonthly;
  const annualRecurring = subtotalAnnual;
  const grandTotal = Math.max(0, baseTotal - discountAmount);

  return { subtotalOneTime, subtotalMonthly, subtotalAnnual, discountAmount, totalOneTime, monthlyFee, annualRecurring, grandTotal };
}

export function fmt(n: number, currency = 'AED'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
