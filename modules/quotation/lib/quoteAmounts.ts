/**
 * Customer-quote amount reconciliation (cloud save).
 *
 * Rules (unchanged business rules, unified precision):
 * - Customer line selling amount = the line price shown to the customer, rounded to 0.01.
 * - Subtotal = sum of those lines. VAT = round(subtotal × 5%) on the whole quote.
 * - Supplier cost total = round(sum of exact line costs).
 * - The VAT and cost totals are split back onto the lines with the largest-remainder
 *   method, so every line column adds up exactly to the header (no 0.01 drift).
 * All arithmetic is done in integer fils (1/100 AED).
 */

export const VAT_RATE = 0.05;

/** Number → integer cents, tolerant of float noise (e.g. 1.005 → 101). */
export const toCents = (x: number): number => Math.round(Number(((Number(x) || 0) * 100).toPrecision(12)));
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

const pct = (profitC: number, costC: number) => (costC > 0 ? Math.round((profitC / costC) * 10000) / 100 : 0);

export function reconcileQuoteAmounts(lines: AmountLineInput[]): { lines: AmountLine[]; totals: AmountTotals } {
  if (lines.length === 0) {
    return { lines: [], totals: { totalSupplierCost: 0, totalSelling: 0, totalProfit: 0, overallMargin: 0, totalVAT: 0, grandTotal: 0 } };
  }
  const sellC = lines.map(l => toCents(l.selling));
  const subtotalC = sellC.reduce((s, v) => s + v, 0);
  const vatTotalC = Math.round(subtotalC * VAT_RATE);
  const vatC = allocateCents(sellC.map(c => c * VAT_RATE), vatTotalC);

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
      totalSelling: fromCents(subtotalC),
      totalProfit: fromCents(profitTotalC),
      overallMargin: pct(profitTotalC, costTotalC),
      totalVAT: fromCents(vatTotalC),
      grandTotal: fromCents(subtotalC + vatTotalC),
    },
  };
}
