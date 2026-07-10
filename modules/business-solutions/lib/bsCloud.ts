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

export function generateQuoteNo(): string {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SQ-${ds}-${Math.floor(100 + Math.random() * 900)}`;
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

export async function checkTableExists(): Promise<boolean> {
  try {
    const res = await sbFetch('/rest/v1/service_customers?limit=1', { method: 'GET' });
    return res !== null;
  } catch {
    return false;
  }
}
