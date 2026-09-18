import { supabase } from './supabase';

// See supabase/migrations/20260907_company_documents.sql. Direct port of 25H-WorkforceOS's
// companyDocumentsService.ts. File bytes live in the private `company-documents` Storage bucket,
// never in the database — only metadata + storage_path are stored here. View/Download always go
// through a time-limited signed URL, never a public bucket link.
//
// Task (2026-09-17): categories moved from a hardcoded array to
// company_document_categories (see supabase/migrations/20260917b_company_document_categories.sql)
// so a newly-added category is remembered — no more editing this file every time a new document
// type shows up. company_documents.category stays a plain text column (unchanged, no FK, no
// migration of historical rows) — it just now gets its value from fetchDocumentCategories()
// instead of a local const array.
const BUCKET = 'company-documents';

// Storage-key slug, derived from the category name — avoids feeding spaces/Chinese/slashes
// (MOA/AOA would otherwise create a nested "AOA" folder) straight into an object key. Every
// existing category's DB-stored slug (see the migration's seed) matches what this produces, so
// switching from the old fixed CATEGORY_SLUGS map to this dynamic version changes no existing
// Storage paths.
function slugifyCategory(category: string): string {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'other';
}

export interface CompanyDocumentCategory {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export async function fetchDocumentCategories(): Promise<CompanyDocumentCategory[]> {
  const { data, error } = await supabase
    .from('company_document_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error || !data) return [];
  return data as CompanyDocumentCategory[];
}

// Adds one new category — always a single explicit user action from the upload form's
// "+ Add Category", never batch/automatic. Trims, rejects empty, and relies on the DB's
// case/whitespace-insensitive unique index (idx_company_document_categories_name_norm) to reject
// a duplicate — this just turns that constraint violation into a friendly message.
export async function createDocumentCategory(name: string): Promise<
  { ok: true; category: CompanyDocumentCategory } | { ok: false; error: string }
> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  const { data, error } = await supabase
    .from('company_document_categories')
    .insert({ name: trimmed, slug: slugifyCategory(trimmed), is_system: false })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate' };
    return { ok: false, error: error.message };
  }
  return { ok: true, category: data as CompanyDocumentCategory };
}

// Keeps only a plain alphanumeric extension (max 10 chars, guards against a pathological
// "filename.ThisIsNotAnExtension..." match) off the ORIGINAL filename — never used to derive
// anything else about the file. No recognizable extension → no extension in the Storage key.
function safeExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName);
  if (!match) return '';
  return `.${match[1].toLowerCase()}`;
}

export type AiStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';

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
  // Company Documents Intelligence V2 Phase 1 — all nullable, never backfilled
  // for historical rows (see supabase/migrations/20260917c_company_documents_ai_fields.sql).
  document_type: string | null;
  company_name: string | null;
  document_number: string | null;
  issue_date: string | null;
  issuing_authority: string | null;
  ai_summary: string | null;
  ai_extracted: Record<string, unknown> | null;
  ai_status: AiStatus | null;
  ai_confidence: number | null;
  reminder_enabled: boolean;
  last_ai_processed_at: string | null;
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
  // Task: processing-mode picker — "仅保存归档" passes false explicitly (the
  // column defaults to true otherwise). Omitted preserves the prior default
  // behavior for any other existing caller.
  reminder_enabled?: boolean;
}

