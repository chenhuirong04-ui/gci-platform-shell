import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Landmark, FileStack, Receipt, Trophy } from 'lucide-react';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb';
import { bankAccountsService } from '../services/bankAccountsService';
import { supplierPayablesService } from '../services/supplierPayablesService';
import { classifyTransaction, categoryLabel, isOperatingIncomeCategory, isOperatingExpenseCategory } from '../services/transactionCategories';
import type { TransactionRecord, BankAccount, OrderRecord, SupplierPayable } from '../types';

/**
 * Finance Reporting / Management Accounting V1 (2026-09-15) — replaces the
 * old static "点卡片跳转" FinanceOverview with a real month-filterable
 * summary computed straight off the existing transactions/orders/
 * supplier_payables data. No new ledger, no double-entry, no General
 * Ledger/Chart of Accounts/VAT engine — see chat report for scope. Every
 * number here is derived at render time from data that already exists;
 * nothing new is persisted by this component.
 *
 * Cheque rule mirrors FinanceTracker.countsTowardBalance exactly — a CHEQUE
 * only counts once cheque_status='CLEARED'; PENDING/BOUNCED/CANCELLED never
 * move a balance or count toward income/expense.
 *
 * Updated 2026-09-15 (second revision) — this is cash-basis MANAGEMENT
 * reporting, not a formal P&L. The top KPIs, category breakdowns, and
 * customer/supplier rankings all report OPERATING cash flow only:
 * INTERNAL_TRANSFER is fully excluded (it's not income or expense, just
 * money moving between the company's own accounts) and CAPITAL_INJECTION/
 * LOAN_PROCEEDS are excluded from operating inflow (real cash, but not from
 * business operations) — see transactionCategories.ts's
 * isOperatingIncomeCategory/isOperatingExpenseCategory. Bank account
 * balances are the one exception: they sum EVERY transaction on that
 * account regardless of category, because a transfer/injection/loan is
 * still real money that really moved.
 */
const countsTowardBalance = (t: TransactionRecord) => t.payment_method !== 'CHEQUE' || t.cheque_status === 'CLEARED';

function monthKey(dateStr?: string): string {
  return (dateStr || '').slice(0, 7);
}

interface RankRow {
  key: string;
  name: string;
  amount: number;
  hasId: boolean;
}

