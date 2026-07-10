/**
 * GCI Business Solutions — Supabase CRUD
 * Handles: service_customers, service_catalog_items (extended), service_quotes (extended), service_quote_items (extended)
 * Does NOT touch: CRM, PI quotes, BOQ, supplier quotes, trade module
 */

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

import type { ServiceCustomer, ServiceCatalogItem, ServiceCategory, ServiceQuote, ServiceQuoteLineItem } from '../types';

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
      console.error(`[bsCloud] ${res.status} ${path} :: ${txt}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error('[bsCloud] Network error:', e);
    return null;
  }
}

// ── Customer number generator ─────────────────────────────────────────────────
export function generateCustomerNumber(): string {
  const year = new Date().getFullYear();
  return `SC-${year}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

/** @deprecated use generateFwQuoteNo() instead */
export function generateQuoteNo(): string {
  const year = new Date().getFullYear();
  return `FW-${year}-DRAFT`;
}

/**
 * Generates the next sequential FW quote number for the current year.
 * Queries the DB for existing FW-YYYY-#### numbers and returns max+1.
 * Format: FW-2026-0001
 */
export async function generateFwQuoteNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FW-${year}-`;
  const res = await sbFetch(
    `/rest/v1/service_quotes?select=quote_no&quote_no=like.${encodeURIComponent(prefix + '%')}&order=quote_no.desc&limit=100`,
    { method: 'GET' },
  );
  let next = 1;
  if (res) {
    const rows: { quote_no: string }[] = await res.json().catch(() => []);
    for (const r of rows) {
      const num = parseInt(r.quote_no.replace(prefix, ''), 10);
      if (!isNaN(num) && num >= next) next = num + 1;
    }
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ── service_customers ─────────────────────────────────────────────────────────

export async function listCustomers(): Promise<ServiceCustomer[]> {
  const res = await sbFetch('/rest/v1/service_customers?order=created_at.desc&limit=200', { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function saveCustomer(c: ServiceCustomer): Promise<ServiceCustomer | null> {
  const payload = { ...c, updated_at: new Date().toISOString() };
  if (!payload.customer_number) payload.customer_number = generateCustomerNumber();
  const res = await sbFetch('/rest/v1/service_customers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!res) return null;
  const d = await res.json().catch(() => null);
  return Array.isArray(d) ? d[0] : d;
}

export async function updateCustomer(id: string, patch: Partial<ServiceCustomer>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

export async function getCustomer(id: string): Promise<ServiceCustomer | null> {
  const res = await sbFetch(`/rest/v1/service_customers?id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' });
  if (!res) return null;
  const d = await res.json().catch(() => []);
  return d[0] ?? null;
}

// ── service_categories ────────────────────────────────────────────────────────

