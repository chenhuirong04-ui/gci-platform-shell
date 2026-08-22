// GCI Executive Desk — Task 17: GIA File Inbox & Smart Library.
// Metadata-only registry over files GIA itself uploads to Drive via the
// drive.file-scoped write endpoints. No full-text analysis by default —
// classification is rule-based off Chris's own description + filename.
import { supabase } from './supabase';

export interface GiaFileRegistryRow {
  id: string;
  file_name: string;
  display_name: string;
  document_type: string;
  business_area: string | null;
  company_name: string | null;
  customer_id: string | null;
  drive_file_id: string;
  drive_url: string;
  drive_folder: string | null;
  is_current: boolean;
  tags: string[] | null;
  source_type: 'upload' | 'gmail_attachment' | 'drive_file' | 'url';
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

// Confirmed via the Task 17 Phase A live audit — existing GCI_MASTER_LIBRARY
// / 00_Inbox_To_Sort. No large-scale reorg of old files this round; every
// GIA upload lands here until a later step defines finer routing.
export const DEFAULT_TARGET_FOLDER_ID = '1wbJGE0M9SWWXL6flS5pQtNZzbxKwJbxm';
export const DEFAULT_TARGET_FOLDER_NAME = '00_Inbox_To_Sort';

const DOC_TYPE_RULES: { type: string; label: string; keywords: string[] }[] = [
  { type: 'license', label: '营业执照', keywords: ['营业执照', '执照', 'license', 'trade license'] },
  { type: 'vat_trn', label: 'VAT/TRN 税务登记', keywords: ['vat', 'trn', '税务登记', '增值税'] },
  { type: 'company_profile', label: '公司简介', keywords: ['公司简介', 'company profile'] },
  { type: 'catalog', label: '产品目录', keywords: ['产品目录', '目录', 'catalog', 'catalogue'] },
  { type: 'contract_template', label: '合同模板', keywords: ['合同模板', 'contract template'] },
  { type: 'quote_template', label: '报价模板', keywords: ['报价模板', 'quote template', 'quotation template'] },
  { type: 'agreement', label: '服务/佣金协议', keywords: ['服务协议', '佣金协议', 'agreement', 'commission agreement'] },
  { type: 'brand_asset', label: 'Logo/抬头纸', keywords: ['logo', 'letterhead', '抬头纸'] },
  { type: 'bank_details', label: '银行资料', keywords: ['银行资料', '银行账户', 'bank details', 'bank account'] },
  { type: 'quotation', label: '报价单', keywords: ['报价单', '报价', 'quotation', 'quote'] },
  { type: 'proposal', label: '方案', keywords: ['方案', 'proposal'] },
];

export interface FileClassification {
  documentType: string;
  documentTypeLabel: string;
  companyName: string | null;
  businessArea: string | null;
  displayName: string;
  tags: string[];
}

// Rule-based only — no AI/full-text call. If Chris already said what the
// file is, classify straight from his words; only filename is used as a
// secondary signal, never file content.
export function classifyFileDescription(description: string, fileName: string): FileClassification {
  const text = `${description} ${fileName}`;
  const matched = DOC_TYPE_RULES.find((r) => r.keywords.some((k) => text.toLowerCase().includes(k.toLowerCase())));
  const documentType = matched?.type ?? 'other';
  const documentTypeLabel = matched?.label ?? '其他';

  const companyName = extractCompanyName(description) || extractCompanyName(fileName);
  const businessArea = /workforce|保姆|工人|劳务/i.test(text) ? 'WORKFORCE'
    : /trade|贸易|进出口/i.test(text) ? 'TRADE'
    : /25h[_-]?ai/i.test(text) ? '25H_AI'
    : /行政|admin|公司资料|公司文件/i.test(text) ? 'COMPANY_ADMIN'
    : null;

  const displayName = description.trim() || fileName;
  const tags = [documentTypeLabel, companyName].filter((v): v is string => Boolean(v));

  return { documentType, documentTypeLabel, companyName, businessArea, displayName, tags };
}

const KNOWN_COMPANIES = ['GCI', 'Highway', 'iCare', 'Velora', 'ORICA', 'MAG'];
export function extractCompanyName(text: string): string | null {
  for (const c of KNOWN_COMPANIES) {
    if (text.toLowerCase().includes(c.toLowerCase())) return c;
  }
  const m = text.match(/[A-Z][a-zA-Z0-9&]{2,}/);
  return m ? m[0] : null;
}

export async function createFolderIfMissing(
  name: string,
  parentId: string,
): Promise<{ ok: true; folderId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/google/drive-create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'Create folder failed' };
    return { ok: true, folderId: data.folder.id };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export async function uploadFileToDrive(
  file: File,
  targetFolderId: string,
  fileName: string,
): Promise<{ ok: true; fileId: string; webViewLink: string; parentId: string | null } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('targetFolderId', targetFolderId);
    form.append('fileName', fileName);
    const res = await fetch('/api/google/drive-upload-file', { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'Upload failed' };
    // api/google/drive-upload-file.ts already requests `parents` in its
    // Drive API fields projection — this was previously just discarded
    // here. Reading it through is what lets callers verify where a file
    // ACTUALLY landed instead of trusting the pre-upload target id.
    const parents: string[] | undefined = data.file?.parents;
    const parentId = Array.isArray(parents) && parents.length > 0 ? parents[0] : null;
    return { ok: true, fileId: data.file.id, webViewLink: data.file.webViewLink, parentId };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Resolves a folder id to its real, current Drive name — used to verify the
// actual parent a file landed in after upload (see uploadAndRegisterLocalFile
// below). Reuses drive-list-folder.ts's existing ?fileId= mode, unchanged
// except for the `parents` field it now also returns.
export async function getDriveFolderName(folderId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/google/drive-list-folder?fileId=${encodeURIComponent(folderId)}`);
    const data = await res.json();
    if (!data.ok || !data.results?.[0]) return null;
    return data.results[0].name ?? null;
  } catch {
    return null;
  }
}

export async function findCurrentRegistryEntry(documentType: string, companyName: string | null): Promise<GiaFileRegistryRow | null> {
  let query = supabase.from('gia_file_registry').select('*').eq('document_type', documentType).eq('is_current', true);
  if (companyName) query = query.eq('company_name', companyName);
  const { data } = await query.limit(1).maybeSingle();
  return (data as GiaFileRegistryRow) || null;
}

export async function registerFile(row: {
  fileName: string; displayName: string; documentType: string; businessArea: string | null;
  companyName: string | null; customerId: string | null; driveFileId: string; driveUrl: string;
  driveFolder: string | null; isCurrent: boolean; tags: string[];
  sourceType?: 'upload' | 'gmail_attachment' | 'drive_file' | 'url'; sourceRef?: string | null;
}): Promise<{ ok: true; row: GiaFileRegistryRow } | { ok: false; error: string }> {
  if (row.isCurrent) {
    const existing = await findCurrentRegistryEntry(row.documentType, row.companyName);
    if (existing) {
      await supabase.from('gia_file_registry').update({ is_current: false, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
  }
  const { data, error } = await supabase.from('gia_file_registry').insert({
    file_name: row.fileName,
    display_name: row.displayName,
    document_type: row.documentType,
    business_area: row.businessArea,
    company_name: row.companyName,
    customer_id: row.customerId,
    drive_file_id: row.driveFileId,
    drive_url: row.driveUrl,
    drive_folder: row.driveFolder,
    is_current: row.isCurrent,
    tags: row.tags,
    source_type: row.sourceType ?? 'upload',
    source_ref: row.sourceRef ?? null,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as GiaFileRegistryRow };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// GIA Multi-Source File Intake — deterministic, no AI call. Resolves the
// two sources that are unambiguous from raw chat text alone (a literal
// URL, a literal Drive link). Gmail-attachment intake was removed with the
// rest of GCI/GIA's email capability (final product decision) — file
// intake now covers upload/URL/existing-Drive-file only.
const URL_RE = /https?:\/\/[^\s，,。]+/i;
const DRIVE_FILE_RE = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/i;

export function detectFileSource(text: string): { type: 'drive_file'; ref: string } | { type: 'url'; ref: string } | null {
  const driveMatch = text.match(DRIVE_FILE_RE);
  if (driveMatch) return { type: 'drive_file', ref: driveMatch[1] };
  const urlMatch = text.match(URL_RE);
  if (urlMatch) return { type: 'url', ref: urlMatch[0].replace(/[)\]}>,.;]+$/, '') };
  return null;
}

// Registers an already-in-Drive file in place — no download, no re-upload,
// no duplicate. Uses the drive-list-folder.ts fileId= metadata mode.
export async function registerExistingDriveFile(
  fileId: string,
  classification: FileClassification,
  customerId: string | null,
): Promise<{ ok: true; row: GiaFileRegistryRow } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/google/drive-list-folder?fileId=${encodeURIComponent(fileId)}`);
    const data = await res.json();
    if (!data.ok || !data.results?.[0]) return { ok: false, error: data.error || '未找到该 Drive 文件' };
    const file = data.results[0];
    return registerFile({
      fileName: file.name,
      displayName: classification.displayName || file.name,
      documentType: classification.documentType,
      businessArea: classification.businessArea,
      companyName: classification.companyName,
      customerId,
      driveFileId: file.id,
      driveUrl: file.webViewLink,
      driveFolder: null, // already lives wherever it already lived in Drive
      isCurrent: true,
      tags: classification.tags,
      sourceType: 'drive_file',
      sourceRef: fileId,
    });
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Fetches an explicitly-given URL server-side, then reuses the existing
// upload+register pipeline unchanged.
export async function fetchAndStoreFromUrl(
  url: string,
  classification: FileClassification,
  customerId: string | null,
): Promise<{ ok: true; row: GiaFileRegistryRow } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/files/fetch-url?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'URL 下载失败' };
    const blob = base64ToBlob(data.data, data.mimeType);
    const fileName = classification.displayName || data.suggestedName || 'downloaded-file';
    const file = new File([blob], fileName, { type: data.mimeType });
    const uploaded = await uploadFileToDrive(file, DEFAULT_TARGET_FOLDER_ID, fileName);
    if (!uploaded.ok) return uploaded;
    return registerFile({
      fileName,
      displayName: classification.displayName || fileName,
      documentType: classification.documentType,
      businessArea: classification.businessArea,
      companyName: classification.companyName,
      customerId,
      driveFileId: uploaded.fileId,
      driveUrl: uploaded.webViewLink,
      driveFolder: DEFAULT_TARGET_FOLDER_NAME,
      isCurrent: true,
      tags: classification.tags,
      sourceType: 'url',
      sourceRef: url,
    });
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export interface DriveFolderOption {
  id: string;
  name: string;
  webViewLink: string;
}

// Real Drive folder search — reuses drive-search.ts (the same tiered
// name/fullText relevance query every other Ask GCI file lookup already
// uses), filtered client-side to folders only. No new Drive endpoint, no
// AI: this is the same "找文件" search capability, just scoped to folders,
// used both by the upload preview card's folder picker and by parsing a
// chat sentence like "这个传到劳务文件夹" while a file is pending.
export async function searchDriveFolders(query: string): Promise<DriveFolderOption[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`/api/google/drive-search?q=${encodeURIComponent(q)}&max=10`);
    const data = await res.json();
    if (!data.ok) return [];
    return (data.results || [])
      .filter((r: any) => r.mimeType === 'application/vnd.google-apps.folder')
      .map((r: any) => ({ id: r.id, name: r.name, webViewLink: r.webViewLink }));
  } catch {
    return [];
  }
}

