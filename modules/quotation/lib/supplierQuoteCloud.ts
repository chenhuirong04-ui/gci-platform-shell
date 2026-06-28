/**
 * GCI Supplier Quote Archive — Cloud Storage (Supabase)
 * Tables: supplier_quotes + supplier_quote_items
 */

const SUPA_URL = "https://efrkvwhzpgahjgfukjth.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SupplierQuote {
  id?: string;
  supplier_quote_no: string;
  supplier_name?: string;
  supplier_contact?: string;
  category?: string;
  currency: string;
  quote_date?: string;
  valid_until?: string;
  terms_notes?: string;
  uploaded_by?: string;
  source_file_name?: string;
  status: 'Active' | 'Archived' | 'Converted' | 'Expired';
  total_cost: number;
  converted_quote_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SupplierQuoteItem {
  id?: string;
  supplier_quote_id?: string;
  item_name: string;
  description?: string;
  qty: number;
  unit: string;
  supplier_cost: number;
  currency: string;
  notes?: string;
  sort_order: number;
}

// ── Internal fetch ────────────────────────────────────────────────────────────

async function sbFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const headers: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };
  try {
    const res = await fetch(`${SUPA_URL}${path}`, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[supplierQuoteCloud] ${res.status} :: ${txt}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error('[supplierQuoteCloud] Network error:', e);
    return null;
  }
}

// ── Generate supplier quote number ────────────────────────────────────────────

export function generateSupplierQuoteNo(): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `SQ-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Save a new supplier quote + its items. Returns the saved quote id or null. */
export async function saveSupplierQuote(
  quote: SupplierQuote,
  items: SupplierQuoteItem[]
): Promise<string | null> {
  const res = await sbFetch('/rest/v1/supplier_quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(quote),
  });
  if (!res) return null;

  const saved = await res.json().catch(() => null);
  const savedQuote = Array.isArray(saved) ? saved[0] : saved;
  const id: string = savedQuote?.id;
  if (!id) return null;

  if (items.length > 0) {
    const rows = items.map((it, i) => ({ ...it, supplier_quote_id: id, sort_order: i }));
    await sbFetch('/rest/v1/supplier_quote_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
  }

  return id;
}

/** List all supplier quotes, newest first. */
export async function listSupplierQuotes(limit = 60): Promise<SupplierQuote[]> {
  const res = await sbFetch(
    `/rest/v1/supplier_quotes?order=created_at.desc&limit=${limit}`,
    { method: 'GET' }
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

/** Load a supplier quote and its items by id. */
export async function loadSupplierQuote(
  id: string
): Promise<{ quote: SupplierQuote; items: SupplierQuoteItem[] } | null> {
  const [qRes, iRes] = await Promise.all([
    sbFetch(`/rest/v1/supplier_quotes?id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' }),
    sbFetch(`/rest/v1/supplier_quote_items?supplier_quote_id=eq.${encodeURIComponent(id)}&order=sort_order.asc`, { method: 'GET' }),
  ]);
  if (!qRes) return null;
  const quotes = await qRes.json().catch(() => []);
  if (!quotes.length) return null;
  const items: SupplierQuoteItem[] = iRes ? await iRes.json().catch(() => []) : [];
  return { quote: quotes[0], items };
}

/** Delete a supplier quote and all its items. */
export async function deleteSupplierQuote(id: string): Promise<boolean> {
  await sbFetch(`/rest/v1/supplier_quote_items?supplier_quote_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const res = await sbFetch(`/rest/v1/supplier_quotes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

/** Mark a supplier quote as Converted and store the GCI quotation id. */
export async function markSupplierQuoteConverted(
  supplierQuoteId: string,
  gciQuoteId: string
): Promise<void> {
  await sbFetch(`/rest/v1/supplier_quotes?id=eq.${encodeURIComponent(supplierQuoteId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'Converted',
      converted_quote_id: gciQuoteId,
      updated_at: new Date().toISOString(),
    }),
  });
}
