import type { ServiceQuoteLineItem, PeriodicBilling } from '../types';

export interface QuoteTotals {
  subtotalOneTime: number;    // sum of all one_time_fee × qty
  subtotalMonthly: number;    // monthly_fee × qty × months (period total, NOT recurring rate)
  subtotalAnnual: number;     // annual_fee × qty
  monthlyRate: number;        // recurring monthly rate (monthly_fee × qty, no × months)
  annualRate: number;         // recurring annual rate (annual_fee × qty)
  periodCost: number;         // subtotalMonthly + subtotalAnnual
  discountAmount: number;
  vatAmount: number;
  totalOneTime: number;
  monthlyFee: number;         // alias for monthlyRate (compat)
  annualRecurring: number;    // alias for annualRate (compat)
  firstYearValue: number;     // subtotalOneTime + periodCost − discount + vat
  grandTotal: number;         // alias for firstYearValue (compat)
}

/** Resolve which fees are "active" for period calculations */
function resolvePeriodicBilling(item: ServiceQuoteLineItem): PeriodicBilling {
  const pb = item.periodic_billing;
  if (pb && pb !== 'auto') return pb;
  // Auto-detect from billing_type + fees
  const bt = item.billing_type;
  if (bt === 'monthly') return 'monthly_only';
  if (bt === 'yearly' || bt === 'quarterly') return 'annual_only';
  const hasMo = (item.monthly_fee || 0) > 0;
  const hasAn = (item.annual_fee || 0) > 0;
  if (hasMo && hasAn) return 'both';
  if (hasMo) return 'monthly_only';
  if (hasAn) return 'annual_only';
  return 'none';
}

export function calcLineTotal(item: ServiceQuoteLineItem): number {
  const qty  = item.quantity || 1;
  const mo   = item.months || 1;
  const otf  = (item.one_time_fee  || 0) * qty;
  const mf   = (item.monthly_fee   || 0) * qty;
  const af   = (item.annual_fee    || 0) * qty;
  const up   = (item.unit_price    || 0) * qty;
  const bt   = item.billing_type;

  // Unit-price billing types
  if (['per_cbm','per_kg','per_unit','per_shipment','percentage','commission'].includes(bt)) return up;

  const pb = resolvePeriodicBilling(item);
  switch (pb) {
    case 'monthly_only': return otf + mf * mo;
    case 'annual_only':  return otf + af;
    case 'both':         return otf + mf * mo + af;
    case 'none':         return otf;
    default:             return otf + mf * mo + af;
  }
}

export function calcQuoteTotals(
  items: ServiceQuoteLineItem[],
  discountType: 'fixed' | 'percent' | undefined,
  discountValue: number,
  vatRate = 0,
): QuoteTotals {
  let subtotalOneTime = 0;
  let subtotalMonthly = 0;  // period total (× months)
  let subtotalAnnual  = 0;
  let monthlyRate     = 0;  // pure recurring monthly rate
  let annualRate      = 0;  // pure recurring annual rate

  for (const it of items) {
    const qty = it.quantity || 1;
    const mo  = it.months   || 1;
    const otf = (it.one_time_fee || 0) * qty;
    const mf  = (it.monthly_fee  || 0) * qty;
    const af  = (it.annual_fee   || 0) * qty;
    const bt  = it.billing_type;

    // Unit-price types: treat as one-time
    if (['per_cbm','per_kg','per_unit','per_shipment','percentage','commission'].includes(bt)) {
      subtotalOneTime += (it.unit_price || 0) * qty;
      continue;
    }

    subtotalOneTime += otf;

    const pb = resolvePeriodicBilling(it);
    switch (pb) {
      case 'monthly_only':
        subtotalMonthly += mf * mo;
        monthlyRate     += mf;
        break;
      case 'annual_only':
        subtotalAnnual += af;
        annualRate     += af;
        break;
      case 'both':
        subtotalMonthly += mf * mo;
        subtotalAnnual  += af;
        monthlyRate     += mf;
        annualRate      += af;
        break;
      case 'none':
        break;
      default:
        subtotalMonthly += mf * mo;
        subtotalAnnual  += af;
        monthlyRate     += mf;
        annualRate      += af;
    }
  }

  const periodCost  = subtotalMonthly + subtotalAnnual;
  const baseTotal   = subtotalOneTime + periodCost;

  let discountAmount = 0;
  if (discountType === 'fixed')   discountAmount = Math.min(discountValue || 0, baseTotal);
  if (discountType === 'percent') discountAmount = baseTotal * ((discountValue || 0) / 100);

  const afterDiscount  = Math.max(0, baseTotal - discountAmount);
  const vatAmount      = Math.round(afterDiscount * (vatRate || 0) * 100) / 100;
  const firstYearValue = afterDiscount + vatAmount;

  const totalOneTime = Math.max(0, subtotalOneTime - (baseTotal > 0 ? discountAmount * (subtotalOneTime / baseTotal) : 0));

  return {
    subtotalOneTime, subtotalMonthly, subtotalAnnual,
    monthlyRate, annualRate, periodCost,
    discountAmount, vatAmount,
    totalOneTime,
    monthlyFee:       monthlyRate,
    annualRecurring:  annualRate,
    firstYearValue,
    grandTotal:       firstYearValue,
  };
}

export function fmt(n: number, currency = 'AED'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
