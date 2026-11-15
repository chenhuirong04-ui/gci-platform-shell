/**
 * Customer-quote amount reconciliation (cloud save).
 *
 * Header amounts reuse the verified Trade / PI rules (modules/trade/services/currencyUtils):
 * - roundTo2 (round half up) for every money value
 * - calculateTradeTotals: subtotal = sum of rounded lines, VAT = roundTo2(subtotal × 5%),
 *   total = subtotal + VAT  — identical to what the PI computes.
 * Quotation Center additionally stores per-line VAT / cost / profit (PI does not), so the
 * only logic added here splits the header VAT and cost back onto the lines
 * (largest-remainder method) so every line column adds up exactly to the header.
 */
import { roundTo2, calculateTradeTotals } from '../../trade/services/currencyUtils';

/** Only used to weight the per-line VAT split; the VAT total itself comes from calculateTradeTotals. */
const VAT_SHARE = 0.05;

/** Money → integer fils using the same roundTo2 rule as Trade / PI. */
export const toCents = (x: number): number => Math.round(roundTo2(Number(x) || 0) * 100);
const fromCents = (c: number): number => c / 100;

/**
 * Integers that sum exactly to `total` and stay within 1 of each exact value
 * (largest-remainder method; ties go to the earlier line).
 */
export function allocateCents(exact: number[], total: number): number[] {
  const base = exact.map(v => Math.floor(Number(v.toPrecision(12))));
  let diff = total - base.reduce((s, v) => s + v, 0);
  const frac = exact.map((v, i) => ({ i, f: Number(v.toPrecision(12)) - base[i] }));
  if (diff > 0) {
    const order = [...frac].sort((a, b) => b.f - a.f || a.i - b.i);
    for (let k = 0; diff > 0; k = (k + 1) % order.length, diff--) base[order[k].i] += 1;
  } else if (diff < 0) {
    const order = [...frac].sort((a, b) => a.f - b.f || a.i - b.i);
    for (let k = 0; diff < 0; k = (k + 1) % order.length, diff++) base[order[k].i] -= 1;
  }
  return base;
}

/**
 * Unit-price-first line amount, the Trade / PI rule (QuoteManager saves
 * lineTotal = roundTo2(unit_price × qty) with a 2-dp unit price).
 * The quote never derives a unit price from a line total.
 */
export function lineFromUnit(unitPrice: number, qty: number): number {
  return roundTo2(roundTo2(Number(unitPrice) || 0) * (Number(qty) || 0));
}

export interface AmountLineInput {
  /** Exact supplier cost for the whole line (unit cost × qty, AED). */
  cost: number;
  /** Customer selling amount for the whole line (AED). */
  selling: number;
}

export interface AmountLine {
  cost: number; selling: number; profit: number; margin: number; vat: number; lineTotal: number;
}

export interface AmountTotals {
  totalSupplierCost: number; totalSelling: number; totalProfit: number;
  overallMargin: number; totalVAT: number; grandTotal: number;
}

const pct = (profitC: number, costC: number) => (costC > 0 ? roundTo2((profitC / costC) * 100) : 0);

/**
 * Saved supplier-cost total of a reopened quote. quotation_items.supplier_cost is
 * numeric(14,2), so the exact converted unit cost (e.g. 14.32275) is not stored;
 * rebuilding the total from 2-dp unit costs can differ by 0.01 from the saved
 * supplier_cost_total. While the cost lines are unchanged, the saved total is used.
 */
export interface SavedCostBaseline { total: number; fingerprint: string }

/** Cost lines as they were restored (unit cost × qty per row, in order). */
export function costFingerprint(items: { targetUnitPrice: number; quantity: number }[]): string {
  return items.map(it => `${Number(it.targetUnitPrice) || 0}*${Number(it.quantity) || 0}`).join('|');
}

/** Supplier-cost total: the saved one while cost lines are unchanged, else roundTo2(sum of exact line costs). */
export function supplierCostTotal(
  items: { targetUnitPrice: number; quantity: number }[],
  baseline: SavedCostBaseline | null,
): number {
  if (baseline && costFingerprint(items) === baseline.fingerprint) return baseline.total;
  return roundTo2(items.reduce((s, it) => s + (Number(it.targetUnitPrice) || 0) * (Number(it.quantity) || 0), 0));
}

export function reconcileQuoteAmounts(lines: AmountLineInput[], costTotalOverride?: number): { lines: AmountLine[]; totals: AmountTotals } {
  // Quotation Center keeps LINE totals, so each line goes in as price = line amount, qty = 1.
  const { subtotal, vat, total } = calculateTradeTotals(lines.map(l => ({ price: roundTo2(Number(l.selling) || 0), qty: 1 })));
  const sellC = lines.map(l => toCents(l.selling));
  const subtotalC = toCents(subtotal);
  const vatTotalC = toCents(vat);
  const vatC = allocateCents(sellC.map(c => c * VAT_SHARE), vatTotalC);

  const exactCostC = lines.map(l => (Number(l.cost) || 0) * 100);
  const costTotalC = costTotalOverride !== undefined
    ? toCents(costTotalOverride)                              // saved total of an unchanged reopened quote
    : toCents(exactCostC.reduce((s, v) => s + v, 0) / 100);
  const costC = allocateCents(exactCostC, costTotalC);

  const out: AmountLine[] = lines.map((_, i) => {
    const profitC = sellC[i] - costC[i];
    return {
      cost: fromCents(costC[i]),
      selling: fromCents(sellC[i]),
      profit: fromCents(profitC),
      margin: pct(profitC, costC[i]),
      vat: fromCents(vatC[i]),
      lineTotal: fromCents(sellC[i] + vatC[i]),
    };
  });
  const profitTotalC = subtotalC - costTotalC;
  return {
    lines: out,
    totals: {
      totalSupplierCost: fromCents(costTotalC),
      totalSelling: subtotal,
      totalProfit: fromCents(profitTotalC),
      overallMargin: pct(profitTotalC, costTotalC),
      totalVAT: vat,
      grandTotal: total,
    },
  };
}