// GIA Home local file upload entry point — a browser File the user picked
// via a native file-select dialog or drag & drop (not chat text, not a
// URL/Drive link). Deliberately skips classifyFileDescription(): no AI, no
// rule-based classification, no business-area/company guess — this is a
// direct tool action the user explicitly triggered, not something for
// Planner/GIA to interpret. targetFolder defaults to the existing GIA
// intake folder; the caller may pass a real Drive folder the user picked
// or named in chat (see searchDriveFolders above) — this file never
// guesses a Customers/Suppliers/Contracts-style destination on its own.
// isCurrent is always false here (unlike fetchAndStoreFromUrl) because
// there's no real (documentType, companyName) pair to group by — both are
// unclassified — so this must never demote an unrelated file's "current"
// flag. Same uploadFileToDrive()/registerFile() pipeline as every other
// intake source; no second upload service.
export async function uploadAndRegisterLocalFile(
  file: File,
  targetFolder: { id: string; name: string } = { id: DEFAULT_TARGET_FOLDER_ID, name: DEFAULT_TARGET_FOLDER_NAME },
): Promise<{ ok: true; row: GiaFileRegistryRow; actualFolderName: string } | { ok: false; error: string }> {
  const uploaded = await uploadFileToDrive(file, targetFolder.id, file.name);
  if (!uploaded.ok) return uploaded;
  // Verify where the file actually landed rather than trusting the
  // pre-upload target: Drive's own upload response (parentId) is the source
  // of truth, not the client's selection. Falls back to targetFolder.name
  // only if the parent lookup itself fails (e.g. a transient read error) —
  // never fabricated, and only ever used when the real parentId lookup
  // couldn't be completed.
  const actualFolderName = uploaded.parentId
    ? (await getDriveFolderName(uploaded.parentId)) ?? targetFolder.name
    : targetFolder.name;
  const registered = await registerFile({
    fileName: file.name,
    displayName: file.name,
    documentType: 'other',
    businessArea: null,
    companyName: null,
    customerId: null,
    driveFileId: uploaded.fileId,
    driveUrl: uploaded.webViewLink,
    driveFolder: actualFolderName,
    isCurrent: false,
    tags: [],
    sourceType: 'upload',
    sourceRef: null,
  });
  if (!registered.ok) return registered;
  return { ok: true, row: registered.row, actualFolderName };
}

