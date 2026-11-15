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
 * Line selling amount the PI will reproduce: the PI keeps a 2-dp unit price and
 * recomputes line = roundTo2(unit × qty). Locking the quote line to that value means
 * quote, PDF and PI show the same line for any qty (qty 1 lines are unchanged).
 */
export function lockLineToUnit(line: number, qty: number): number {
  const amount = roundTo2(Number(line) || 0);
  if (!(qty > 0)) return amount;
  return roundTo2(roundTo2(amount / qty) * qty);
}

/**
 * Read-only check: does the entered line differ from what the PI will compute
 * (2-dp unit × qty)? Returns null when they match. Never changes the amount —
 * the user must confirm any adjustment.
 */
export function lineUnitMismatch(line: number, qty: number):
  { entered: number; unit: number; adjusted: number; diff: number } | null {
  const entered = roundTo2(Number(line) || 0);
  if (!(qty > 0) || entered <= 0) return null;
  const adjusted = lockLineToUnit(entered, qty);
  if (adjusted === entered) return null;
  return { entered, unit: roundTo2(entered / qty), adjusted, diff: roundTo2(adjusted - entered) };
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

export function reconcileQuoteAmounts(lines: AmountLineInput[]): { lines: AmountLine[]; totals: AmountTotals } {
  // Quotation Center keeps LINE totals, so each line goes in as price = line amount, qty = 1.
  const { subtotal, vat, total } = calculateTradeTotals(lines.map(l => ({ price: roundTo2(Number(l.selling) || 0), qty: 1 })));
  const sellC = lines.map(l => toCents(l.selling));
  const subtotalC = toCents(subtotal);
  const vatTotalC = toCents(vat);
  const vatC = allocateCents(sellC.map(c => c * VAT_SHARE), vatTotalC);

  const exactCostC = lines.map(l => (Number(l.cost) || 0) * 100);
  const costTotalC = toCents(exactCostC.reduce((s, v) => s + v, 0) / 100);
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
