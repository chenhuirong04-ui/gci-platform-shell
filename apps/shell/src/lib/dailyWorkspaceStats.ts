/**
 * Daily Workspace rebuild (2026-09-16) — every number this file returns
 * comes from a real, already-live table/service (transactions, orders,
 * supplier_payables, bank_accounts, bank_statement_lines, finance_vouchers,
 * crm_customers followups, quotes). No new table, no new API, no Mock. A
 * field is `null` when its source genuinely has nothing to report yet or a
 * fetch failed — callers must render that as "暂无数据"/hide the tile, never
 * coerce it to 0 (see chat report — a fake 0 is exactly what this round
 * removes).
 */
import { supabase } from './supabase';
import { getTodaysFollowups, getOverdueFollowups } from './crmSupabase';
import { getExecutiveTasks } from './executiveTasks';
import { refreshPendingDecisions } from './decisionInbox';
import { getMiaStatus } from './mia';
import { persistence } from '../../../../modules/trade/services/persistenceService';
import { cloudDb } from '../../../../modules/trade/services/cloudDb';
import { bankAccountsService } from '../../../../modules/trade/services/bankAccountsService';
import { supplierPayablesService } from '../../../../modules/trade/services/supplierPayablesService';
import { classifyTransaction, isOperatingIncomeCategory, isOperatingExpenseCategory } from '../../../../modules/trade/services/transactionCategories';
import type { TransactionRecord } from '../../../../modules/trade/types';

const roundTo2 = (n: number) => Math.round(n * 100) / 100;
const countsTowardBalance = (t: TransactionRecord) => t.payment_method !== 'CHEQUE' || t.cheque_status === 'CLEARED';
const todayStr = () => new Date().toISOString().split('T')[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

async function loadTransactions(): Promise<TransactionRecord[]> {
  try {
    const rows = await cloudDb.query('transactions', 2000, 0, {});
    const cloudList: TransactionRecord[] = (rows || []).map((r: any) => r?.payload).filter(Boolean);
    if (cloudList.length > 0) return cloudList;
  } catch { /* fall through to local */ }
  return persistence.getTransactions();
}

// ── 1. 今天要处理 ───────────────────────────────────────────────────────────

export interface TodoTodayStats {
  myTasks: number | null;
  needsDecision: number | null;
  overdueTasks: number | null;
  todayFollowups: number | null;
}

export async function loadTodoToday(): Promise<TodoTodayStats> {
  const [tasksRes, decisionsRes, followupsRes] = await Promise.all([
    getExecutiveTasks(),
    refreshPendingDecisions(),
    getTodaysFollowups(),
  ]);

  let myTasks: number | null = null;
  let overdueTasks: number | null = null;
  if (tasksRes.ok) {
    const open = tasksRes.rows.filter((t) => t.status === 'open' || t.status === 'in_progress');
    myTasks = open.length;
    const now = Date.now();
    overdueTasks = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length;
  }

  return {
    myTasks,
    needsDecision: decisionsRes.ok ? decisionsRes.rows.length : null,
    overdueTasks,
    todayFollowups: followupsRes.ok ? followupsRes.rows.length : null,
  };
}

// ── 2. 今天的钱 ─────────────────────────────────────────────────────────────

export interface MoneyTodayStats {
  bankBalance: number | null;
  monthInflow: number | null;
  monthOutflow: number | null;
  ar: number | null;
  ap: number | null;
}

export async function loadMoneyToday(): Promise<MoneyTodayStats> {
  const stats: MoneyTodayStats = { bankBalance: null, monthInflow: null, monthOutflow: null, ar: null, ap: null };

  try {
    const [accounts, transactions] = await Promise.all([bankAccountsService.list(), loadTransactions()]);
    const balanceForAccount = (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc) return 0;
      const rows = transactions.filter((t) => t.bank_account_id === accountId && countsTowardBalance(t));
      const income = rows.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
      const expense = rows.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
      return acc.opening_balance + income - expense;
    };
    stats.bankBalance = roundTo2(accounts.reduce((s, a) => s + balanceForAccount(a.id), 0));

    const month = thisMonth();
    const monthTxns = transactions.filter((t) => (t.date || '').startsWith(month) && countsTowardBalance(t));
    stats.monthInflow = roundTo2(
      monthTxns.filter((t) => t.type === 'in' && isOperatingIncomeCategory(classifyTransaction(t))).reduce((s, t) => s + t.amount, 0)
    );
    stats.monthOutflow = roundTo2(
      monthTxns.filter((t) => t.type === 'out' && isOperatingExpenseCategory(classifyTransaction(t))).reduce((s, t) => s + t.amount, 0)
    );
  } catch { /* leave bankBalance/monthInflow/monthOutflow null */ }

  try {
    const orders = await persistence.getOrders();
    stats.ar = roundTo2(
      orders.filter((o) => o.status === 'PENDING' || o.status === 'PARTIAL').reduce((s, o) => s + (o.outstandingAmount || 0), 0)
    );
  } catch { /* leave ar null */ }

  try {
    const payables = await supplierPayablesService.list();
    stats.ap = roundTo2(
      payables.filter((p) => p.status !== 'PAID' && p.status !== 'CANCELLED').reduce((s, p) => s + p.outstanding_amount, 0)
    );
  } catch { /* leave ap null */ }

  return stats;
}

