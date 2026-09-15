import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Trophy, Users, Wallet, AlertTriangle } from 'lucide-react';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb';
import { supplierPayablesService } from '../services/supplierPayablesService';
import { supplierPaymentsService } from '../services/supplierPaymentsService';
import { listSuppliers } from '../../suppliers/lib/suppliersCloud';
import { getAllCustomerNames } from '../../../apps/shell/src/lib/crmSupabase';
import { listAllProjects } from '../../../apps/shell/src/lib/crmProjects';
import { classifyTransaction, isOperatingIncomeCategory, isOperatingExpenseCategory } from '../services/transactionCategories';
import type { TransactionRecord, OrderRecord, SupplierPayable, SupplierPayment } from '../types';

/**
 * Finance Profitability V1 (2026-09-15) — "项目与客户利润". Management
 * accounting, not a formal P&L: no GL, no Chart of Accounts, no debit/
 * credit, no VAT engine. Reuses transactions/orders/crm_customers/
 * crm_projects/supplier_payables/supplier_payments as-is — no second
 * ledger, nothing new persisted by this component.
 *
 * Investigation finding this design is built around (see chat report for
 * the full writeup): `transactions.project_id` is ONLY ever populated by
 * (a) an order payment/consignment settlement inheriting
 * order.crmProjectId — itself only set when the source quote went through
 * the BOQ CustomerProjectSelector with a project actually picked, live
 * since Customer/Project Linking V1 (2026-09-15) — so every transaction
 * before that date has no project_id, by construction, or (b) a
 * FinanceTracker manual entry where the user explicitly links a project.
 * Nothing on the EXPENSE side writes project_id automatically —
 * supplier_payables/supplier_payments have no project_id column at all, so
 * a Supplier Payment can only ever be attributed to a project via a manual
 * entry. This means "Project Direct Cost" is real wherever it's nonzero,
 * but is structurally incomplete today — see the banner this component
 * shows when a project has revenue but no linked cost data at all.
 *
 * supplier_id resolution: order/consignment/manual-entry transactions carry
 * customer_id/supplier_id directly, but a create_supplier_payment() RPC row
 * (ref_type='SUPPLIER_PAYMENT') never had a supplier_id field to write in
 * the first place — only `supplier` (name snapshot) + `ref_id` pointing at
 * supplier_payments.id. This component resolves those rows' real
 * supplier_id via that one real FK hop (ref_id -> supplier_payments.id ->
 * supplier_id) — an exact join, never a name guess — so supplier ranking
 * still groups by real ID wherever the data allows it.
 */
const countsTowardBalance = (t: TransactionRecord) => t.payment_method !== 'CHEQUE' || t.cheque_status === 'CLEARED';

type Period = 'this_month' | 'last_month' | 'custom' | 'all_time';

