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
  '营业执照', '公司注册文件', 'VAT文件', '税务文件', '合同', 'NDA', '银行资料', '认证证书',
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
  expiresInSeconds = 3600,
): Promise<string | null> {
  // Routed through the server (service-role key) — the anon key has no
  // Storage RLS grant on the suppliers-private/suppliers-public buckets.
  try {
    const res = await fetch('/api/suppliers/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign', bucket, path, expiresIn: expiresInSeconds }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return null;
    return data.url ?? null;
  } catch (e) {
    console.error('[documentsCloud] getSignedUrl failed', e);
    return null;
  }
}

export async function getDocumentUrl(doc: SupplierDocument): Promise<string | null> {
  if (doc.storage_path && doc.storage_bucket) {
    return getSignedUrl(doc.storage_bucket, doc.storage_path);
  }
  return doc.file_url ?? null;
}

// ── Actual file upload to Supabase Storage ───────────────────────────────────

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Upload a supplier file via the server (service-role key — the browser's
 *  anon key has no Storage RLS grant on the supplier buckets).
 *  Returns { path, bucket, url } on success, or throws with a real error message. */
export async function uploadSupplierFile(
  supplierId: string,
  file: File,
  documentType: string,
): Promise<{ path: string; bucket: string; url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请上传 15MB 以内的文件 / File too large, please upload under 15MB`);
  }
  const dataBase64 = await fileToBase64(file);
  const res = await fetch('/api/suppliers/upload-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      supplierId,
      documentType,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `文件上传失败（HTTP ${res.status}）/ Upload failed (HTTP ${res.status})`);
  }
  return { path: data.path, bucket: data.bucket, url: data.url ?? '' };
}

// ── Storage file move (copy + delete) ────────────────────────────────────────

/** Copy a file to a new path, then delete the source. Returns new path or null. */
export async function moveStorageFile(
  bucket: string,
  srcPath: string,
  destPath: string,
): Promise<string | null> {
  // 1. Copy
  const copyRes = await fetch(`${SUPA_URL}/storage/v1/object/copy`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: bucket,
      sourceKey: srcPath,
      destinationBucket: bucket,
      destinationKey: destPath,
    }),
  });
  if (!copyRes.ok) {
    console.error('[documentsCloud] copy failed', copyRes.status, await copyRes.text().catch(() => ''));
    return null;
  }
  // 2. Delete source
  await fetch(`${SUPA_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [srcPath] }),
  });
  return destPath;
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
