/**
 * GCI Supplier Library — Supabase CRUD
 * Tables: suppliers, supplier_contacts, supplier_products, supplier_services
 */

import type {
  Supplier, SupplierContact, SupplierProduct, SupplierService, SupplierDetail,
} from '../types';

const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

async function sb(path: string, init: RequestInit = {}): Promise<Response | null> {
  const headers: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };
  try {
    const res = await fetch(`${SUPA_URL}${path}`, { ...init, headers });
    if (!res.ok) {
      console.error(`[suppliersCloud] ${res.status}`, await res.text().catch(() => ''));
      return null;
    }
    return res;
  } catch (e) {
    console.error('[suppliersCloud] network error', e);
    return null;
  }
}

// ── Short-code generator ─────────────────────────────────────────────────────

export async function generateShortCode(prefix = 'SUP-AUTO'): Promise<string> {
  const res = await sb(
    `/rest/v1/suppliers?short_code=like.${encodeURIComponent(prefix + '%')}&select=short_code&order=short_code.desc&limit=1`,
    { method: 'GET' },
  );
  if (!res) return `${prefix}-000001`;
  const rows = await res.json().catch(() => []);
  if (!rows.length) return `${prefix}-000001`;
  const last = rows[0].short_code as string;
  const num = parseInt(last.replace(`${prefix}-`, ''), 10);
  return `${prefix}-${String((isNaN(num) ? 0 : num) + 1).padStart(6, '0')}`;
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export async function listSuppliers(opts: {
  search?: string;
  country?: string;
  supplier_type?: string;
  category?: string;
  status?: string;
  rating?: string;
  is_preferred?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<Supplier[]> {
  const params = new URLSearchParams();
  params.set('order', 'created_at.desc');
  params.set('limit', String(opts.limit ?? 50));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.country) params.set('country', `eq.${opts.country}`);
  if (opts.supplier_type) params.set('supplier_type', `eq.${opts.supplier_type}`);
  if (opts.status) params.set('status', `eq.${opts.status}`);
  if (opts.rating) params.set('current_rating', `eq.${opts.rating}`);
  if (opts.is_preferred !== undefined) params.set('is_preferred', `eq.${opts.is_preferred}`);
  if (opts.category) params.set('product_categories', `cs.{"${opts.category}"}`);
  const res = await sb(`/rest/v1/suppliers?${params}`, { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function searchSuppliers(q: string, limit = 20): Promise<Supplier[]> {
  if (q.length < 2) return [];
  const encoded = encodeURIComponent(q);
  const res = await sb(
    `/rest/v1/suppliers?or=(supplier_name_display.ilike.*${encoded}*,name_cn.ilike.*${encoded}*,name_en.ilike.*${encoded}*,short_code.ilike.*${encoded}*)&status=neq.archived&limit=${limit}&order=is_preferred.desc,supplier_name_display.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const res = await sb(`/rest/v1/suppliers?id=eq.${id}&limit=1`, { method: 'GET' });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return rows[0] ?? null;
}

export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
  const [supplier, contacts, products, services] = await Promise.all([
    getSupplier(id),
    listContacts(id),
    listProducts(id),
    listServices(id),
  ]);
  if (!supplier) return null;
  return { ...supplier, contacts, products, services, documents: [], certifications: [] };
}

export async function createSupplier(data: Omit<Supplier, 'id'>): Promise<Supplier | null> {
  const res = await sb('/rest/v1/suppliers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateSupplier(id: string, patch: Partial<Supplier>): Promise<boolean> {
  const res = await sb(`/rest/v1/suppliers?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteSupplier(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/suppliers?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function listContacts(supplierId: string): Promise<SupplierContact[]> {
  const res = await sb(
    `/rest/v1/supplier_contacts?supplier_id=eq.${supplierId}&order=is_primary.desc,created_at.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createContact(data: Omit<SupplierContact, 'id'>): Promise<SupplierContact | null> {
  const res = await sb('/rest/v1/supplier_contacts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateContact(id: string, patch: Partial<SupplierContact>): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_contacts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteContact(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_contacts?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(supplierId: string): Promise<SupplierProduct[]> {
  const res = await sb(
    `/rest/v1/supplier_products?supplier_id=eq.${supplierId}&order=created_at.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createProduct(data: Omit<SupplierProduct, 'id'>): Promise<SupplierProduct | null> {
  const res = await sb('/rest/v1/supplier_products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateProduct(id: string, patch: Partial<SupplierProduct>): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_products?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function listServices(supplierId: string): Promise<SupplierService[]> {
  const res = await sb(
    `/rest/v1/supplier_services?supplier_id=eq.${supplierId}&order=created_at.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createService(data: Omit<SupplierService, 'id'>): Promise<SupplierService | null> {
  const res = await sb('/rest/v1/supplier_services', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateService(id: string, patch: Partial<SupplierService>): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_services?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteService(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_services?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}