function monthKey(dateStr?: string): string {
  return (dateStr || '').slice(0, 7);
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface ProjectRow {
  key: string;
  projectName: string;
  customerName: string;
  revenue: number;
  directCost: number;
  grossProfit: number;
  grossMargin: number | null;
  collected: number;
  outstanding: number;
  isLegacy: boolean;
}

interface CustomerRow {
  key: string;
  name: string;
  hasId: boolean;
  revenue: number;
  collected: number;
  ar: number;
  projectCount: number;
}

interface SupplierRow {
  key: string;
  name: string;
  hasId: boolean;
  paid: number;
  ap: number;
}

export default function FinanceProfitability() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [supplierNameById, setSupplierNameById] = useState<Map<string, string>>(new Map());
  const [customerNameById, setCustomerNameById] = useState<Map<string, string>>(new Map());
  const [projectById, setProjectById] = useState<Map<string, { name: string; customerId: string }>>(new Map());

  const [period, setPeriod] = useState<Period>('this_month');
  const [customMonth, setCustomMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [payablesRows, paymentsRows, suppliersRows, customerResult, projectsRows] = await Promise.all([
        supplierPayablesService.list(),
        supplierPaymentsService.list(),
        listSuppliers({ limit: 500 }),
        getAllCustomerNames(),
        listAllProjects(),
      ]);
      setPayables(payablesRows);
      setPayments(paymentsRows);
      setSupplierNameById(new Map(suppliersRows.filter((s): s is typeof s & { id: string } => !!s.id).map(s => [s.id, s.supplier_name_display])));
      setCustomerNameById(new Map(customerResult.ok ? customerResult.rows.map(r => [r.id, r.customer_name]) : []));
      setProjectById(new Map(projectsRows.map(p => [p.id, { name: p.project_name, customerId: p.customer_id }])));

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

  // Real FK hop for supplier payment rows — never a name guess (see file header).
  const supplierIdByPaymentId = useMemo(
    () => new Map(payments.filter(p => p.supplier_id).map(p => [p.id, p.supplier_id!])),
    [payments]
  );
  const resolveSupplierId = (t: TransactionRecord): string | undefined =>
    t.supplier_id || (t.ref_type === 'SUPPLIER_PAYMENT' && t.ref_id ? supplierIdByPaymentId.get(t.ref_id) : undefined);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    set.add(new Date().toISOString().slice(0, 7));
    for (const t of transactions) {
      const m = monthKey(t.date);
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const periodTxns = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    let matchMonth: string | null = null;
    if (period === 'this_month') matchMonth = thisMonth;
    else if (period === 'last_month') matchMonth = shiftMonth(thisMonth, -1);
    else if (period === 'custom') matchMonth = customMonth;
    // 'all_time' -> matchMonth stays null, no date filter
    return transactions.filter(t => countsTowardBalance(t) && (matchMonth === null || monthKey(t.date) === matchMonth));
  }, [transactions, period, customMonth]);

  // ── Project dimension ──────────────────────────────────────────────────
  const projectRows = useMemo<ProjectRow[]>(() => {
    const map = new Map<string, { revenue: number; directCost: number }>();
    let legacyRevenue = 0;
    let legacyCost = 0;
    for (const t of periodTxns) {
      const cat = classifyTransaction(t);
      const isRev = t.type === 'in' && isOperatingIncomeCategory(cat);
      const isCost = t.type === 'out' && isOperatingExpenseCategory(cat);
      if (!isRev && !isCost) continue;
      if (!t.project_id) {
        if (isRev) legacyRevenue = roundTo2(legacyRevenue + t.amount);
        if (isCost) legacyCost = roundTo2(legacyCost + t.amount);
        continue;
      }
      const row = map.get(t.project_id) || { revenue: 0, directCost: 0 };
      if (isRev) row.revenue = roundTo2(row.revenue + t.amount);
      if (isCost) row.directCost = roundTo2(row.directCost + t.amount);
      map.set(t.project_id, row);
    }

    const rows: ProjectRow[] = Array.from(map.entries()).map(([pid, v]) => {
      const proj = projectById.get(pid);
      const outstanding = roundTo2(
        orders.filter(o => o.crmProjectId === pid && (o.status === 'PENDING' || o.status === 'PARTIAL'))
          .reduce((s, o) => s + (o.outstandingAmount || 0), 0)
      );
      const grossProfit = roundTo2(v.revenue - v.directCost);
      return {
        key: pid,
        projectName: proj?.name || `(项目 ${pid.slice(0, 8)})`,
        customerName: (proj && customerNameById.get(proj.customerId)) || '—',
        revenue: v.revenue,
        directCost: v.directCost,
        grossProfit,
        grossMargin: v.revenue > 0 ? roundTo2((grossProfit / v.revenue) * 10000) / 100 : null,
        collected: v.revenue,
        outstanding,
        isLegacy: false,
      };
    });

    if (legacyRevenue > 0 || legacyCost > 0) {
      const gp = roundTo2(legacyRevenue - legacyCost);
      rows.push({
        key: '__legacy__',
        projectName: 'Legacy / 未关联项目',
        customerName: '—',
        revenue: legacyRevenue,
        directCost: legacyCost,
        grossProfit: gp,
        grossMargin: legacyRevenue > 0 ? roundTo2((gp / legacyRevenue) * 10000) / 100 : null,
        collected: legacyRevenue,
        outstanding: 0,
        isLegacy: true,
      });
    }

    return rows.sort((a, b) => b.revenue - a.revenue);
  }, [periodTxns, projectById, customerNameById, orders]);

  const realProjectRows = projectRows.filter(r => !r.isLegacy);
  const projectDirectCostIncomplete = realProjectRows.some(r => r.revenue > 0 && r.directCost === 0);

  const periodProjectRevenue = roundTo2(realProjectRows.reduce((s, r) => s + r.revenue, 0));
  const periodProjectCost = roundTo2(realProjectRows.reduce((s, r) => s + r.directCost, 0));
  const periodProjectGrossProfit = roundTo2(periodProjectRevenue - periodProjectCost);
  const periodProjectMargin = periodProjectRevenue > 0 ? roundTo2((periodProjectGrossProfit / periodProjectRevenue) * 10000) / 100 : null;

  // ── Customer dimension ─────────────────────────────────────────────────
  const customerRows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, { name: string; hasId: boolean; revenue: number }>();
    for (const t of periodTxns) {
      if (t.type !== 'in' || !isOperatingIncomeCategory(classifyTransaction(t))) continue;
      const id = t.customer_id;
      const name = (id && customerNameById.get(id)) || t.customer || '(未命名)';
      const key = id || `name:${name}`;
      const existing = map.get(key);
      if (existing) existing.revenue = roundTo2(existing.revenue + t.amount);
      else map.set(key, { name, hasId: !!id, revenue: t.amount });
    }

    return Array.from(map.entries()).map(([key, v]) => {
      const id = v.hasId ? key : undefined;
      const ar = id
        ? roundTo2(orders.filter(o => o.crmCustomerId === id && (o.status === 'PENDING' || o.status === 'PARTIAL')).reduce((s, o) => s + (o.outstandingAmount || 0), 0))
        : 0;
      const projectCount = id
        ? new Set(orders.filter(o => o.crmCustomerId === id && o.crmProjectId).map(o => o.crmProjectId)).size
        : 0;
      return { key, name: v.name, hasId: v.hasId, revenue: v.revenue, collected: v.revenue, ar, projectCount };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [periodTxns, customerNameById, orders]);

  // AR-by-customer is a current snapshot, not period-scoped — every real
  // customer with any outstanding order balance, regardless of whether they
  // paid anything in the selected period.
  const customerArRows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (!o.crmCustomerId || (o.status !== 'PENDING' && o.status !== 'PARTIAL')) continue;
      map.set(o.crmCustomerId, roundTo2((map.get(o.crmCustomerId) || 0) + (o.outstandingAmount || 0)));
    }
    return Array.from(map.entries())
      .map(([id, ar]) => ({ key: id, name: customerNameById.get(id) || `(客户 ${id.slice(0, 8)})`, hasId: true, revenue: 0, collected: 0, ar, projectCount: 0 }))
      .filter(r => r.ar > 0)
      .sort((a, b) => b.ar - a.ar);
  }, [orders, customerNameById]);

  // ── Supplier dimension ─────────────────────────────────────────────────
  const supplierRows = useMemo<SupplierRow[]>(() => {
    const map = new Map<string, { name: string; hasId: boolean; paid: number }>();
    for (const t of periodTxns) {
      if (t.type !== 'out' || !isOperatingExpenseCategory(classifyTransaction(t))) continue;
      const id = resolveSupplierId(t);
      const name = (id && supplierNameById.get(id)) || t.supplier || '(未命名)';
      const key = id || `name:${name}`;
      const existing = map.get(key);
      if (existing) existing.paid = roundTo2(existing.paid + t.amount);
      else map.set(key, { name, hasId: !!id, paid: t.amount });
    }

    return Array.from(map.entries()).map(([key, v]) => {
      const id = v.hasId ? key : undefined;
      const ap = id
        ? roundTo2(payables.filter(p => p.supplier_id === id && p.status !== 'PAID' && p.status !== 'CANCELLED').reduce((s, p) => s + p.outstanding_amount, 0))
        : 0;
      return { key, name: v.name, hasId: v.hasId, paid: v.paid, ap };
    }).sort((a, b) => b.paid - a.paid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodTxns, supplierNameById, payables, supplierIdByPaymentId]);

  if (loading) {
    return <div className="h-[calc(100vh-250px)] flex items-center justify-center text-gray-300 text-xs font-black uppercase tracking-widest">Loading...</div>;
  }

  const periodLabel = period === 'this_month' ? '本月' : period === 'last_month' ? '上月' : period === 'custom' ? customMonth : '全部历史';

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>项目与客户利润 / Profitability</h1>
        <div className="flex items-center gap-2">
          {(['this_month', 'last_month', 'custom', 'all_time'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-[#080D1E] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
            >
              {p === 'this_month' ? '本月' : p === 'last_month' ? '上月' : p === 'custom' ? '自定义月份' : '全部历史'}
            </button>
          ))}
          {period === 'custom' && (
            <select
              value={customMonth}
              onChange={e => setCustomMonth(e.target.value)}
              className="p-2.5 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] bg-white font-black text-gray-700 text-sm font-mono"
            >
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {projectDirectCostIncomplete && (
        <div className="bg-[#CBA85C]/10 border border-[#CBA85C]/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#8A6D2F] shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-[#8A6D2F]">
            项目直接成本数据尚未完整归集 / Direct cost data incomplete — 供应商付款（Supplier Payment）目前不携带 project_id，只有手工记账时主动关联项目的支出才会计入下面的"项目直接支出"。以下毛利率可能被高估，仅供参考，不代表真实项目盈亏。
          </p>
        </div>
      )}

      {/* Top KPI — sums of the Project Profitability table below (real projects only, excludes Legacy) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{periodLabel}项目经营收入</p>
          <p className="text-xl font-black font-mono text-[#3F7D58]">+{periodProjectRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{periodLabel}项目直接支出</p>
          <p className="text-xl font-black font-mono text-[#E0846A]">-{periodProjectCost.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">毛利 / Gross Profit</p>
          <p className={`text-xl font-black font-mono ${periodProjectGrossProfit >= 0 ? 'text-gray-800' : 'text-[#E0846A]'}`}>{periodProjectGrossProfit.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">毛利率 / Gross Margin</p>
          <p className="text-xl font-black font-mono text-gray-800">{periodProjectMargin === null ? '—' : `${periodProjectMargin.toFixed(1)}%`}</p>
        </div>
      </div>

      {/* Project profitability */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Layers className="w-4 h-4 text-[#CBA85C]" /> 项目利润排行 / Project Profitability</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <tr>
                <th className="py-2 pr-4">Project</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 pr-4 text-right">Direct Cost</th>
                <th className="py-2 pr-4 text-right">Gross Profit</th>
                <th className="py-2 pr-4 text-right">Margin</th>
                <th className="py-2 pr-4 text-right">收款</th>
                <th className="py-2 text-right">未收款</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projectRows.map(r => (
                <tr key={r.key} className={r.isLegacy ? 'text-gray-400 italic' : ''}>
                  <td className="py-3 pr-4 font-bold text-gray-700">{r.projectName}</td>
                  <td className="py-3 pr-4 text-gray-500">{r.customerName}</td>
                  <td className="py-3 pr-4 text-right font-mono font-black text-[#3F7D58]">{r.revenue.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-right font-mono font-black text-[#E0846A]">{r.directCost.toFixed(2)}</td>
                  <td className={`py-3 pr-4 text-right font-mono font-black ${r.grossProfit >= 0 ? 'text-gray-800' : 'text-[#E0846A]'}`}>{r.grossProfit.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-600">{r.grossMargin === null ? '—' : `${r.grossMargin.toFixed(1)}%`}</td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-600">{r.collected.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono text-gray-600">{r.outstanding.toFixed(2)}</td>
                </tr>
              ))}
              {projectRows.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-gray-300 text-xs font-black uppercase">No project-linked data in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Trophy className="w-4 h-4 text-[#CBA85C]" /> 客户收入排行 / Top Customers</h3>
          <div className="space-y-2">
            {customerRows.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between text-sm gap-2">
                <span className="font-bold text-gray-600 truncate">{i + 1}. {r.name}{!r.hasId && <span className="text-[9px] text-gray-300 ml-1">Legacy / 未关联ID</span>}</span>
                <span className="font-mono font-black text-gray-800 shrink-0">{r.revenue.toFixed(2)}</span>
              </div>
            ))}
            {customerRows.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No data</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Users className="w-4 h-4 text-[#CBA85C]" /> 客户未收款 / AR by Customer（当前，不受时间筛选影响）</h3>
          <div className="space-y-2">
            {customerArRows.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between text-sm gap-2">
                <span className="font-bold text-gray-600 truncate">{i + 1}. {r.name}</span>
                <span className="font-mono font-black text-[#E0846A] shrink-0">{r.ar.toFixed(2)}</span>
              </div>
            ))}
            {customerArRows.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No outstanding AR</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest mb-4"><Wallet className="w-4 h-4 text-[#CBA85C]" /> 供应商付款排行 / Top Suppliers</h3>
        <div className="space-y-2">
          {supplierRows.map((r, i) => (
            <div key={r.key} className="flex items-center justify-between text-sm gap-2">
              <span className="font-bold text-gray-600 truncate">{i + 1}. {r.name}{!r.hasId && <span className="text-[9px] text-gray-300 ml-1">Legacy / 未关联ID</span>}</span>
              <span className="flex items-center gap-4 shrink-0">
                <span className="font-mono font-black text-gray-800">已付 {r.paid.toFixed(2)}</span>
                {r.ap > 0 && <span className="font-mono font-black text-[#E0846A]">AP {r.ap.toFixed(2)}</span>}
              </span>
            </div>
          ))}
          {supplierRows.length === 0 && <p className="text-xs text-gray-300 font-black uppercase text-center py-4">No data</p>}
        </div>
      </div>
    </div>
  );
}