// Rule-based search — matches a recognized document type and/or a known
// company name in the query text, never a raw fuzzy substring search over
// the whole sentence (keeps false-positive noise out, keeps this a no-op
// when nothing recognizable is present so it never hijacks unrelated chat).
export async function searchFileRegistryByQuery(text: string): Promise<GiaFileRegistryRow[]> {
  const rule = DOC_TYPE_RULES.find((r) => r.keywords.some((k) => text.toLowerCase().includes(k.toLowerCase())));
  const company = extractCompanyName(text);
  if (!rule && !company) return [];

  let query = supabase.from('gia_file_registry').select('*');
  if (rule) query = query.eq('document_type', rule.type);
  if (company) query = query.eq('company_name', company);
  const { data } = await query.order('is_current', { ascending: false }).order('created_at', { ascending: false }).limit(10);
  return (data as GiaFileRegistryRow[]) || [];
}

// Drive fallback (per Task 17 §6 priority: Registry → Drive) when nothing
// registered yet matches. Read-only, drive.readonly — same endpoint the
// existing Ask GCI file lookups already use.
export async function searchDriveFallback(text: string): Promise<{ id: string; name: string; webViewLink: string }[]> {
  const rule = DOC_TYPE_RULES.find((r) => r.keywords.some((k) => text.toLowerCase().includes(k.toLowerCase())));
  const company = extractCompanyName(text);
  const q = [company, rule?.label].filter(Boolean).join(' ');
  if (!q) return [];
  try {
    const res = await fetch(`/api/google/drive-search?q=${encodeURIComponent(q)}&max=5`);
    const data = await res.json();
    if (!data.ok) return [];
    return data.results || [];
  } catch {
    return [];
  }
}

// Trigger for the chat-first "find a file" flow — requires an explicit
// seeking cue (找/查找/查一下/搜索/要/需要) near a recognized document-type
// word, e.g. "找Highway最新营业执照" / "客户要产品目录" / "Ray上次报价在哪里".
// Deliberately narrow: callers only treat this as consumed when a search
// actually returns a result, so an accidental keyword match on unrelated
// chat (e.g. "要" in some other sentence) is harmless — it just falls
// through to normal capture/AI chat handling.
const FILE_SEEK_RE = /(找|查找|查一下|搜索|要|需要).{0,20}(执照|许可证|vat|trn|税务登记|简介|profile|目录|catalog|合同模板|报价模板|协议|agreement|logo|letterhead|银行资料|报价|方案|proposal|quotation)/i;

export function looksLikeFileSeek(text: string): boolean {
  return FILE_SEEK_RE.test(text);
}
