/**
 * Finance Bookkeeping & Reconciliation V1 (2026-09-15) — data layer for the
 * two intake pipelines (银行对账 / 凭证录入). See
 * supabase/migrations/20260915_finance_bookkeeping_v1.sql for the schema.
 *
 * "AI只能建议，不能未经确认直接入正式账" — nothing in this file writes to
 * `transactions` or `supplier_payables` on its own; every confirm* function
 * is called only from an explicit user click in the UI, after the user has
 * reviewed/edited the AI's suggestion.
 */
import { supabase } from '../../../apps/shell/src/lib/supabase';
import { persistence } from './persistenceService';
import { roundTo2 } from './currencyUtils';
import { supplierPayablesService } from './supplierPayablesService';
import type { TransactionRecord, SupplierPayable, BankStatementImport, BankStatementLine, FinanceVoucher } from '../types';

const BUCKET = 'finance-documents';

function safeExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : '';
}

export async function uploadFinanceFile(folder: string, file: File): Promise<{ path: string; error: string | null }> {
  const path = `${folder}/${crypto.randomUUID()}${safeExtension(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  return { path, error: error ? error.message : null };
}

export async function getFinanceFileSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** SHA-256 of the file's raw bytes — used to block re-importing the exact
 * same statement file against the same bank account (see
 * bank_statement_imports.file_hash + its UNIQUE(bank_account_id, file_hash)
 * constraint in the migration). Web Crypto, no library needed. */
export async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Category suggestion (client-side, deterministic keyword match — never
// a silent write, only ever pre-fills a dropdown the user must confirm) ──
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['PAYROLL', ['salary', 'payroll', 'wage', '工资', '薪资']],
  ['BANK_CHARGES', ['bank charge', 'fee', 'commission', 'swift', '手续费']],
  ['GOVERNMENT_FEES', ['government', 'license', 'immigration', 'visa fee', 'moh', 'dubai municipality', '政府', '签证费']],
  ['TRANSPORT', ['fuel', 'petrol', 'taxi', 'uber', 'careem', 'transport', '交通', '油费']],
  ['ACCOMMODATION', ['hotel', 'rent', 'accommodation', '住宿', '房租']],
  ['FOOD', ['restaurant', 'cafe', 'food', 'grocery', '餐', '咖啡']],
  ['OFFICE', ['office', 'stationery', 'supplies', '办公']],
  ['MARKETING', ['marketing', 'advertis', 'ads', '广告', '市场']],
  ['REFUND', ['refund', 'reversal', '退款']],
];

/** Suggests a category from a raw description string — 'in'/'out' narrows
 * which list is searched. Returns null when nothing matches (never forces
 * a guess into OTHER_INCOME/OTHER_EXPENSE — the UI's own fallback handles
 * that at render time). */
export function suggestCategoryFromDescription(description: string, direction: 'in' | 'out'): string | null {
  const d = (description || '').toLowerCase();
  if (direction === 'out') {
    for (const [cat, keywords] of CATEGORY_KEYWORDS) {
      if (keywords.some(k => d.includes(k))) return cat;
    }
    if (d.includes('supplier') || d.includes('供应商')) return 'SUPPLIER_PAYMENT';
    return null;
  }
  if (d.includes('capital') || d.includes('injection') || d.includes('注资')) return 'CAPITAL_INJECTION';
  if (d.includes('loan') || d.includes('贷款')) return 'LOAN_PROCEEDS';
  if (d.includes('transfer') || d.includes('转账')) return 'INTERNAL_TRANSFER';
  return null;
}

/** Simple substring fuzzy match against an already-loaded {id, name} list —
 * a suggestion only, the UI always shows it as an editable/overridable pick,
 * never auto-assigns the id. */
export function fuzzyMatchByName<T extends { id: string }>(
  name: string | null | undefined,
  candidates: T[],
  getName: (c: T) => string
): T | null {
  if (!name || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  return candidates.find(c => {
    const cn = getName(c).toLowerCase();
    return cn && (cn.includes(n) || n.includes(cn));
  }) || null;
}

// ── CSV statement parsing (client-side, no AI needed for structured
// exports) — lenient column auto-detect for common bank export shapes:
// Date / Description(-ish) / Amount(-ish, signed) OR Date/Description/Debit/Credit. ──
export interface ParsedStatementLine {
  date: string | null;
  direction: 'in' | 'out' | null;
  amount: number;
  description: string;
}

export function parseStatementCsv(csvText: string): ParsedStatementLine[] {
  const rows = csvText.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  if (rows.length < 2) return [];
  const splitRow = (r: string) => r.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const header = splitRow(rows[0]).map(h => h.toLowerCase());

  const dateIdx = header.findIndex(h => h.includes('date'));
  const descIdx = header.findIndex(h => h.includes('desc') || h.includes('narration') || h.includes('memo') || h.includes('particular'));
  const amountIdx = header.findIndex(h => h === 'amount' || h.includes('amount'));
  const debitIdx = header.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
  const creditIdx = header.findIndex(h => h.includes('credit') || h.includes('deposit'));

  const lines: ParsedStatementLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = splitRow(rows[i]);
    const date = dateIdx >= 0 ? (cols[dateIdx] || null) : null;
    const description = descIdx >= 0 ? (cols[descIdx] || '') : cols.join(' ');

    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? Number(cols[debitIdx]?.replace(/[^0-9.-]/g, '')) || 0 : 0;
      const credit = creditIdx >= 0 ? Number(cols[creditIdx]?.replace(/[^0-9.-]/g, '')) || 0 : 0;
      if (debit > 0) lines.push({ date, direction: 'out', amount: roundTo2(debit), description });
      else if (credit > 0) lines.push({ date, direction: 'in', amount: roundTo2(credit), description });
      continue;
    }
    if (amountIdx >= 0) {
      const raw = Number(cols[amountIdx]?.replace(/[^0-9.-]/g, ''));
      if (!raw) continue;
      lines.push({ date, direction: raw < 0 ? 'out' : 'in', amount: roundTo2(Math.abs(raw)), description });
    }
  }
  return lines;
}

// ── Confirm actions — the only place AI suggestions become real records ──
//
// Bank statement lines specifically go through atomic Postgres RPCs
// (confirm_bank_statement_line / match_bank_statement_line — see the
// migration) instead of a plain client INSERT/UPDATE, so a double-click or
// duplicate request can never produce two transactions from the same line:
// each RPC's UPDATE ... WHERE status = 'pending' is the atomic claim — only
// the first caller to reach it sees status still 'pending' and proceeds;
// every other concurrent/repeated call finds 0 rows matched and raises,
// never creating a second transaction. The RPC also reads
// date/amount/direction/bank_account_id/attachment straight off the
// bank_statement_lines row server-side rather than trusting whatever the
// client resends, same "never trust client-resolved values" principle as
// create_supplier_payment().

export interface ConfirmBankLineInput {
  lineId: string;
  category: string;
  subcategory?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  projectId?: string;
}

/** Atomically confirms exactly one pending bank statement line into a new
 * transaction — see the header comment above. Throws if the line is no
 * longer pending (already confirmed/matched/ignored by this or another
 * request). Returns the new transaction's business id. */
export async function confirmBankLineAsTransaction(input: ConfirmBankLineInput): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_bank_statement_line', {
    p_line_id: input.lineId,
    p_category: input.category,
    p_subcategory: input.subcategory || null,
    p_customer_id: input.customerId || null,
    p_customer_name: input.customerName || null,
    p_supplier_id: input.supplierId || null,
    p_supplier_name: input.supplierName || null,
    p_project_id: input.projectId || null,
  });
  if (error) throw new Error(error.message || '入账失败，请重试。');
  return data as string;
}

/** Atomically links a pending bank statement line to an EXISTING
 * transaction instead of creating a new one — same idempotency guarantee
 * as confirmBankLineAsTransaction (the RPC's WHERE status='pending' claim). */
export async function matchBankStatementLine(lineId: string, matchedTransactionRef: string): Promise<void> {
  const { error } = await supabase.rpc('match_bank_statement_line', {
    p_line_id: lineId,
    p_matched_transaction_ref: matchedTransactionRef,
  });
  if (error) throw new Error(error.message || '关联失败，请重试。');
}

/** Date-proximity scoring for "关联已有 transaction" suggestions — account/
 * direction/amount stay hard filters (done by the caller); this only grades
 * how close the dates are. Never used to auto-match, only to rank/label
 * suggestions the user still has to click. */
export type DateMatchTier = 'same_day' | 'within_1_day' | 'within_3_days';
export function dateMatchTier(dateA: string | null | undefined, dateB: string | null | undefined): DateMatchTier | null {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diffDays = Math.round(Math.abs(a - b) / 86400000);
  if (diffDays === 0) return 'same_day';
  if (diffDays <= 1) return 'within_1_day';
  if (diffDays <= 3) return 'within_3_days';
  return null; // > 3 days — never suggested
}

export interface ConfirmVoucherAsTransactionInput {
  direction: 'in' | 'out';
  date: string;
  amount: number;
  description: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  bankAccountId?: string;
  category: string;
  subcategory?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  projectId?: string;
  attachmentPath: string;
  attachmentFileName: string;
}

export async function confirmVoucherAsTransaction(input: ConfirmVoucherAsTransactionInput): Promise<TransactionRecord> {
  const txn: TransactionRecord = {
    id: `TXN-${Date.now()}`,
    date: input.date,
    note: input.description || 'Voucher entry',
    type: input.direction,
    amount: roundTo2(input.amount),
    ref_type: 'MANUAL',
    userId: 'Admin',
    payment_method: input.paymentMethod,
    bank_account_id: input.bankAccountId,
    category: input.category,
    subcategory: input.subcategory || undefined,
    source_module: 'FINANCE_VOUCHER_ENTRY',
    customer_id: input.customerId,
    customer: input.customerName,
    supplier_id: input.supplierId,
    supplier: input.supplierName,
    project_id: input.projectId,
    reconciliation_status: 'manual',
    attachment_storage_path: input.attachmentPath,
    attachment_file_name: input.attachmentFileName,
  };
  await persistence.addTransaction(txn);
  return txn;
}

export interface ConfirmVoucherAsPayableInput {
  supplierId: string;
  supplierName: string;
  amount: number;
  dueDate?: string;
  invoiceNo?: string;
  notes?: string;
}

/** "未付款供应商发票" path — reuses the existing AP V1 table, no new
 * payable concept. Money hasn't moved yet, so this never touches
 * transactions/bank balance — paying it later goes through the existing
 * create_supplier_payment() RPC from AccountsPayable.tsx, unchanged. */
export async function confirmVoucherAsPayable(input: ConfirmVoucherAsPayableInput): Promise<SupplierPayable | null> {
  return supplierPayablesService.create({
    supplier_id: input.supplierId,
    supplier_name: input.supplierName,
    invoice_no: input.invoiceNo,
    amount: roundTo2(input.amount),
    due_date: input.dueDate,
    notes: input.notes || 'Created from Voucher Entry (未付款供应商发票)',
  });
}

// ── bank_statement_imports / bank_statement_lines CRUD ────────────────────

export const bankStatementService = {
  /** Throws a friendly error on a duplicate (bank_account_id, file_hash) —
   * the UNIQUE constraint in the migration is the actual source of truth,
   * this just turns its raw Postgres error (code 23505) into a readable
   * message instead of surfacing the constraint name to the user. */
  async createImport(bankAccountId: string, fileName: string, storagePath: string, fileHash: string): Promise<BankStatementImport> {
    const { data, error } = await supabase
      .from('bank_statement_imports')
      .insert({ bank_account_id: bankAccountId, file_name: fileName, storage_path: storagePath, file_hash: fileHash })
      .select('*').single();
    if (error) {
      if ((error as any).code === '23505') {
        throw new Error('这份对账单文件已经在该银行账户下导入过，不能重复导入。');
      }
      console.error('[bookkeeping] createImport failed:', error);
      throw new Error(error.message || '创建对账单记录失败。');
    }
    return data as BankStatementImport;
  },

  async listImports(bankAccountId?: string): Promise<BankStatementImport[]> {
    let q = supabase.from('bank_statement_imports').select('*').order('created_at', { ascending: false });
    if (bankAccountId) q = q.eq('bank_account_id', bankAccountId);
    const { data, error } = await q;
    if (error) { console.error('[bookkeeping] listImports failed:', error); return []; }
    return (data || []) as BankStatementImport[];
  },

  async setImportStatus(id: string, status: 'reviewing' | 'completed'): Promise<void> {
    const { error } = await supabase.from('bank_statement_imports').update({ status }).eq('id', id);
    if (error) console.error('[bookkeeping] setImportStatus failed:', error);
  },

  async createLines(lines: Omit<BankStatementLine, 'id' | 'status' | 'created_at' | 'updated_at'>[]): Promise<BankStatementLine[]> {
    if (lines.length === 0) return [];
    const { data, error } = await supabase.from('bank_statement_lines').insert(lines).select('*');
    if (error) { console.error('[bookkeeping] createLines failed:', error); return []; }
    return (data || []) as BankStatementLine[];
  },

  async listLines(importId: string): Promise<BankStatementLine[]> {
    const { data, error } = await supabase
      .from('bank_statement_lines').select('*').eq('import_id', importId).order('line_date', { ascending: true });
    if (error) { console.error('[bookkeeping] listLines failed:', error); return []; }
    return (data || []) as BankStatementLine[];
  },

  async updateLine(id: string, patch: Partial<BankStatementLine>): Promise<void> {
    const { error } = await supabase.from('bank_statement_lines').update(patch).eq('id', id);
    if (error) console.error('[bookkeeping] updateLine failed:', error);
  },
};

// ── finance_vouchers CRUD ──────────────────────────────────────────────────

export const financeVoucherService = {
  async create(input: Omit<FinanceVoucher, 'id' | 'status' | 'created_at'>): Promise<FinanceVoucher | null> {
    const { data, error } = await supabase.from('finance_vouchers').insert(input).select('*').single();
    if (error) { console.error('[bookkeeping] voucher create failed:', error); return null; }
    return data as FinanceVoucher;
  },

  async list(): Promise<FinanceVoucher[]> {
    const { data, error } = await supabase.from('finance_vouchers').select('*').order('created_at', { ascending: false });
    if (error) { console.error('[bookkeeping] voucher list failed:', error); return []; }
    return (data || []) as FinanceVoucher[];
  },

  async update(id: string, patch: Partial<FinanceVoucher>): Promise<void> {
    const { error } = await supabase.from('finance_vouchers').update(patch).eq('id', id);
    if (error) console.error('[bookkeeping] voucher update failed:', error);
  },
};