function rankBy(rows: TransactionRecord[], idField: 'customer_id' | 'supplier_id', nameField: 'customer' | 'supplier'): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const t of rows) {
    const id = t[idField];
    const name = t[nameField] || '(未命名)';
    const key = id || `name:${name}`;
    const existing = map.get(key);
    if (existing) {
      existing.amount = roundTo2(existing.amount + t.amount);
    } else {
      map.set(key, { key, name, amount: t.amount, hasId: !!id });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
}

export default function FinanceReportingOverview() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [accts, payablesRows] = await Promise.all([
        bankAccountsService.list(),
        supplierPayablesService.list(),
      ]);
      setAccounts(accts);
      setPayables(payablesRows);

      // Same cloud-first / local-fallback read as FinanceTracker.loadTransactions().
      try {
        const rows = await cloudDb.query('transactions', 2000, 0, {});
        const cloudList: TransactionRecord[] = (rows || []).map((r: any) => r?.payload).filter(Boolean);
        setTransactions(cloudList.length > 0 ? cloudList : await persistence.getTransactions());
      } catch {
        setTransactions(await persistence.getTransactions());
      }
      setOrders(await persistence.getOrders());
      setLoading(false);
    })();
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    set.add(new Date().toISOString().slice(0, 7));
    for (const t of transactions) {
      const m = monthKey(t.date);
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const monthTxns = useMemo(
    () => transactions.filter(t => monthKey(t.date) === month && countsTowardBalance(t)),
    [transactions, month]
  );

  // Operating cash inflow/outflow only — see file header. Both filters
  // check classifyTransaction()'s result, not just t.category, so
  // pre-this-round history and RPC-authored supplier-payment rows (neither
  // of which have `category` stamped) still classify correctly.
  const monthOperatingInflow = useMemo(
    () => roundTo2(monthTxns.filter(t => t.type === 'in' && isOperatingIncomeCategory(classifyTransaction(t))).reduce((s, t) => s + t.amount, 0)),
    [monthTxns]
  );
  const monthOperatingOutflow = useMemo(
    () => roundTo2(monthTxns.filter(t => t.type === 'out' && isOperatingExpenseCategory(classifyTransaction(t))).reduce((s, t) => s + t.amount, 0)),
    [monthTxns]
  );
  const monthNetOperating = roundTo2(monthOperatingInflow - monthOperatingOutflow);

  const balanceForAccount = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    const rows = transactions.filter(t => t.bank_account_id === accountId && countsTowardBalance(t));
    const income = rows.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const expense = rows.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return roundTo2(acc.opening_balance + income - expense);
  };

  // AR — outstanding balance on orders still awaiting payment. CONSIGNMENT-
  // status orders are excluded on purpose: their cash recognition happens
  // through settlements (CONSIGNMENT_REVENUE transactions), not
  // outstandingAmount, so folding them into AR here would double-count
  // against a different mechanism rather than under-count.
  const ar = useMemo(
    () => roundTo2(orders.filter(o => o.status === 'PENDING' || o.status === 'PARTIAL').reduce((s, o) => s + (o.outstandingAmount || 0), 0)),
    [orders]
  );

  // AP — same definition AccountsPayable.tsx's own KPI uses (open = not PAID, not CANCELLED).
  const ap = useMemo(
    () => roundTo2(payables.filter(p => p.status !== 'PAID' && p.status !== 'CANCELLED').reduce((s, p) => s + p.outstanding_amount, 0)),
    [payables]
  );

  // Both breakdowns are operating-only too (see file header) — a
  // CAPITAL_INJECTION/LOAN_PROCEEDS/INTERNAL_TRANSFER row never appears in
  // either category list, on purpose.
  const incomeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTxns.filter(t => t.type === 'in')) {
      const cat = classifyTransaction(t);
      if (!isOperatingIncomeCategory(cat)) continue;
      map.set(cat, roundTo2((map.get(cat) || 0) + t.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthTxns]);

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTxns.filter(t => t.type === 'out')) {
      const cat = classifyTransaction(t);
      if (!isOperatingExpenseCategory(cat)) continue;
      map.set(cat, roundTo2((map.get(cat) || 0) + t.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthTxns]);

  // Rankings are operating-only for the same reason — a shareholder
  // injection or an inter-account transfer should never inflate a
  // customer's/supplier's ranking.
  const topCustomers = useMemo(
    () => rankBy(monthTxns.filter(t => t.type === 'in' && isOperatingIncomeCategory(classifyTransaction(t))), 'customer_id', 'customer'),
    [monthTxns]
  );
  const topSuppliers = useMemo(
    () => rankBy(monthTxns.filter(t => t.type === 'out' && isOperatingExpenseCategory(classifyTransaction(t)) && (t.supplier_id || t.ref_type === 'SUPPLIER_PAYMENT')), 'supplier_id', 'supplier'),
    [monthTxns]
  );

  if (loading) {
    return <div className="h-[calc(100vh-250px)] flex items-center justify-center text-gray-300 text-xs font-black uppercase tracking-widest">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>财务总览</h1>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="p-3 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] bg-white font-black text-gray-700 text-sm font-mono"
        >
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-[#3F7D58]" /> 本月经营现金流入</p>
          <p className="text-xl font-black font-mono text-[#3F7D58]">+{monthOperatingInflow.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-[#E0846A]" /> 本月经营现金流出</p>
          <p className="text-xl font-black font-mono text-[#E0846A]">-{monthOperatingOutflow.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">净经营现金流</p>
          <p className={`text-xl font-black font-mono ${monthNetOperating >= 0 ? 'text-gray-800' : 'text-[#E0846A]'}`}>{monthNetOperating >= 0 ? '+' : ''}{monthNetOperating.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> AR / 应收</p>
          <p className="text-xl font-black font-mono text-gray-800">{ar.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" /> AP / 应付</p>
          <p className="text-xl font-black font-mono text-gray-800">{ap.toFixed(2)}</p>
        </div>
      </div>

      {/* Bank balances */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Landmark className="w-4 h-4 text-[#CBA85C]" /> 银行账户余额 / Bank Balances</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="p-4 bg-gray-50 rounded-xl">
              <p className="text-[10px] font-black text-gray-400 uppercase truncate">{a.account_name}</p>
              <p className="text-sm font-black font-mono text-gray-800 mt-1">{a.currency} {balanceForAccount(a.id).toFixed(2)}</p>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-xs text-gray-300 font-black uppercase col-span-full text-center py-4">No bank accounts yet</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-4">收入分类汇总 / Income by Category</h3>
          <div className="space-y-2">
            {incomeBreakdown.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="font-bold text-gray-600">{categoryLabel(cat)}</span>
                <span className="font-mono font-black text-[#3F7D58]">{amt.toFixed(2)}</span>
              </div>
            ))}
            {incomeBreakdown.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No income this month</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-4">支出分类汇总 / Expense by Category</h3>
          <div className="space-y-2">
            {expenseBreakdown.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="font-bold text-gray-600">{categoryLabel(cat)}</span>
                <span className="font-mono font-black text-[#E0846A]">{amt.toFixed(2)}</span>
              </div>
            ))}
            {expenseBreakdown.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No expense this month</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Trophy className="w-4 h-4 text-[#CBA85C]" /> 客户回款排行 / Top Customers</h3>
          <div className="space-y-2">
            {topCustomers.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between text-sm">
                <span className="font-bold text-gray-600 truncate">{i + 1}. {r.name}{!r.hasId && <span className="text-[9px] text-gray-300 ml-1">Legacy / 未关联ID</span>}</span>
                <span className="font-mono font-black text-gray-800">{r.amount.toFixed(2)}</span>
              </div>
            ))}
            {topCustomers.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No data this month</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Wallet className="w-4 h-4 text-[#CBA85C]" /> 供应商付款排行 / Top Suppliers</h3>
          <div className="space-y-2">
            {topSuppliers.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between text-sm">
                <span className="font-bold text-gray-600 truncate">{i + 1}. {r.name}{!r.hasId && <span className="text-[9px] text-gray-300 ml-1">Legacy / 未关联ID</span>}</span>
                <span className="font-mono font-black text-gray-800">{r.amount.toFixed(2)}</span>
              </div>
            ))}
            {topSuppliers.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No data this month</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
