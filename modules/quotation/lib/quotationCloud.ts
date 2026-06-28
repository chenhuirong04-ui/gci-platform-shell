/**
 * GCI Quotation Center — Cloud Storage (Supabase)
 *
 * Reuses TRADE OS Supabase instance.
 * Tables: quotation_records + quotation_items (flat schema, no payload wrapper)
 *
 * Minimal API: save / update / loadByQuoteNo
 */

const SUPA_URL = "https://efrkvwhzpgahjgfukjth.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuotationRecord {
  id?: string;
  quote_no: string;
  customer_name?: string;
  project_name?: string;
  deal_id?: string;
  salesperson?: string;
  phone_wa?: string;
  quote_type: 'CUSTOM' | 'TRADE' | 'BOQ';
  status: 'DRAFT' | 'GENERATED' | 'SENT_TO_TRADE';
  source?: string;
  supplier_cost_total: number;
  selling_total: number;
  profit_total: number;
  margin_percent: number;
  vat_amount: number;
  grand_total: number;
  terms_notes?: string;
  pdf_url?: string;
  trade_pi_id?: string;
  created_by?: string;
  quote_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  item_name: string;
  description?: string;
  qty: number;
  unit: string;
  supplier_cost: number;
  selling_price: number;
  profit_amount: number;
  margin_percent: number;
  vat_amount: number;
  line_total: number;
  currency: string;
  item_notes?: string;
  sort_order: number;
}

export interface SaveQuotationPayload {
  record: QuotationRecord;
  items: QuotationItem[];
}

export interface LoadedQuotation {
  record: QuotationRecord;
  items: QuotationItem[];
}

// ── Internal fetch helper ────────────────────────────────────────────────────

async function sbFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const url = `${SUPA_URL}${path}`;
  const headers: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };
  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[quotationCloud] ${res.status} ${res.statusText} :: ${txt}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error('[quotationCloud] Network error:', e);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a new quotation draft to cloud.
 * Returns the saved record id (UUID), or null on failure.
 */
export async function saveQuotation(payload: SaveQuotationPayload): Promise<string | null> {
  const { record, items } = payload;

  // 1. Insert quotation_records
  const res = await sbFetch('/rest/v1/quotation_records', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  if (!res) return null;

  const saved = await res.json().catch(() => null);
  const savedRecord = Array.isArray(saved) ? saved[0] : saved;
  const id: string = savedRecord?.id;
  if (!id) { console.error('[quotationCloud] No id returned from save'); return null; }

  // 2. Insert quotation_items with quotation_id
  if (items.length > 0) {
    const itemRows = items.map((it, i) => ({ ...it, quotation_id: id, sort_order: i }));
    const itemRes = await sbFetch('/rest/v1/quotation_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(itemRows),
    });
    if (!itemRes) console.warn('[quotationCloud] Items save failed, record saved without items');
  }

  return id;
}

/**
 * Update an existing quotation record + replace its items.
 * Deletes old items and inserts new ones.
 */
export async function updateQuotation(id: string, payload: SaveQuotationPayload): Promise<boolean> {
  const { record, items } = payload;

  // 1. Patch quotation_records
  const patchRes = await sbFetch(
    `/rest/v1/quotation_records?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        ...record,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!patchRes) return false;

  // 2. Delete old items
  await sbFetch(`/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  // 3. Insert new items
  if (items.length > 0) {
    const itemRows = items.map((it, i) => ({ ...it, quotation_id: id, sort_order: i }));
    await sbFetch('/rest/v1/quotation_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(itemRows),
    });
  }

  return true;
}

/**
 * Load a quotation by quote_no (e.g. "GCI-20250531-001").
 * Returns null if not found.
 */
export async function loadByQuoteNo(quoteNo: string): Promise<LoadedQuotation | null> {
  // 1. Fetch record
  const recRes = await sbFetch(
    `/rest/v1/quotation_records?quote_no=eq.${encodeURIComponent(quoteNo)}&limit=1`,
    { method: 'GET' }
  );
  if (!recRes) return null;

  const records = await recRes.json().catch(() => []);
  if (!Array.isArray(records) || records.length === 0) return null;
  const record: QuotationRecord = records[0];

  // 2. Fetch items
  const itemRes = await sbFetch(
    `/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(record.id!)}&order=sort_order.asc`,
    { method: 'GET' }
  );
  const items: QuotationItem[] = itemRes ? (await itemRes.json().catch(() => [])) : [];

  return { record, items };
}

/**
 * List all quotations, newest first.
 */
export async function listQuotations(limit = 60): Promise<QuotationRecord[]> {
  const res = await sbFetch(
    `/rest/v1/quotation_records?order=updated_at.desc&limit=${limit}`,
    { method: 'GET' }
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

/**
 * Delete a quotation and all its items.
 */
export async function deleteQuotation(id: string): Promise<boolean> {
  await sbFetch(`/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const res = await sbFetch(`/rest/v1/quotation_records?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

/**
 * Mark a quotation as SENT_TO_TRADE and optionally write the PI id.
 */
export async function markSentToTrade(id: string, tradePiId?: string): Promise<void> {
  await sbFetch(`/rest/v1/quotation_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'SENT_TO_TRADE',
      trade_pi_id: tradePiId || null,
      updated_at: new Date().toISOString(),
    }),
  });
}