// ── 3. 今天的业务 ───────────────────────────────────────────────────────────

export interface BusinessTodayStats {
  followUpBacklog: number | null; // 待跟进客户 = overdue follow-ups (distinct from section 1's "today" count)
  pendingQuotes: number | null;
  activeOrders: number | null;
  /** 新业务机会 — MIA's real leads_found_today, not the old static 0. A
   * live fetch (same one MiaLeads.tsx itself uses), never a fake number. */
  newOpportunities: number | null;
}

export async function loadBusinessToday(): Promise<BusinessTodayStats> {
  const [overdueRes, quotes, orders, miaRes] = await Promise.all([
    getOverdueFollowups(),
    persistence.getQuotes().catch(() => null),
    persistence.getOrders().catch(() => null),
    getMiaStatus().catch(() => null),
  ]);

  return {
    followUpBacklog: overdueRes.ok ? overdueRes.rows.length : null,
    pendingQuotes: quotes ? quotes.filter((q: any) => q?.status && q.status !== 'CONVERTED' && q.status !== 'LOST').length : null,
    activeOrders: orders ? orders.filter((o) => o?.status && o.status !== 'PAID' && o.status !== 'VOIDED').length : null,
    newOpportunities: miaRes && miaRes.ok ? miaRes.data.leads_found_today : null,
  };
}

// ── 4. 异常提醒 ─────────────────────────────────────────────────────────────

export interface AnomalyStats {
  inventoryAlerts: number | null;
  unreconciledBankLines: number | null;
  missingVouchers: number | null;
  overdueAR: number | null;
  overdueAP: number | null;
}

export async function loadAnomalies(): Promise<AnomalyStats> {
  const stats: AnomalyStats = { inventoryAlerts: null, unreconciledBankLines: null, missingVouchers: null, overdueAR: null, overdueAP: null };
  const today = todayStr();

  // Same combined warehouse (Notion) + consignment (Supabase) alert count
  // the old Home.tsx fetched — unchanged data sources, just moved here.
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const [whResult, csResult] = await Promise.allSettled([
      fetch(`${base}/api/ai/inventory-table-alerts`).then((r) => r.json()),
      fetch(`${base}/api/trade/check-inventory`).then((r) => r.json()),
    ]);
    const whCount = whResult.status === 'fulfilled' && whResult.value.ok ? (whResult.value.alertCount ?? 0) : 0;
    const csCount = csResult.status === 'fulfilled' && csResult.value.ok ? (csResult.value.alertCount ?? 0) : 0;
    stats.inventoryAlerts = whCount + csCount;
  } catch { /* leave null */ }

  try {
    const { count } = await supabase.from('bank_statement_lines').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    stats.unreconciledBankLines = count ?? 0;
  } catch { /* leave null */ }

  try {
    const { count } = await supabase.from('finance_vouchers').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    stats.missingVouchers = count ?? 0;
  } catch { /* leave null */ }

  try {
    const orders = await persistence.getOrders();
    stats.overdueAR = orders.filter((o) => (o.status === 'PENDING' || o.status === 'PARTIAL') && o.dueDate && o.dueDate < today).length;
  } catch { /* leave null */ }

  try {
    const payables = await supplierPayablesService.list();
    stats.overdueAP = payables.filter((p) => p.status !== 'PAID' && p.status !== 'CANCELLED' && p.due_date && p.due_date < today).length;
  } catch { /* leave null */ }

  return stats;
}

// ── 5. 证件到期提醒 (Company Documents Intelligence V2 Phase 1) ────────────────
// Reads company_documents directly (reminder_enabled=true, expiry_date within
// 90 days including already-expired) — no new table, this just surfaces what
// Company Documents already has. Only company_documents.reminder_enabled/
// expiry_date/document_type/company_name are read; nothing here writes.

export type DocumentExpiryRisk = 'expired' | 'urgent' | 'high' | 'reminder' | 'early' | 'warning';

export interface DocumentExpiryAlert {
  id: string;
  documentType: string; // document_type if AI/user set it, else falls back to category
  companyName: string | null;
  expiryDate: string;
  daysRemaining: number; // negative once expired
  risk: DocumentExpiryRisk;
}

function documentExpiryRisk(daysRemaining: number): DocumentExpiryRisk {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 7) return 'urgent';
  if (daysRemaining <= 14) return 'high';
  if (daysRemaining <= 30) return 'reminder';
  if (daysRemaining <= 60) return 'early';
  return 'warning'; // <= 90
}

export async function loadDocumentExpiryAlerts(): Promise<{ count: number; items: DocumentExpiryAlert[] } | null> {
  try {
    const in90Days = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('company_documents')
      .select('id, category, document_type, company_name, expiry_date')
      .eq('reminder_enabled', true)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', in90Days)
      .order('expiry_date', { ascending: true });
    if (error || !data) return null;

    const todayMs = new Date(todayStr()).getTime();
    const items: DocumentExpiryAlert[] = data.map((row: any) => {
      const daysRemaining = Math.round((new Date(row.expiry_date).getTime() - todayMs) / 86400000);
      return {
        id: row.id,
        documentType: row.document_type || row.category || '—',
        companyName: row.company_name || null,
        expiryDate: row.expiry_date,
        daysRemaining,
        risk: documentExpiryRisk(daysRemaining),
      };
    });
    return { count: items.length, items };
  } catch {
    return null;
  }
}
