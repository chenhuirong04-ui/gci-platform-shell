/**
 * Quotation Center default exchange rates + Excel price-header currency detection.
 * DEFAULT_RATES values are unchanged from the former in-component table.
 */

// Default conservative exchange rates: supplierCurrency → quoteCurrency
export const DEFAULT_RATES: Record<string, Record<string, number>> = {
  AED: { AED: 1.0,    USD: 0.2723 },
  USD: { AED: 3.6725, USD: 1.0    },
  CNY: { AED: 0.505,  USD: 0.1375 },
  EUR: { AED: 4.00,   USD: 1.09   },
  GBP: { AED: 4.67,   USD: 1.27   },
  // Indicative only — the rate is always shown and confirmed before conversion.
  KRW: { AED: 0.0026, USD: 0.00071 },
};

/** Supplier currencies offered in the Supplier Quote screens. */
export const SUPPLIER_CURRENCIES = ['AED', 'USD', 'CNY', 'KRW', 'EUR', 'GBP'] as const;

/** Default rate for a currency pair; same currency is always 1. */
export function defaultRate(from: string, to: string): number {
  if (from === to) return 1;
  return DEFAULT_RATES[from]?.[to] ?? 1;
}

/** amount (from) × rate, rounded to 2 decimals for display. */
export function convertAmount(amount: number, rate: number): string {
  return (Math.round(amount * rate * 100) / 100).toFixed(2);
}

export type HeaderCurrency = 'USD' | 'CNY' | 'AED' | 'KRW';

// Only explicit markers — no symbol/“元” guessing.
const MARKERS: { cur: HeaderCurrency; re: RegExp }[] = [
  { cur: 'USD', re: /(^|[^a-z])usd([^a-z]|$)|美元/i },
  { cur: 'CNY', re: /(^|[^a-z])(cny|rmb)([^a-z]|$)|人民币/i },
  { cur: 'AED', re: /(^|[^a-z])aed([^a-z]|$)|迪拉姆/i },
  // KRW: the code, ₩, 韩元/韩币, or Korean 원 written as a unit: (원) / [원] / 원화.
  { cur: 'KRW', re: /(^|[^a-z])krw([^a-z]|$)|₩|韩元|韩币|[(\[（]\s*원\s*[)\]）]|원화/i },
];

/**
 * Currency named by the price (and total) column headers.
 * currency is set only when exactly one currency is named; otherwise
 * found = [] (unclear) or several (mixed) and the user must confirm.
 */
export function detectHeaderCurrency(headers: string[]): { currency: HeaderCurrency | null; found: HeaderCurrency[] } {
  const found = MARKERS.filter(m => headers.some(h => m.re.test(String(h || '')))).map(m => m.cur);
  return { currency: found.length === 1 ? found[0] : null, found };
}
