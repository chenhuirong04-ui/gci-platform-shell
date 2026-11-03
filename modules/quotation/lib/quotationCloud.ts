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
  /** Customer/Project Linking V1 (2026-09-15) — real FK to
   * crm_customers.id / crm_projects.id. Undefined on records saved before
   * this round; never backfilled by name-matching. */
  customer_id?: string;
  project_id?: string;
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

// ── Atomic save (BOQ P0-02) ──────────────────────────────────────────────────

/**
 * updated_at last seen per quotation id (from load / save / markSentToTrade).
 * Sent as the optimistic-lock token on update so a save never silently
 * overwrites a newer version saved elsewhere.
 */
const lastSeenUpdatedAt = new Map<string, string>();

/**
 * Save header + items in ONE database transaction via
 * public.save_quotation_with_items (migration 20261103090000). Any failure
 * rolls back everything; returns the record id, or null on failure.
 */
async function saveAtomic(id: string | null, payload: SaveQuotationPayload): Promise<string | null> {
  const res = await sbFetch('/rest/v1/rpc/save_quotation_with_items', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id,
      p_record: payload.record,
      p_items: payload.items,
      p_expected_updated_at: id ? lastSeenUpdatedAt.get(id) ?? null : null,
    }),
  });
  if (!res) return null;

  const saved = await res.json().catch(() => null);
  const savedId: string | undefined = saved?.id;
  if (!savedId) { console.error('[quotationCloud] No id returned from save'); return null; }
  if (saved.updated_at) lastSeenUpdatedAt.set(savedId, saved.updated_at);
  return savedId;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a new quotation draft to cloud (header + items, all-or-nothing).
 * Returns the saved record id (UUID), or null on failure.
 */
export async function saveQuotation(payload: SaveQuotationPayload): Promise<string | null> {
  return saveAtomic(null, payload);
}

/**
 * Update an existing quotation record + replace its items, all-or-nothing.
 * Returns false (nothing changed) on any failure, on a concurrent-edit
 * conflict, or when existing items would be replaced by an empty list.
 */
export async function updateQuotation(id: string, payload: SaveQuotationPayload): Promise<boolean> {
  return (await saveAtomic(id, payload)) !== null;
}

/**
 * Load a quotation by quote_no (e.g. "GCI-20250531-001").
 * Returns null if not found, or if the items could not be loaded (never an
 * empty list in place of real items).
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
  if (!itemRes) { console.error('[quotationCloud] Items load failed'); return null; }
  const items = await itemRes.json().catch(() => null);
  if (!Array.isArray(items)) { console.error('[quotationCloud] Items load returned no list'); return null; }

  if (record.id && record.updated_at) lastSeenUpdatedAt.set(record.id, record.updated_at);
  return { record, items: items as QuotationItem[] };
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
  const res = await sbFetch(`/rest/v1/quotation_records?id=eq.${encodeURIComponent(id)}&select=updated_at`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'SENT_TO_TRADE',
      trade_pi_id: tradePiId || null,
      updated_at: new Date().toISOString(),
    }),
  });
  // Our own change — refresh the lock token so the next update isn't refused as a conflict.
  const rows = res ? await res.json().catch(() => null) : null;
  if (Array.isArray(rows) && rows[0]?.updated_at) lastSeenUpdatedAt.set(id, rows[0].updated_at);
}
