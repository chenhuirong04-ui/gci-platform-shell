import { supabase } from './supabase';

// See supabase/migrations/20260907_company_documents.sql. Direct port of 25H-WorkforceOS's
// companyDocumentsService.ts. File bytes live in the private `company-documents` Storage bucket,
// never in the database — only metadata + storage_path are stored here. View/Download always go
// through a time-limited signed URL, never a public bucket link.
export const COMPANY_DOCUMENT_CATEGORIES = [
  'Trade License', 'MOA/AOA', 'POA', 'VAT', 'Corporate Tax', 'Bank', 'Contracts',
  'Government Documents', 'Insurance', 'Vehicles', 'HR/Employee', 'Projects', 'Other',
] as const;
export type CompanyDocumentCategory = typeof COMPANY_DOCUMENT_CATEGORIES[number];

const BUCKET = 'company-documents';

export interface CompanyDocument {
  id: string;
  category: string;
  document_name: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  notes: string;
  uploaded_at: string;
  uploaded_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function fetchCompanyDocuments(category?: string): Promise<CompanyDocument[]> {
  let query = supabase.from('company_documents').select('*').order('uploaded_at', { ascending: false });
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as CompanyDocument[];
}

export interface UploadCompanyDocumentInput {
  file: File;
  category: string;
  document_name: string;
  expiry_date: string | null;
  notes: string;
}

// Uploads the file to Storage first (path: company/{category}/{uuid}-{original filename}), then
// inserts the metadata row pointing at it. If the DB insert fails after a successful upload, the
// orphaned Storage object is cleaned up so a failed attempt never leaves an untracked file behind.
export async function uploadCompanyDocument(input: UploadCompanyDocumentInput): Promise<{ error: string | null }> {
  const storagePath = `company/${input.category}/${crypto.randomUUID()}-${input.file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, input.file);
  if (uploadError) return { error: `Storage: ${uploadError.message}` };

  const { error: dbError } = await supabase.from('company_documents').insert({
    category: input.category,
    document_name: input.document_name,
    file_name: input.file.name,
    storage_path: storagePath,
    file_size: input.file.size,
    mime_type: input.file.type || null,
    expiry_date: input.expiry_date,
    notes: input.notes,
  });
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: `DB: ${dbError.message}` };
  }
  return { error: null };
}

export interface CompanyDocumentMetadataUpdate {
  document_name: string;
  category: string;
  expiry_date: string | null;
  notes: string;
}

// Metadata-only update — never touches storage_path/file_name. Replacing the file itself is not
// supported here; that's delete + re-upload, by design (matches WorkforceOS's own V1 scope).
export async function updateCompanyDocumentMetadata(
  id: string, patch: CompanyDocumentMetadataUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('company_documents').update(patch).eq('id', id);
  return { error: error ? error.message : null };
}

// Fixed order: Storage object removed first, only then the metadata row — never the reverse.
export async function deleteCompanyDocument(id: string, storagePath: string): Promise<{ error: string | null }> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) return { error: `Storage: ${storageError.message}` };
  const { error: dbError } = await supabase.from('company_documents').delete().eq('id', id);
  return { error: dbError ? `DB: ${dbError.message}` : null };
}

export async function getCompanyDocumentSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60); // 1 hour
  if (error) return null;
  return data?.signedUrl ?? null;
}

// user_profiles' own RLS only lets a user read their own row, so "上传人" (uploaded_by) can't be
// resolved to a display name via a plain client-side select — this calls the narrow SECURITY
// DEFINER RPC defined alongside the table (see the migration) instead, which exposes nothing but
// id+display_name for active users.
export async function fetchUserDisplayNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('list_active_user_display_names');
  if (error || !data) return {};
  const map: Record<string, string> = {};
  (data as { id: string; display_name: string }[]).forEach(row => { map[row.id] = row.display_name; });
  return map;
}
