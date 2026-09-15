import React, { useState, useEffect, useMemo } from 'react';
import { Lock, Plus, AlertTriangle, Clock, Save } from 'lucide-react';
import { roundTo2 } from '../services/currencyUtils';
import { bankAccountsService } from '../services/bankAccountsService';
import { supplierPayablesService } from '../services/supplierPayablesService';
import { supplierPaymentsService } from '../services/supplierPaymentsService';
import { listSuppliers } from '../../suppliers/lib/suppliersCloud';
import { useAuth } from '../../../apps/shell/src/contexts/AuthContext';
import SupplierPaymentModal from './SupplierPaymentModal';
import type { SupplierPayable, SupplierPayment, BankAccount } from '../types';
import type { Supplier } from '../../suppliers/types';

const STATUS_STYLE: Record<SupplierPayable['status'], string> = {
  UNPAID: 'bg-[#E0846A]/10 text-[#E0846A] border-[#E0846A]/20',
  PARTIAL: 'bg-[#CBA85C]/10 text-[#CBA85C] border-[#CBA85C]/20',
  PAID: 'bg-[#6FBF8E]/10 text-[#3F7D58] border-[#6FBF8E]/20',
  CANCELLED: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

const AccountsPayable: React.FC = () => {
  const { can } = useAuth();

  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [pendingCheques, setPendingCheques] = useState<SupplierPayment[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewPayable, setShowNewPayable] = useState(false);
  const [payingPayable, setPayingPayable] = useState<SupplierPayable | null>(null);
  const [historyView, setHistoryView] = useState<'payables' | 'history'>('payables');

  // New payable form state
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [npInvoiceNo, setNpInvoiceNo] = useState('');
  const [npReferenceNo, setNpReferenceNo] = useState('');
  const [npAmount, setNpAmount] = useState('');
  const [npDueDate, setNpDueDate] = useState('');
  const [npNotes, setNpNotes] = useState('');
  const [savingPayable, setSavingPayable] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [pay, pmts, pending, accts] = await Promise.all([
      supplierPayablesService.list(),
      supplierPaymentsService.list(),
      supplierPaymentsService.listPendingCheques(),
      bankAccountsService.list(),
    ]);
    setPayables(pay);
    setPayments(pmts);
    setPendingCheques(pending);
    setAccounts(accts);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    listSuppliers({ limit: 300 }).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const filteredSuppliers = useMemo(() => {
    if (!supplierQuery.trim()) return suppliers.slice(0, 20);
    const q = supplierQuery.trim().toLowerCase();
    return suppliers.filter(s => s.supplier_name_display?.toLowerCase().includes(q)).slice(0, 20);
  }, [suppliers, supplierQuery]);

  const kpi = useMemo(() => {
    // CANCELLED payables never count toward total/overdue/due-soon — voided
    // is voided, same treatment as a fully PAID one.
    const open = payables.filter(p => p.status !== 'PAID' && p.status !== 'CANCELLED');
    const totalOutstanding = roundTo2(open.reduce((s, p) => s + p.outstanding_amount, 0));
    const overdue = open.filter(p => {
      const d = daysUntil(p.due_date);
      return d !== null && d < 0;
    });
    const dueSoon = open.filter(p => {
      const d = daysUntil(p.due_date);
      return d !== null && d >= 0 && d <= 7;
    });
    return {
      totalOutstanding,
      overdueCount: overdue.length,
      overdueAmount: roundTo2(overdue.reduce((s, p) => s + p.outstanding_amount, 0)),
      dueSoonCount: dueSoon.length,
      dueSoonAmount: roundTo2(dueSoon.reduce((s, p) => s + p.outstanding_amount, 0)),
    };
  }, [payables]);

  const resetNewPayableForm = () => {
    setSelectedSupplier(null);
    setSupplierQuery('');
    setNpInvoiceNo('');
    setNpReferenceNo('');
    setNpAmount('');
    setNpDueDate('');
    setNpNotes('');
  };

  const submitNewPayable = async () => {
    if (!selectedSupplier?.id) { alert('⚠️ 请选择供应商。'); return; }
    const amt = Number(npAmount);
    if (!amt || amt <= 0) { alert('⚠️ 应付金额必须大于 0。'); return; }
    setSavingPayable(true);
    try {
      await supplierPayablesService.create({
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.supplier_name_display,
        invoice_no: npInvoiceNo || undefined,
        reference_no: npReferenceNo || undefined,
        amount: roundTo2(amt),
        due_date: npDueDate || undefined,
        notes: npNotes || undefined,
      });
      resetNewPayableForm();
      setShowNewPayable(false);
      await loadAll();
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '新增应付失败，请重试。'}`);
    } finally {
      setSavingPayable(false);
    }
  };

  const handleChequeAction = async (payment: SupplierPayment, status: 'CLEARED' | 'BOUNCED' | 'CANCELLED') => {
    try {
      await supplierPaymentsService.markChequeStatus(payment, status);
      await loadAll();
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '操作失败，请重试。'}`);
    }
  };

  const handleCancelPayable = async (payable: SupplierPayable) => {
    if (!confirm(`确认作废这笔应付账款吗？（${payable.supplier_name} — AED ${payable.amount.toFixed(2)}）`)) return;
    try {
      await supplierPayablesService.cancel(payable.id);
      await loadAll();
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '作废失败，请重试。'}`);
    }
  };

  if (!can('finance')) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="bg-white p-12 rounded-[40px] shadow-xl border border-gray-100 text-center space-y-6 max-w-md">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
            <Lock className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-black text-gray-800">PRIVATE AREA</h3>
          <p className="text-sm text-gray-400">你的账号没有财务权限，请联系管理员开通 "finance" 权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>应付账款 / Accounts Payable</h1>
        <button
          onClick={() => setShowNewPayable(v => !v)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#080D1E] text-white text-xs font-black uppercase tracking-widest hover:bg-[#CBA85C] transition-all"
        >
          <Plus className="w-4 h-4" /> 新增应付
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">总应付 / Total Outstanding</p>
          <p className="text-2xl font-black font-mono text-gray-800">AED {kpi.totalOutstanding.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-[#E0846A]" /> 已逾期 / Overdue</p>
          <p className="text-2xl font-black font-mono text-[#E0846A]">AED {kpi.overdueAmount.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 font-bold mt-1">{kpi.overdueCount} 笔</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#CBA85C]" /> 7天内到期 / Due Soon</p>
          <p className="text-2xl font-black font-mono text-[#CBA85C]">AED {kpi.dueSoonAmount.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 font-bold mt-1">{kpi.dueSoonCount} 笔</p>
        </div>
      </div>

      {/* New payable form */}
      {showNewPayable && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-5">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">新增应付 / New Payable</h3>
          <div className="space-y-1.5 relative">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">供应商 / Supplier</label>
            <input
              type="text"
              value={selectedSupplier ? selectedSupplier.supplier_name_display : supplierQuery}
              onChange={e => { setSelectedSupplier(null); setSupplierQuery(e.target.value); }}
              placeholder="搜索供应商名称…"
              className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
            />
            {!selectedSupplier && supplierQuery.trim() && filteredSuppliers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
                {filteredSuppliers.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelectedSupplier(s); setSupplierQuery(''); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0"
                  >
                    {s.supplier_name_display}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice No（可选）</label>
              <input value={npInvoiceNo} onChange={e => setNpInvoiceNo(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference No（可选）</label>
              <input value={npReferenceNo} onChange={e => setNpReferenceNo(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">应付金额 (AED)</label>
              <input type="number" step="0.01" value={npAmount} onChange={e => setNpAmount(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-black font-mono text-gray-700" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">到期日（可选）</label>
              <input type="date" value={npDueDate} onChange={e => setNpDueDate(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">备注（可选）</label>
            <input value={npNotes} onChange={e => setNpNotes(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={submitNewPayable}
              disabled={savingPayable}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#080D1E] text-white text-xs font-black uppercase tracking-widest hover:bg-[#CBA85C] transition-all disabled:opacity-40"
            >
              <Save className="w-4 h-4" /> {savingPayable ? '保存中…' : '保存'}
            </button>
            <button
              onClick={() => { resetNewPayableForm(); setShowNewPayable(false); }}
              className="px-6 py-3 rounded-xl bg-gray-100 text-gray-500 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Pending supplier cheques (out) — mirrors FinanceTracker's own pending-cheques card */}
      {pendingCheques.length > 0 && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <span className="font-black text-gray-800 uppercase text-xs tracking-[0.2em]">待清算支票 / Pending Cheques</span>
            <span className="text-[10px] px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600 font-black tracking-widest">{pendingCheques.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingCheques.map(p => {
              const issuedFrom = accounts.find(a => a.id === p.issued_from_bank_account_id);
              return (
                <div key={p.id} className="p-6 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-700">
                      <span className="inline-block px-2 py-0.5 mr-2 rounded-md text-[9px] font-black uppercase tracking-widest align-middle bg-[#A85D45]/10 text-[#A85D45]">付款 OUT</span>
                      {p.supplier_name} — <span className="font-mono">{p.cheque_bank}</span> #{p.cheque_number}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                      {p.payment_date} · {p.cheque_date} · AED {(p.cheque_amount ?? p.amount).toFixed(2)}
                      {issuedFrom ? ` · Issued From ${issuedFrom.account_name}` : ' · ⚠️ 缺少 Issued From 账户'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleChequeAction(p, 'CLEARED')} className="px-4 py-2 rounded-xl bg-[#3F7D58] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#2d5c40]">标记已清算</button>
                    <button onClick={() => handleChequeAction(p, 'BOUNCED')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">退票</button>
                    <button onClick={() => handleChequeAction(p, 'CANCELLED')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">作废</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payables / Payment history toggle */}
      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-sm flex gap-2 w-fit">
        <button
          onClick={() => setHistoryView('payables')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${historyView === 'payables' ? 'bg-[#080D1E] text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          应付列表
        </button>
        <button
          onClick={() => setHistoryView('history')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${historyView === 'history' ? 'bg-[#080D1E] text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          付款记录 / Payment History
        </button>
      </div>

      {historyView === 'payables' ? (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wide border-b">
              <tr>
                <th className="px-6 py-4">供应商</th>
                <th className="px-6 py-4">单据号</th>
                <th className="px-6 py-4 text-right">应付金额</th>
                <th className="px-6 py-4 text-right">已付</th>
                <th className="px-6 py-4 text-right">未付</th>
                <th className="px-6 py-4">到期日</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400 text-sm">加载中…</td></tr>
              )}
              {!loading && payables.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400 text-sm">暂无应付账款</td></tr>
              )}
              {!loading && payables.map(p => {
                const d = daysUntil(p.due_date);
                const isOpen = p.status !== 'PAID' && p.status !== 'CANCELLED';
                const overdue = isOpen && d !== null && d < 0;
                const canCancel = p.status === 'UNPAID' && p.paid_amount === 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-5 font-bold text-gray-700 text-sm">{p.supplier_name}</td>
                    <td className="px-6 py-5 font-mono text-xs text-gray-500">{p.invoice_no || p.reference_no || '—'}</td>
                    <td className="px-6 py-5 text-right font-mono font-bold text-gray-700">{p.amount.toFixed(2)}</td>
                    <td className="px-6 py-5 text-right font-mono text-[#3F7D58]">{p.paid_amount.toFixed(2)}</td>
                    <td className="px-6 py-5 text-right font-mono font-bold text-[#E0846A]">{p.outstanding_amount.toFixed(2)}</td>
                    <td className={`px-6 py-5 text-xs font-bold font-mono ${overdue ? 'text-red-500' : 'text-gray-500'}`}>{p.due_date || '—'}{overdue ? ' ⚠️' : ''}</td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black border ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={!isOpen}
                          onClick={() => setPayingPayable(p)}
                          className="px-4 py-2 rounded-xl bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#CBA85C] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          付款
                        </button>
                        {canCancel && (
                          <button
                            onClick={() => handleCancelPayable(p)}
                            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                          >
                            作废
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wide border-b">
              <tr>
                <th className="px-6 py-4">日期</th>
                <th className="px-6 py-4">供应商</th>
                <th className="px-6 py-4">方式</th>
                <th className="px-6 py-4 text-right">金额</th>
                <th className="px-6 py-4">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">暂无付款记录</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-5 font-mono text-xs text-gray-500">{p.payment_date}</td>
                  <td className="px-6 py-5 font-bold text-gray-700 text-sm">{p.supplier_name}</td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-gray-100 text-gray-600">
                      {p.payment_method}{p.payment_method === 'CHEQUE' && p.cheque_status ? ` · ${p.cheque_status}` : ''}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right font-mono font-bold text-[#E0846A]">{p.amount.toFixed(2)}</td>
                  <td className="px-6 py-5 text-xs text-gray-500">{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payingPayable && (
        <SupplierPaymentModal
          payable={payingPayable}
          accounts={accounts}
          onClose={() => setPayingPayable(null)}
          onSuccess={loadAll}
        />
      )}
    </div>
  );
};

export default AccountsPayable;
