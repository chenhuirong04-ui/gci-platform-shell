// GIA → Quotation Center hand-off (P3 of the quote-flow work).
//
// GIA does not build quotes itself. When a supplier price list is dropped into
// GIA with a quote instruction ("加价30%，USD，给 Hong gourmet 报价，只要面霜"),
// GIA reads the instruction here (pure regex — nothing guessed, nothing sent to a
// model) and hands the file + instruction to the Quotation Center, which parses
// the file with its existing importer and shows everything as a preview. Nothing
// is saved until the user saves it there.

export interface QuoteInstruction {
  /** default margin %, only when stated */
  margin?: number;
  /** customer quote currency, only when exactly one is named */
  currency?: 'USD' | 'AED';
  /** VAT %, only when stated */
  vat?: 0 | 5;
  /** customer name as written — resolved against the real CRM later, never guessed */
  customer?: string;
  /** product keywords: only matching lines are included (name / model / description) */
  products?: string[];
}

const QUOTE_WORDS = /报价|quotation|quote|price\s*list|价格表|报价单|견적/i;
const QUOTE_FILE = /\.(xlsx|xls|csv|pdf)$/i;

/** A supplier price list + a quote instruction (not a "store this in Drive" description). */
export function isQuoteRequest(fileName: string, text: string): boolean {
  return QUOTE_FILE.test(fileName || '') && QUOTE_WORDS.test(text || '');
}

const num = (s: string) => Number(s);

export function parseQuoteInstruction(text: string): QuoteInstruction {
  const t = String(text || '');
  const out: QuoteInstruction = {};

  const m = t.match(/(?:加价|毛利率?|利润率?|markup|margin)\s*(?:率|按|为|是|=|:|：)?\s*(\d{1,3}(?:\.\d+)?)\s*%/i)
    || t.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:的)?\s*(?:加价|毛利|利润|markup|margin)/i);
  if (m && num(m[1]) >= 0 && num(m[1]) < 1000) out.margin = num(m[1]);

  const usd = /(^|[^a-z])usd([^a-z]|$)|美元|美金/i.test(t);
  const aed = /(^|[^a-z])aed([^a-z]|$)|迪拉姆/i.test(t);
  if (usd !== aed) out.currency = usd ? 'USD' : 'AED';

  if (/(?:vat|增值税|税)\s*(?:按|为|是|=|:|：)?\s*0\s*%|0\s*%\s*(?:vat|增值税|税)|免税|不含税出口|零税率/i.test(t)) out.vat = 0;
  else if (/(?:vat|增值税|税)\s*(?:按|为|是|=|:|：)?\s*5\s*%|5\s*%\s*(?:vat|增值税|税)/i.test(t)) out.vat = 5;

  const stop = '[，,。；;\\n]';
  const c = t.match(new RegExp(`客户\\s*(?:是|为|:|：)\\s*([^，,。；;\\n]+?)\\s*(?=${stop}|$)`))
    || t.match(/给\s*([^，,。；;\n]+?)\s*(?:做|出|报|发)?\s*(?:报价|quote)/i)
    || t.match(new RegExp(`(?:customer|for)\\s*[:：]?\\s*([A-Za-z0-9][^，,。；;\\n]*?)\\s*(?=${stop}|$)`, 'i'));
  if (c) {
    const name = c[1].trim().replace(/^(客户|customer)\s*/i, '');
    if (name && !QUOTE_WORDS.test(name)) out.customer = name;
  }

  const p = t.match(/(?:只要|只报|只选|产品|品项|products?|items?)\s*(?:是|为|:|：)\s*([^。；;\n]+)/i)
    || t.match(/(?:只要|只报|只选)\s*([^。；;\n，,]+)/);
  if (p) {
    const list = p[1].split(/[，,、/|]|\s+和\s+|\s+and\s+/i).map(s => s.trim()).filter(s => s.length >= 2);
    if (list.length) out.products = list;
  }
  return out;
}

/** Lines matching any product keyword (case-insensitive) — null when no filter was given. */
export function matchProducts<T extends { originalName?: string; model?: string; englishDescription?: string; originalSpec?: string }>(
  items: T[], products?: string[],
): boolean[] | null {
  if (!products || products.length === 0) return null;
  const keys = products.map(k => k.toLowerCase());
  return items.map(it => {
    const hay = [it.originalName, it.model, it.englishDescription, it.originalSpec].filter(Boolean).join(' ').toLowerCase();
    return keys.some(k => hay.includes(k));
  });
}

/** Pick the CRM customer only when the match is unambiguous (exact name, or the only hit). */
export function pickCustomerHit<H extends { customer: { customer_name: string } }>(name: string, hits: H[]): H | null {
  const n = name.trim().toLowerCase();
  const exact = hits.filter(h => (h.customer.customer_name || '').trim().toLowerCase() === n);
  if (exact.length === 1) return exact[0];
  if (exact.length === 0 && hits.length === 1) return hits[0];
  return null;
}

// ── In-memory hand-off (same SPA session; a File cannot survive a reload) ──
export interface QuoteHandoff { file: File; instruction: QuoteInstruction; text: string }
let pending: QuoteHandoff | null = null;
export function setQuoteHandoff(h: QuoteHandoff) { pending = h; }
/** Read once — the Quotation Center consumes it on open. */
export function takeQuoteHandoff(): QuoteHandoff | null { const h = pending; pending = null; return h; }