export async function listCategories(): Promise<ServiceCategory[]> {
  const res = await sbFetch('/rest/v1/service_categories?order=sort_order.asc', { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function saveCategory(cat: ServiceCategory): Promise<ServiceCategory | null> {
  const res = await sbFetch('/rest/v1/service_categories', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cat),
  });
  if (!res) return null;
  const d = await res.json().catch(() => null);
  return Array.isArray(d) ? d[0] : d;
}

export async function updateCategory(id: string, patch: Partial<ServiceCategory>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_categories?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  return res !== null;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_categories?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

// ── service_catalog_items ─────────────────────────────────────────────────────

export async function listCatalogItems(activeOnly = false): Promise<ServiceCatalogItem[]> {
  const filter = activeOnly ? '&active=eq.true' : '';
  const res = await sbFetch(`/rest/v1/service_catalog_items?order=sort_order.asc${filter}`, { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function saveCatalogItem(item: ServiceCatalogItem): Promise<ServiceCatalogItem | null> {
  const res = await sbFetch('/rest/v1/service_catalog_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...item, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const d = await res.json().catch(() => null);
  return Array.isArray(d) ? d[0] : d;
}

export async function updateCatalogItem(id: string, patch: Partial<ServiceCatalogItem>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_catalog_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteCatalogItem(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_catalog_items?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

// ── service_quotes ────────────────────────────────────────────────────────────

export async function listQuotes(limit = 100): Promise<ServiceQuote[]> {
  const res = await sbFetch(`/rest/v1/service_quotes?order=created_at.desc&limit=${limit}`, { method: 'GET' });
  if (!res) return [];
  const rows = await res.json().catch(() => []);
  // Normalize: ensure grand_total falls back to total_amount
  return rows.map((r: any) => ({ ...r, grand_total: r.grand_total ?? r.total_amount ?? 0 }));
}

export async function listQuotesByCustomer(customerId: string): Promise<ServiceQuote[]> {
  const res = await sbFetch(`/rest/v1/service_quotes?customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc`, { method: 'GET' });
  if (!res) return [];
  const rows = await res.json().catch(() => []);
  return rows.map((r: any) => ({ ...r, grand_total: r.grand_total ?? r.total_amount ?? 0 }));
}

export async function loadQuote(id: string): Promise<{ quote: ServiceQuote; items: ServiceQuoteLineItem[] } | null> {
  const [qRes, iRes] = await Promise.all([
    sbFetch(`/rest/v1/service_quotes?id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' }),
    sbFetch(`/rest/v1/service_quote_items?service_quote_id=eq.${encodeURIComponent(id)}&order=sort_order.asc`, { method: 'GET' }),
  ]);
  if (!qRes) return null;
  const quotes = await qRes.json().catch(() => []);
  if (!quotes.length) return null;
  const rawItems: any[] = iRes ? await iRes.json().catch(() => []) : [];
  const items: ServiceQuoteLineItem[] = rawItems.map((it: any, idx: number) => ({
    id: it.id || `item_${idx}`,
    catalog_service_id: it.catalog_service_id,
    category_name: it.category_name || '',
    service_name: it.service_name || '',
    description: it.description || '',
    scope: it.scope || '',
    deliverables: it.deliverables || '',
    item_exclusions: it.item_exclusions || '',
    timeline: it.timeline || '',
    unit: it.unit || '项',
    quantity: Number(it.quantity) || 1,
    months: Number(it.months) || 1,
    billing_type: it.billing_type || 'fixed',
    billing_label: it.billing_label || '',
    one_time_fee: Number(it.one_time_fee) || 0,
    monthly_fee: Number(it.monthly_fee) || 0,
    annual_fee: Number(it.annual_fee) || 0,
    unit_price: Number(it.unit_price) || 0,
    line_total: Number(it.line_total) || 0,
    is_optional: !!it.is_optional,
    sort_order: Number(it.sort_order) || idx,
  }));
  const q = quotes[0];
  return { quote: { ...q, grand_total: q.grand_total ?? q.total_amount ?? 0 }, items };
}

export async function saveQuote(
  quote: ServiceQuote,
  items: ServiceQuoteLineItem[]
): Promise<string | null> {
  const now = new Date().toISOString();
  const quotePayload = { ...quote, updated_at: now };
  delete (quotePayload as any).id;

  const res = await sbFetch('/rest/v1/service_quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(quotePayload),
  });
  if (!res) return null;
  const saved = await res.json().catch(() => null);
  const savedQuote = Array.isArray(saved) ? saved[0] : saved;
  const id: string = savedQuote?.id;
  if (!id) return null;

  if (items.length > 0) {
    const rows = items.map((it, i) => ({
      service_quote_id: id,
      catalog_service_id: it.catalog_service_id || null,
      category_name: it.category_name,
      service_name: it.service_name,
      description: it.description,
      scope: it.scope,
      deliverables: it.deliverables,
      item_exclusions: it.item_exclusions,
      timeline: it.timeline,
      unit: it.unit,
      quantity: it.quantity,
      months: it.months,
      billing_type: it.billing_type,
      billing_label: it.billing_label,
      one_time_fee: it.one_time_fee,
      monthly_fee: it.monthly_fee,
      annual_fee: it.annual_fee,
      unit_price: it.unit_price,
      line_total: it.line_total,
      is_optional: it.is_optional,
      sort_order: i,
      updated_at: now,
    }));
    await sbFetch('/rest/v1/service_quote_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
  }
  return id;
}

export async function updateQuote(id: string, patch: Partial<ServiceQuote>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_quotes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteQuote(id: string): Promise<boolean> {
  await sbFetch(`/rest/v1/service_quote_items?service_quote_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const res = await sbFetch(`/rest/v1/service_quotes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

// ── service_customer_documents ────────────────────────────────────────────────

export interface CustomerDocument {
  id?: string;
  customer_id: string;
  document_type: string;
  document_name: string;
  file_url?: string;
  storage_path?: string;
  issue_date?: string;
  expiry_date?: string;
  reminder_days?: number;
  status?: string;
  notes?: string;
  uploaded_by?: string;
  created_at?: string;
  updated_at?: string;
}

export async function listCustomerDocuments(customerId: string): Promise<CustomerDocument[]> {
  const res = await sbFetch(
    `/rest/v1/service_customer_documents?customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function saveCustomerDocument(doc: CustomerDocument): Promise<CustomerDocument | null> {
  const payload = { ...doc, updated_at: new Date().toISOString() };
  const res = await sbFetch('/rest/v1/service_customer_documents', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!res) return null;
  const d = await res.json().catch(() => null);
  return Array.isArray(d) ? d[0] : d;
}

export async function updateCustomerDocument(id: string, patch: Partial<CustomerDocument>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customer_documents?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteCustomerDocument(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customer_documents?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res !== null;
}

const BUCKET = 'service-customer-documents';

/** Upload a file to Supabase Storage. Returns { path, url } or null on failure. */
export async function uploadDocumentFile(
  customerId: string,
  file: File,
): Promise<{ path: string; url: string } | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `service-customers/${customerId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const uploadUrl = `${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`;
  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[bsCloud] Storage upload failed:', res.status, txt);
      return null;
    }
    // Build a signed URL (1 year = 31536000s)
    const signedUrl = await getSignedUrl(path);
    return { path, url: signedUrl || `${SUPA_URL}/storage/v1/object/${BUCKET}/${path}` };
  } catch (e) {
    console.error('[bsCloud] Storage upload error:', e);
    return null;
  }
}

/** Get a signed URL for a storage path (valid 1 year). */
export async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 31536000 }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.signedURL) return `${SUPA_URL}${data.signedURL}`;
    if (data?.signedUrl) return data.signedUrl;
    return null;
  } catch {
    return null;
  }
}

/** Delete a file from Supabase Storage. */
export async function deleteDocumentFile(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [path] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── service_customer_compliance_items ─────────────────────────────────────────

export interface ComplianceItem {
  id?: string;
  customer_id: string;
  document_id?: string;
  compliance_type: string;
  title: string;
  license_number?: string;
  licensee_name?: string;
  trade_name?: string;
  legal_status?: string;
  issuing_authority?: string;
  manager_name?: string;
  premises_number?: string;
  building_name?: string;
  area_name?: string;
  activities?: string[];
  issue_date?: string;
  expiry_date?: string;
  renewal_date?: string;
  filing_frequency?: string;
  next_due_date?: string;
  reminder_days?: number;
  status?: string;
  assigned_to?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export async function listComplianceItems(customerId: string): Promise<ComplianceItem[]> {
  const res = await sbFetch(
    `/rest/v1/service_customer_compliance_items?customer_id=eq.${encodeURIComponent(customerId)}&order=expiry_date.asc.nullslast`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function saveComplianceItem(item: ComplianceItem): Promise<ComplianceItem | null> {
  const payload = { ...item, updated_at: new Date().toISOString() };
  const res = await sbFetch('/rest/v1/service_customer_compliance_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!res) return null;
  const d = await res.json().catch(() => null);
  return Array.isArray(d) ? d[0] : d;
}

export async function updateComplianceItem(id: string, patch: Partial<ComplianceItem>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customer_compliance_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteComplianceItem(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_customer_compliance_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res !== null;
}

/** Fetch all upcoming/expired compliance items across all customers (for dashboard alerts). */
export async function listExpiringCompliance(days = 90): Promise<ComplianceItem[]> {
  const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const today  = new Date().toISOString().slice(0, 10);
  // Items where expiry_date <= future (includes already expired)
  const res = await sbFetch(
    `/rest/v1/service_customer_compliance_items?expiry_date=lte.${future}&status=eq.ACTIVE&order=expiry_date.asc&limit=200`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function checkTableExists(): Promise<boolean> {
  try {
    const res = await sbFetch('/rest/v1/service_customers?limit=1', { method: 'GET' });
    return res !== null;
  } catch {
    return false;
  }
}
