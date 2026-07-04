// ── GCI Invoice Store ─────────────────────────────────────────────────────────
// PRIMARY storage: Supabase (invoice_billing_profiles + invoice_drafts tables).
// Shared across Dubai and China team members — all authenticated users see the
// same data in real time.
//
// FALLBACK: localStorage is used ONLY if Supabase is unreachable (network error,
// misconfiguration). localStorage is NOT the source of truth for production use.
// Any data written to the fallback is local to that browser and NOT shared.

import { supabase } from './supabase';
import type { BillingProfile, InvoiceDraft, InvoiceStatus } from '../types/invoice';

// Fallback localStorage keys — clearly labelled as fallback
const LS_PROFILES = 'GCI_INVOICE_PROFILES_FALLBACK_V1';
const LS_DRAFTS   = 'GCI_INVOICE_DRAFTS_FALLBACK_V1';

// ── Cloud health state ────────────────────────────────────────────────────────
let _cloudOk: boolean | null = null;

export function getCloudStatus(): 'connected' | 'fallback' | 'unknown' {
  if (_cloudOk === true)  return 'connected';
  if (_cloudOk === false) return 'fallback';
  return 'unknown';
}

// ── Supabase row → TypeScript type mappers ────────────────────────────────────
// Supabase columns are snake_case; our TypeScript types are camelCase.

function mapProfile(row: Record<string, any>): BillingProfile {
  return {
    id:                   row.id,
    customerName:         row.customer_name,
    billingName:          row.billing_name          ?? '',
    billingAddress:       row.billing_address       ?? '',
    phone:                row.phone                 ?? '',
    email:                row.email                 ?? '',
    trn:                  row.trn                   ?? '',
    country:              row.country               ?? 'UAE',
    city:                 row.city                  ?? 'Dubai',
    defaultCurrency:      row.default_currency      ?? 'AED',
    defaultVatRate:       Number(row.default_vat_rate ?? 5),
    defaultPaymentTerms:  row.default_payment_terms ?? '',
    notes:                row.notes                 ?? '',
    status:               row.status                ?? 'active',
    lastInvoiceDate:      row.last_invoice_date     ?? undefined,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
    createdBy:            row.created_by            ?? undefined,
  };
}

function mapDraft(row: Record<string, any>): InvoiceDraft {
  return {
    id:               row.id,
    invoiceNo:        row.invoice_no,
    customerName:     row.customer_name,
    billingProfileId: row.billing_profile_id  ?? undefined,
    billTo:           row.bill_to             ?? {},
    invoiceDate:      row.invoice_date,
    dueDate:          row.due_date,
    currency:         row.currency            ?? 'AED',
    items:            row.items               ?? [],
    subtotal:         Number(row.subtotal     ?? 0),
    vatRate:          Number(row.vat_rate     ?? 5),
    vatAmount:        Number(row.vat_amount   ?? 0),
    total:            Number(row.total        ?? 0),
    paymentTerms:     row.payment_terms       ?? '',
    otherComments:    row.other_comments      ?? '',
    relatedPI:        row.related_pi          ?? '',
    relatedQuotation: row.related_quotation   ?? '',
    relatedOrder:     row.related_order       ?? '',
    status:           row.status              ?? 'draft',
    pdfUrl:           row.pdf_url             ?? undefined,
    notes:            row.notes               ?? '',
    createdAt:        row.created_at,
    approvedAt:       row.approved_at         ?? undefined,
    createdBy:        row.created_by          ?? undefined,
    approvedBy:       row.approved_by         ?? undefined,
  };
}

// ── localStorage fallback helpers ─────────────────────────────────────────────
// localStorage is fallback only. Cloud database is required for production
// invoice usage. Data written here is NOT visible to other team members.

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') || []; }
  catch { return []; }
}
function lsSet(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* storage full — silently skip */ }
}
function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Billing Profiles ──────────────────────────────────────────────────────────

export async function getProfiles(): Promise<BillingProfile[]> {
  const { data, error } = await supabase
    .from('invoice_billing_profiles')
    .select('*')
    .neq('status', 'archived')
    .order('customer_name', { ascending: true });

  if (error || !data) {
    _cloudOk = false;
    console.warn('[invoiceStore] Supabase profiles read failed — using localStorage fallback. Data is NOT shared.', error?.message);
    return lsGet<BillingProfile>(LS_PROFILES);
  }

  _cloudOk = true;
  return data.map(mapProfile);
}

