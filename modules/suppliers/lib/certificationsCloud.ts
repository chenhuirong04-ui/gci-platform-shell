/**
 * GCI Supplier Library — Certifications & cert-product links CRUD
 */

import type { SupplierCertification, CertProductLink } from '../types';

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
      console.error(`[certificationsCloud] ${res.status}`, await res.text().catch(() => ''));
      return null;
    }
    return res;
  } catch (e) {
    console.error('[certificationsCloud] network error', e);
    return null;
  }
}

// ── Certifications ────────────────────────────────────────────────────────────

export async function listCertifications(supplierId: string): Promise<SupplierCertification[]> {
  const res = await sb(
    `/rest/v1/supplier_certifications?supplier_id=eq.${supplierId}&order=certification_type.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createCertification(
  data: Omit<SupplierCertification, 'id'>,
): Promise<SupplierCertification | null> {
  const res = await sb('/rest/v1/supplier_certifications', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateCertification(
  id: string,
  patch: Partial<SupplierCertification>,
): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_certifications?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteCertification(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_certifications?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Cert–Product links ────────────────────────────────────────────────────────

export async function listCertProductLinks(certificationId: string): Promise<CertProductLink[]> {
  const res = await sb(
    `/rest/v1/supplier_certification_products?certification_id=eq.${certificationId}&order=created_at.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createCertProductLink(
  data: Omit<CertProductLink, 'id'>,
): Promise<CertProductLink | null> {
  const res = await sb('/rest/v1/supplier_certification_products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteCertProductLink(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_certification_products?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}
