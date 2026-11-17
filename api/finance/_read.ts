// GIA P3 step 2 — shared read-only access + calculations for the 财务中心
// (Finance Center). Used by api/finance/{bank-balances,payables-due,
// pending-vouchers,reconciliation-status}.ts. GET only; never writes.
//
// Data access mirrors the Finance Center pages exactly:
//   • bank_accounts / supplier_payables / supplier_payments /
//     finance_vouchers / bank_statement_imports / bank_statement_lines are
//     RLS tables gated by has_module('finance') → read AS THE CALLER
//     (userRestHeaders, caller's own token). Never the service-role key.
//   • transactions is the legacy {id,payload} table the pages read through
//     cloudDb (anon identity: FinanceTracker / FinanceReportingOverview
//     cloudDb.query('transactions', 2000, 0, {})) → legacyTradeAnonHeaders,
//     only after requireModule('finance') passed.
// Rules mirrored (not re-invented):
//   • balance = opening_balance + Σin − Σout of that account's transactions;
//     a CHEQUE only counts once cheque_status = 'CLEARED'
//     (FinanceTracker / FinanceReportingOverview countsTowardBalance)
//   • bankTotal = non-Cash accounts, cashTotal = Cash accounts (FinanceTracker stats)
//   • AP open = status not PAID / CANCELLED; overdue = due < today;
//     due soon = 0–7 days (AccountsPayable.tsx kpi)
//   • pending vouchers = finance_vouchers.status 'pending';
//     unreconciled lines = bank_statement_lines.status 'pending'
//     (dailyWorkspaceStats loadAnomalies — the Home 异常提醒 counts)
// Voucher / statement file contents are never read: storage_path and
// file bodies are not selected.
import { userRestHeaders, legacyTradeAnonHeaders, type AuthContext } from '../_lib/auth';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = <T>(rows: T[], f: (r: T) => unknown) => round2(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0));

function base(): string {
  const b = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!b) throw new Error('supabase_not_configured');
  return b;
}

/** RLS table read as the signed-in caller. `query` = PostgREST query string. */
export async function userRows<T>(ctx: AuthContext, table: string, query: string): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: { ...userRestHeaders(ctx), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${table}_${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface Txn {
  id?: string; date?: string; type?: 'in' | 'out'; amount?: number; bank_account_id?: string;
  payment_method?: string; cheque_status?: string; reconciliation_status?: string;
  customer?: string; supplier?: string; note?: string;
}

/** Same read as the pages: cloudDb.query('transactions', 2000, 0, {}) → payloads. */
export async function loadTransactions(): Promise<Txn[]> {
  const res = await fetch(`${base()}/rest/v1/transactions?select=*&order=updated_at.desc&limit=2000&offset=0`, {
    method: 'GET',
    headers: { ...legacyTradeAnonHeaders(), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`transactions_${res.status}`);
  const rows: Array<{ payload?: Txn | null }> = await res.json();
  return (Array.isArray(rows) ? rows : []).map((r) => r?.payload).filter(Boolean) as Txn[];
}

export const countsTowardBalance = (t: Txn) => t.payment_method !== 'CHEQUE' || t.cheque_status === 'CLEARED';

export interface Account {
  id: string; account_name: string; account_type: string; bank_name?: string | null;
  currency?: string; opening_balance?: number; is_active?: boolean;
}

export function accountBalance(acc: Account, txns: Txn[]): number {
  const rows = txns.filter((t) => t.bank_account_id === acc.id && countsTowardBalance(t));
  const income = rows.filter((t) => t.type === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = rows.filter((t) => t.type === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return round2((Number(acc.opening_balance) || 0) + income - expense);
}

/** Today as YYYY-MM-DD in Dubai time (the Finance Center is used in Dubai). */
export function dubaiToday(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Whole days from `today` to `dateStr` (both YYYY-MM-DD), like AccountsPayable daysUntil. */
export function daysUntil(dateStr: string | null | undefined, today: string): number | null {
  if (!dateStr) return null;
  const d = Date.parse(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(t)) return null;
  return Math.round((d - t) / 86400000);
}