// Uploads the file to Storage first (path: company/{category-slug}/{uuid}{.ext}), then inserts
// the metadata row pointing at it. The original filename never appears in the Storage key — it's
// only stored as file_name below — so spaces, Chinese characters, "&", parentheses, and
// category-name slashes (e.g. MOA/AOA) never make it into an object key. If the DB insert fails
// after a successful upload, the orphaned Storage object is cleaned up so a failed attempt never
// leaves an untracked file behind.
export async function uploadCompanyDocument(input: UploadCompanyDocumentInput): Promise<{ error: string | null }> {
  const categorySlug = slugifyCategory(input.category);
  const storagePath = `company/${categorySlug}/${crypto.randomUUID()}${safeExtension(input.file.name)}`;
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
    ...(input.reminder_enabled !== undefined ? { reminder_enabled: input.reminder_enabled } : {}),
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

// ─────────────────────────────────────────────────────────────────────────
// Company Documents Intelligence V2 Phase 1 — AI recognition
// ─────────────────────────────────────────────────────────────────────────

export interface AIDocumentFields {
  document_type: string | null;
  suggested_category: string | null;
  company_name: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  summary: string | null;
  confidence: number | null;
}

// Below this, the AI's own guess is flagged for human review rather than
// auto-trusted — the row still saves (never blocks the upload), just with
// ai_status='needs_review' instead of 'completed'.
const AI_NEEDS_REVIEW_THRESHOLD = 0.5;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Uploads to Storage and creates the row immediately (ai_status='pending') — same
// Storage path scheme as uploadCompanyDocument(), filed under the 'other' slug
// since the real category isn't known yet (the Storage path is an internal
// object key only, never shown to the user, so this is cosmetic — the row's
// actual `category` gets corrected to the confirmed value by confirmAIDocument()
// before the user ever sees it). document_name defaults to the raw filename,
// same convention the existing upload form already used.
export async function createPendingCompanyDocument(file: File): Promise<
  { ok: true; document: CompanyDocument } | { ok: false; error: string }
> {
  const storagePath = `company/other/${crypto.randomUUID()}${safeExtension(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
  if (uploadError) return { ok: false, error: `Storage: ${uploadError.message}` };

  const { data, error: dbError } = await supabase.from('company_documents').insert({
    category: 'Other',
    document_name: file.name,
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || null,
    notes: '',
    ai_status: 'pending',
  }).select().single();
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `DB: ${dbError.message}` };
  }
  return { ok: true, document: data as CompanyDocument };
}

// Calls the server-side Gemini endpoint (api/company-documents/parse-document —
// GEMINI_API_KEY never reaches the client) and stamps ai_status + the extracted
// fields onto the row either way. Never throws — a failure resolves ok:false so
// the caller can fall back to the manual form without losing the upload itself.
export async function runDocumentAIRecognition(documentId: string, file: File): Promise<
  { ok: true; fields: AIDocumentFields; model: string } | { ok: false; error: string }
> {
  await supabase.from('company_documents').update({ ai_status: 'processing' as AiStatus }).eq('id', documentId);
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch('/api/company-documents/parse-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: file.type, data: dataUrl }),
    });
    const payload = await res.json();
    if (!payload?.ok) {
      await supabase.from('company_documents')
        .update({ ai_status: 'failed' as AiStatus, last_ai_processed_at: new Date().toISOString() })
        .eq('id', documentId);
      return { ok: false, error: payload?.error || 'AI recognition failed' };
    }
    const fields = payload.fields as AIDocumentFields;
    const confidence = typeof fields.confidence === 'number' ? fields.confidence : null;
    const status: AiStatus = confidence !== null && confidence < AI_NEEDS_REVIEW_THRESHOLD ? 'needs_review' : 'completed';
    await supabase.from('company_documents').update({
      document_type: fields.document_type || null,
      company_name: fields.company_name || null,
      document_number: fields.document_number || null,
      issue_date: fields.issue_date || null,
      expiry_date: fields.expiry_date || null,
      issuing_authority: fields.issuing_authority || null,
      ai_summary: fields.summary || null,
      ai_extracted: fields,
      ai_status: status,
      ai_confidence: confidence,
      last_ai_processed_at: new Date().toISOString(),
    }).eq('id', documentId);
    return { ok: true, fields, model: payload.model };
  } catch (e: any) {
    await supabase.from('company_documents')
      .update({ ai_status: 'failed' as AiStatus, last_ai_processed_at: new Date().toISOString() })
      .eq('id', documentId);
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Only matches an EXISTING active category (case/whitespace-insensitive) —
// never creates one. Category creation stays a deliberate user action via
// "+ Add Category", per spec.
export function matchSuggestedCategory(
  suggested: string | null, categories: CompanyDocumentCategory[],
): CompanyDocumentCategory | null {
  if (!suggested) return null;
  const norm = suggested.trim().toLowerCase();
  return categories.find(c => c.name.trim().toLowerCase() === norm) || null;
}

// Re-downloads an already-uploaded file from Storage so the "AI 识别" button on
// an existing row can re-run recognition without the browser still holding the
// original File object (it never does, after the initial upload completes).
export async function fetchStoredFileForAI(doc: CompanyDocument): Promise<File | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return null;
  return new File([data], doc.file_name, { type: doc.mime_type || data.type });
}

export interface ConfirmAIDocumentInput {
  category: string;
  document_name: string;
  document_type: string | null;
  company_name: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  ai_summary: string | null;
  notes: string;
}

// The "确认并保存" step — writes the (possibly user-corrected) reviewed fields,
// including whichever category/document_name the user settled on. Also used
// for the AI-failure manual-fallback path (same row, AI fields just stay null).
// reminder_enabled follows whether an expiry_date ended up set at all.
export async function confirmAIDocument(id: string, input: ConfirmAIDocumentInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('company_documents').update({
    category: input.category,
    document_name: input.document_name,
    document_type: input.document_type,
    company_name: input.company_name,
    document_number: input.document_number,
    issue_date: input.issue_date,
    expiry_date: input.expiry_date,
    issuing_authority: input.issuing_authority,
    ai_summary: input.ai_summary,
    notes: input.notes,
    reminder_enabled: !!input.expiry_date,
  }).eq('id', id);
  return { error: error ? error.message : null };
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
