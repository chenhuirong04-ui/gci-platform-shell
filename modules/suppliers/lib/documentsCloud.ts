/**
 * GCI Supplier Library — Documents CRUD + signed URL access
 * Private bucket: suppliers-private
 * Public bucket: suppliers-public (non-sensitive only)
 */

import type { SupplierDocument, DocumentVerificationStatus } from '../types';

const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

// Document types that must always use the private bucket
const PRIVATE_DOC_TYPES = new Set([
  '营业执照', '公司注册文件', 'VAT文件', '税务文件', '合同', 'NDA', '银行资料',
]);

export function resolveStorageBucket(documentType: string): string {
  return PRIVATE_DOC_TYPES.has(documentType) ? 'suppliers-private' : 'suppliers-public';
}

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
      console.error(`[documentsCloud] ${res.status}`, await res.text().catch(() => ''));
      return null;
    }
    return res;
  } catch (e) {
    console.error('[documentsCloud] network error', e);
    return null;
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listDocuments(supplierId: string): Promise<SupplierDocument[]> {
  const res = await sb(
    `/rest/v1/supplier_documents?supplier_id=eq.${supplierId}&order=document_type.asc,created_at.desc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function listDocumentsByCert(certificationId: string): Promise<SupplierDocument[]> {
  const res = await sb(
    `/rest/v1/supplier_documents?certification_id=eq.${certificationId}&order=is_primary.desc,created_at.asc`,
    { method: 'GET' },
  );
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function createDocument(data: Omit<SupplierDocument, 'id'>): Promise<SupplierDocument | null> {
  const payload = {
    ...data,
    storage_bucket: data.storage_bucket ?? resolveStorageBucket(data.document_type),
    updated_at: new Date().toISOString(),
  };
  const res = await sb('/rest/v1/supplier_documents', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!res) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateDocument(id: string, patch: Partial<SupplierDocument>): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_documents?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res !== null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const res = await sb(`/rest/v1/supplier_documents?id=eq.${id}`, { method: 'DELETE' });
  return res !== null;
}

export async function setVerificationStatus(
  id: string,
  status: DocumentVerificationStatus,
  by?: string,
): Promise<boolean> {
  return updateDocument(id, {
    verification_status: status,
    verified_by: by,
    verified_at: new Date().toISOString(),
  });
}

// ── Signed URL (private bucket access) ───────────────────────────────────────

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const res = await sb(`/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res) return null;
  const data = await res.json().catch(() => null);
  if (!data?.signedURL) return null;
  return `${SUPA_URL}${data.signedURL}`;
}

export async function getDocumentUrl(doc: SupplierDocument): Promise<string | null> {
  if (doc.storage_path && doc.storage_bucket) {
    return getSignedUrl(doc.storage_bucket, doc.storage_path);
  }
  return doc.file_url ?? null;
}

// ── File upload (record only — upload via Supabase Storage SDK on client) ────

export async function recordUploadedDocument(
  supplierId: string,
  documentType: SupplierDocument['document_type'],
  documentName: string,
  storagePath: string,
  opts: Partial<SupplierDocument> = {},
): Promise<SupplierDocument | null> {
  const bucket = resolveStorageBucket(documentType);
  return createDocument({
    supplier_id: supplierId,
    document_type: documentType,
    document_name: documentName,
    storage_bucket: bucket,
    storage_path: storagePath,
    verification_status: 'unverified',
    ...opts,
  });
}
