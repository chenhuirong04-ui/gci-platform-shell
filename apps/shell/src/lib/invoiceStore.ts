import type { BillingProfile, InvoiceDraft, InvoiceStatus } from '../types/invoice';

// ── Storage keys ──────────────────────────────────────────────────────────────
const PROFILES_KEY = 'GCI_BILLING_PROFILES_V1';
const DRAFTS_KEY   = 'GCI_INVOICE_DRAFTS_V1';

// ── Notion integration stubs ──────────────────────────────────────────────────
// TODO: When Notion is configured, replace these with actual API calls.
// Database IDs should be stored in environment variables:
//   VITE_NOTION_INVOICE_CUSTOMERS_DB_ID=<your-db-id>
//   VITE_NOTION_INVOICE_DRAFTS_DB_ID=<your-db-id>
// Use the existing Make.com → Notion webhook pattern already in the project.
// Do NOT call Notion directly from the browser — route through a secure backend.
// async function notionCreateProfile(profile: BillingProfile) { /* TODO */ }
// async function notionCreateDraft(draft: InvoiceDraft)       { /* TODO */ }
// async function notionUpdateDraft(id: string, patch: Partial<InvoiceDraft>) { /* TODO */ }

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') || []; }
  catch { return []; }
}
function safeSet(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* storage full */ }
}
function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Billing Profile CRUD ──────────────────────────────────────────────────────
export function getProfiles(): BillingProfile[] {
  return safeGet<BillingProfile>(PROFILES_KEY)
    .filter(p => p.status !== 'inactive');
}

export function getAllProfiles(): BillingProfile[] {
  return safeGet<BillingProfile>(PROFILES_KEY);
}

export function saveProfile(
  data: Omit<BillingProfile, 'id' | 'createdAt' | 'updatedAt'>
): BillingProfile {
  const all = safeGet<BillingProfile>(PROFILES_KEY);
  const now = new Date().toISOString();
  const record: BillingProfile = { ...data, id: uid(), createdAt: now, updatedAt: now };
  safeSet(PROFILES_KEY, [...all, record]);
  // TODO: notionCreateProfile(record)
  return record;
}

export function updateProfile(id: string, patch: Partial<BillingProfile>): BillingProfile | null {
  const all = safeGet<BillingProfile>(PROFILES_KEY);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const updated: BillingProfile = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  safeSet(PROFILES_KEY, all);
  // TODO: notionUpdateProfile(updated.notionPageId, patch)
  return updated;
}

// ── Invoice Draft CRUD ────────────────────────────────────────────────────────
export function getDrafts(): InvoiceDraft[] {
  return safeGet<InvoiceDraft>(DRAFTS_KEY);
}

export function getDraftById(id: string): InvoiceDraft | null {
  return getDrafts().find(d => d.id === id) ?? null;
}

function nextInvoiceNo(): string {
  const drafts = safeGet<InvoiceDraft>(DRAFTS_KEY);
  const nums = drafts
    .map(d => parseInt(d.invoiceNo.replace(/^INV-0*/, ''), 10))
    .filter(n => !isNaN(n));
  // Last known issued invoice is INV-000143; start from 144 for new drafts
  const max = nums.length ? Math.max(...nums) : 143;
  return `INV-${String(max + 1).padStart(6, '0')}`;
}

export function saveDraft(
  data: Omit<InvoiceDraft, 'id' | 'invoiceNo' | 'createdAt'>
): InvoiceDraft {
  const all = safeGet<InvoiceDraft>(DRAFTS_KEY);
  const now = new Date().toISOString();
  const record: InvoiceDraft = {
    ...data,
    id: uid(),
    invoiceNo: nextInvoiceNo(),
    createdAt: now,
  };
  safeSet(DRAFTS_KEY, [...all, record]);
  // TODO: notionCreateDraft(record)
  return record;
}

export function updateDraft(id: string, patch: Partial<InvoiceDraft>): InvoiceDraft | null {
  const all = safeGet<InvoiceDraft>(DRAFTS_KEY);
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  safeSet(DRAFTS_KEY, all);
  // TODO: notionUpdateDraft(all[idx].notionPageId, patch)
  return all[idx];
}

export function updateDraftStatus(id: string, status: InvoiceStatus): InvoiceDraft | null {
  const patch: Partial<InvoiceDraft> = { status };
  if (status === 'approved') patch.approvedAt = new Date().toISOString();
  return updateDraft(id, patch);
}

// Stamp last invoice date on billing profile when a draft is saved/approved
export function stampLastInvoiceDate(billingProfileId: string) {
  updateProfile(billingProfileId, { lastInvoiceDate: new Date().toISOString().split('T')[0] });
}