export async function saveProfile(
  data: Omit<BillingProfile, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string,
): Promise<BillingProfile> {
  const row = {
    customer_name:         data.customerName,
    billing_name:          data.billingName,
    billing_address:       data.billingAddress,
    phone:                 data.phone,
    email:                 data.email,
    trn:                   data.trn,
    country:               data.country,
    city:                  data.city,
    default_currency:      data.defaultCurrency,
    default_vat_rate:      data.defaultVatRate,
    default_payment_terms: data.defaultPaymentTerms,
    notes:                 data.notes,
    status:                data.status,
    last_invoice_date:     data.lastInvoiceDate ?? null,
    created_by:            userId ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('invoice_billing_profiles')
    .insert(row)
    .select()
    .single();

  if (error || !inserted) {
    _cloudOk = false;
    console.warn('[invoiceStore] Supabase profile insert failed — saving to localStorage fallback. This record will NOT be visible to other team members.', error?.message);
    const now = new Date().toISOString();
    const fallback: BillingProfile = { ...data, id: uid(), createdAt: now, updatedAt: now };
    lsSet(LS_PROFILES, [...lsGet<BillingProfile>(LS_PROFILES), fallback]);
    return fallback;
  }

  _cloudOk = true;
  return mapProfile(inserted);
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<BillingProfile, 'customerName' | 'billingName' | 'billingAddress' | 'phone' | 'email' | 'trn' | 'status' | 'lastInvoiceDate'>>,
): Promise<BillingProfile | null> {
  const row: Record<string, any> = {};
  if (patch.customerName   !== undefined) row.customer_name    = patch.customerName;
  if (patch.billingName    !== undefined) row.billing_name     = patch.billingName;
  if (patch.billingAddress !== undefined) row.billing_address  = patch.billingAddress;
  if (patch.phone          !== undefined) row.phone            = patch.phone;
  if (patch.email          !== undefined) row.email            = patch.email;
  if (patch.trn            !== undefined) row.trn              = patch.trn;
  if (patch.status         !== undefined) row.status           = patch.status;
  if (patch.lastInvoiceDate !== undefined) row.last_invoice_date = patch.lastInvoiceDate ?? null;

  const { data, error } = await supabase
    .from('invoice_billing_profiles')
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.warn('[invoiceStore] Supabase profile update failed', error?.message);
    return null;
  }
  return mapProfile(data);
}

export async function stampLastInvoiceDate(billingProfileId: string): Promise<void> {
  await updateProfile(billingProfileId, {
    lastInvoiceDate: new Date().toISOString().split('T')[0],
  });
}

// Check for existing profile by TRN (exact) or customer_name (case-insensitive).
// TRN takes priority — it is the most reliable unique identifier.
export async function checkDuplicateProfile(
  customerName: string,
  trn: string,
): Promise<BillingProfile | null> {
  if (trn.trim()) {
    const { data } = await supabase
      .from('invoice_billing_profiles')
      .select('*')
      .eq('trn', trn.trim())
      .limit(1);
    if (data && data.length > 0) return mapProfile(data[0]);
  }
  if (customerName.trim()) {
    const { data } = await supabase
      .from('invoice_billing_profiles')
      .select('*')
      .ilike('customer_name', customerName.trim())
      .limit(1);
    if (data && data.length > 0) return mapProfile(data[0]);
  }
  return null;
}

// ── Invoice Drafts ────────────────────────────────────────────────────────────

export async function getDrafts(): Promise<InvoiceDraft[]> {
  const { data, error } = await supabase
    .from('invoice_drafts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    _cloudOk = false;
    console.warn('[invoiceStore] Supabase drafts read failed — using localStorage fallback. Data is NOT shared.', error?.message);
    return lsGet<InvoiceDraft>(LS_DRAFTS);
  }

  _cloudOk = true;
  return data.map(mapDraft);
}

async function nextInvoiceNo(): Promise<string> {
  const { data } = await supabase
    .from('invoice_drafts')
    .select('invoice_no')
    .order('created_at', { ascending: false });

  const nums = (data ?? [])
    .map((r: any) => parseInt(String(r.invoice_no).replace(/^INV-0*/, ''), 10))
    .filter((n: number) => !isNaN(n));

  // Last known issued invoice is INV-000143; first draft starts at INV-000144
  const max = nums.length ? Math.max(...nums) : 143;
  return `INV-${String(max + 1).padStart(6, '0')}`;
}

export async function saveDraft(
  data: Omit<InvoiceDraft, 'id' | 'invoiceNo' | 'createdAt'>,
  userId?: string,
): Promise<InvoiceDraft> {
  const invoiceNo = await nextInvoiceNo();

  const row = {
    invoice_no:         invoiceNo,
    customer_name:      data.customerName,
    billing_profile_id: data.billingProfileId ?? null,
    bill_to:            data.billTo,
    invoice_date:       data.invoiceDate,
    due_date:           data.dueDate,
    currency:           data.currency,
    items:              data.items,
    subtotal:           data.subtotal,
    vat_rate:           data.vatRate,
    vat_amount:         data.vatAmount,
    total:              data.total,
    payment_terms:      data.paymentTerms,
    other_comments:     data.otherComments,
    related_pi:         data.relatedPI         ?? '',
    related_quotation:  data.relatedQuotation  ?? '',
    related_order:      data.relatedOrder      ?? '',
    status:             data.status,
    notes:              data.notes,
    created_by:         userId ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('invoice_drafts')
    .insert(row)
    .select()
    .single();

  if (error || !inserted) {
    _cloudOk = false;
    console.warn('[invoiceStore] Supabase draft insert failed — saving to localStorage fallback. This record will NOT be visible to other team members.', error?.message);
    const now = new Date().toISOString();
    const fallback: InvoiceDraft = { ...data, id: uid(), invoiceNo, createdAt: now };
    lsSet(LS_DRAFTS, [...lsGet<InvoiceDraft>(LS_DRAFTS), fallback]);
    return fallback;
  }

  _cloudOk = true;
  return mapDraft(inserted);
}

export async function updateDraftStatus(
  id: string,
  status: InvoiceStatus,
  userId?: string,
): Promise<InvoiceDraft | null> {
  const patch: Record<string, any> = { status };
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
    if (userId) patch.approved_by = userId;
  }

  const { data, error } = await supabase
    .from('invoice_drafts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.warn('[invoiceStore] Supabase status update failed', error?.message);
    return null;
  }
  return mapDraft(data);
}
