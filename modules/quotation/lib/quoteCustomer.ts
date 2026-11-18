/**
 * Quote-only customer (new customer typed straight into a quote, no CRM record) and the
 * "similar existing customer" check shown before the user decides whether to save it to CRM.
 * The check only warns — it never merges, links or overwrites an existing customer.
 */
export interface QuoteOnlyCustomer {
  name: string;
  contactName: string;
  phone: string;
  email: string;
}

export const emptyQuoteOnlyCustomer = (): QuoteOnlyCustomer => ({ name: '', contactName: '', phone: '', email: '' });

const SUFFIX = /\b(l\.?l\.?c|fz-?llc|fzco|fze|fzc|co|corp|company|ltd|limited|inc|est|establishment|trading|general|group|international|intl|the)\b/g;
const CN_SUFFIX = /(股份有限公司|有限责任公司|有限公司|公司|集团|贸易|商行)/g;
const NOT_NAME_CHAR = /[^a-z0-9一-鿿가-힯]+/g;

/** Company name without legal/trade suffixes, case, spaces and punctuation. */
export function normalizeCustomerName(s: string): string {
  return String(s || '').toLowerCase().replace(SUFFIX, ' ').replace(CN_SUFFIX, '').replace(NOT_NAME_CHAR, '');
}

/** The most distinctive word of a name (longest, suffixes removed) — a second search term so
 *  "DHCN Trading LLC" also finds "DHCN". Empty when it adds nothing. */
export function coreSearchTerm(s: string): string {
  const words = String(s || '').toLowerCase().replace(SUFFIX, ' ').replace(CN_SUFFIX, ' ').split(NOT_NAME_CHAR).filter(w => w.length >= 2);
  return words.sort((a, b) => b.length - a.length)[0] || '';
}

export function isSimilarCustomerName(a: string, b: string): boolean {
  const x = normalizeCustomerName(a);
  const y = normalizeCustomerName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.includes(short);
}

/** Existing customers whose name looks like `name` (deduplicated, search order kept). */
export function similarCustomers<T extends { customer: { id: string; customer_name: string } }>(name: string, hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter(h => {
    if (seen.has(h.customer.id) || !isSimilarCustomerName(name, h.customer.customer_name)) return false;
    seen.add(h.customer.id);
    return true;
  });
}
