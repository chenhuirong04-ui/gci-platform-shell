import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Trash2, Calendar, FileText, PlusCircle,
  Building2, User, Wallet, Lock, Landmark, Plus, X, CreditCard, FileDown
} from 'lucide-react';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb';
import { bankAccountsService } from '../services/bankAccountsService';
import { exportElementToPdf, exportElementsToPdf } from '../services/pdfExport';
import { BankDetailsCard, BankDetailsModal } from './BankDetailsExport';
import {
  PaymentMethodFields, emptyPaymentMethodValue, validatePaymentMethodValue, buildPaymentMethodPayload,
  bankTransferEligible, type PaymentMethodFormValue,
} from './PaymentMethodFields';
import { useAuth } from '../../../apps/shell/src/contexts/AuthContext';
import { CustomerProjectSelector, emptyCustomerProjectSelection, type CustomerProjectSelection } from '../../../apps/shell/src/components/CustomerProjectSelector';
import { listSuppliers } from '../../suppliers/lib/suppliersCloud';
import type { Supplier } from '../../suppliers/types';
import {
  INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, NON_OPERATING_INFLOW_CATEGORIES, TRANSFER_CATEGORIES,
  isIncomeCategory, isTransferCategory, classifyTransaction,
} from '../services/transactionCategories';
import type { TransactionRecord, BankAccount } from '../types';

/** Finance V1 (2026-09) — a cheque only counts toward any account's balance
 * once it has actually cleared; PENDING/BOUNCED/CANCELLED never do. Shared
 * by every place FinanceTracker sums transactions, so the rule can't drift
 * between the balance card, the top stats, and the per-account totals. */
const countsTowardBalance = (t: TransactionRecord) => t.payment_method !== 'CHEQUE' || t.cheque_status === 'CLEARED';

interface FinanceTrackerProps {
  onCancel: () => void;
}

const ACCOUNT_ICON: Record<BankAccount['account_type'], React.ElementType> = {
  Corporate: Building2,
  Personal: User,
  Cash: Wallet,
  Other: Landmark,
};

const FinanceTracker: React.FC<FinanceTrackerProps> = ({ onCancel }) => {
  const { can } = useAuth();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethodValue, setPaymentMethodValue] = useState<PaymentMethodFormValue>(emptyPaymentMethodValue());
  // Finance V1 (2026-09) — FinanceTracker is the only entry point that can
  // write either direction (Trade order payments / consignment settlements
  // are always 'in'), so a CHEQUE here needs to know up front whether it's
  // being received or issued — the Income/Expense buttons below only fire
  // at submit time, too late to label "Deposited To" vs "Issued From"
  // correctly while the form is still being filled in. addTransaction()
  // cross-checks this against whichever button is actually clicked.
  const [chequeDirection, setChequeDirection] = useState<'in' | 'out'>('in');

  // Finance Reporting V1 (2026-09-15) — manual entry now requires a
  // category (income list while about to click Income, expense list while
  // about to click Expense — the same "which button, which rules apply"
  // pattern chequeDirection already uses above) and optionally links to a
  // real customer/project or supplier. Never both at once — a manual entry
  // is either sales-adjacent or supplier-adjacent, not both.
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [linkMode, setLinkMode] = useState<'none' | 'customer' | 'supplier'>('none');
  const [cpSelection, setCpSelection] = useState<CustomerProjectSelection>(emptyCustomerProjectSelection());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const [showAddAccount, setShowAddAccount] = useState(false);
  const emptyNewAccount = {
    account_name: '',
    account_type: 'Corporate' as BankAccount['account_type'],
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    iban: '',
    swift_bic: '',
    currency: 'AED',
    bank_address: '',
    branch_name: '',
    opening_balance: '',
  };
  const [newAcc, setNewAcc] = useState(emptyNewAccount);
  const setNewAccField = (field: keyof typeof emptyNewAccount, value: string) =>
    setNewAcc(prev => ({ ...prev, [field]: value }));
  const [savingAccount, setSavingAccount] = useState(false);

  // Bank details export (Finance V1, 2026-09) — view/copy/export a single
  // Corporate account's bank details, or export all active Corporate
  // accounts as one combined PDF. Read-only against bank_accounts — no
  // schema, RLS, balance, or transactions changes.
  const [showBankDetailsFor, setShowBankDetailsFor] = useState<BankAccount | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const exportAllCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Cheque PENDING -> CLEARED/BOUNCED/CANCELLED (Finance V1, 2026-09) — the
  // account to deposit into is only asked for at this point, never at entry
  // time (matches real workflow: you don't always know where a cheque will
  // be deposited until you actually go deposit it).
  const [clearingChequeId, setClearingChequeId] = useState<string | null>(null);
  const [clearingDepositAccount, setClearingDepositAccount] = useState('');

  // Modal viewport fix (2026-09): lock background page scroll while the
  // "新增银行账户" modal is open, so only the modal's own body scrolls —
  // matches the pattern already used by MobileNavDrawer. Always restored on
  // close/unmount.
  useEffect(() => {
    if (!showAddAccount) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showAddAccount]);

  /**
   * Cloud-first, local-fallback read — same shape as before, minus the
   * seeding step. If both cloud and local come back empty, the ledger is
   * simply empty; nothing is ever auto-written to Production anymore.
   */
  const loadTransactions = async () => {
    try {
      const rows = await cloudDb.query('transactions', 1000, 0, {});
      const cloudList: TransactionRecord[] = (rows || []).map((r: any) => r?.payload).filter(Boolean);
      if (cloudList.length > 0) {
        setTransactions(cloudList);
        // Finance V1 fix (2026-09): this is caching what we just read, not
        // persisting a change — saveTransactions() would silently re-upsert
        // the whole list to cloud on every page load. cacheTransactionsLocally
        // never touches cloud.
        await persistence.cacheTransactionsLocally(cloudList);
        return;
      }
    } catch (e) {
      // ignore, fall back to local
    }

    const saved = await persistence.getTransactions();
    setTransactions(saved || []);
  };

  const loadAccounts = async () => {
    const list = await bankAccountsService.list();
    setAccounts(list);
    if (list.length > 0) {
      setActiveAccountId(prev => (list.find(a => a.id === prev) ? prev : list[0].id));
    } else {
      setActiveAccountId('');
    }
  };

  useEffect(() => {
    if (!can('finance')) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadAccounts(), loadTransactions()]);
      setLoading(false);
    })();
    listSuppliers({ limit: 300 }).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const filteredSuppliers = useMemo(() => {
    if (!supplierQuery.trim()) return suppliers.slice(0, 20);
    const q = supplierQuery.trim().toLowerCase();
    return suppliers.filter(s => s.supplier_name_display?.toLowerCase().includes(q)).slice(0, 20);
  }, [suppliers, supplierQuery]);

  if (!can('finance')) {
    return (
      <div className="h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] shadow-2xl border border-gray-100 max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 bg-[#CBA85C]/10 rounded-full flex items-center justify-center mx-auto text-[#CBA85C]">
            <Lock className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-[#080D1E] uppercase tracking-tighter">Private Area</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              你的账号没有财务权限，请联系管理员开通 “finance” 权限
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-full py-4 rounded-[20px] bg-[#080D1E] text-white font-black text-[10px] uppercase"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── balance math: opening_balance + matching transactions. Never a
  // stored/cached number — always derived so it can't drift from the ledger. ──
  const balanceForAccount = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    const rows = transactions.filter(t => t.bank_account_id === accountId && countsTowardBalance(t));
    const income = rows.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const expense = rows.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return roundTo2(acc.opening_balance + income - expense);
  };

  const stats = useMemo(() => {
    const bankTotal = roundTo2(
      accounts.filter(a => a.account_type !== 'Cash').reduce((s, a) => s + balanceForAccount(a.id), 0)
    );
    const cashTotal = roundTo2(
      accounts.filter(a => a.account_type === 'Cash').reduce((s, a) => s + balanceForAccount(a.id), 0)
    );
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const linkedTxns = transactions.filter(t => t.bank_account_id && accounts.some(a => a.id === t.bank_account_id) && countsTowardBalance(t));
    const monthIncome = roundTo2(
      linkedTxns.filter(t => t.type === 'in' && (t.date || '').startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0)
    );
    const monthExpense = roundTo2(
      linkedTxns.filter(t => t.type === 'out' && (t.date || '').startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0)
    );
    return { bankTotal, cashTotal, monthIncome, monthExpense };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, transactions]);

  const activeAccount = accounts.find(a => a.id === activeAccountId) || null;
  const currentTransactions = transactions
    .filter(t => t.bank_account_id === activeAccountId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const activeBalance = activeAccountId ? balanceForAccount(activeAccountId) : 0;
  const activeIncome = roundTo2(currentTransactions.filter(t => t.type === 'in' && countsTowardBalance(t)).reduce((s, t) => s + t.amount, 0));
  const activeExpense = roundTo2(currentTransactions.filter(t => t.type === 'out' && countsTowardBalance(t)).reduce((s, t) => s + t.amount, 0));

  // Finance V1 (2026-09) — cheques awaiting clearance, shown regardless of
  // the currently selected account since a PENDING cheque has no
  // bank_account_id yet (see types.ts TransactionRecord doc comment).
  const pendingCheques = transactions
    .filter(t => t.payment_method === 'CHEQUE' && t.cheque_status === 'PENDING')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const addTransaction = async (type: 'in' | 'out') => {
    if (!note.trim() || !amount || Number(amount) <= 0) return;

    // Finance Reporting V1 (2026-09-15) — category is required, and must
    // match the button actually clicked (an Income category can't be
    // submitted via the Expense button and vice versa) — same
    // cross-check pattern as the CHEQUE direction guard right below.
    if (!category) { alert('⚠️ 请选择分类 Category。'); return; }
    // INTERNAL_TRANSFER is the one bidirectional category (2026-09-15) —
    // a transfer between the company's own accounts is recorded as two
    // ordinary manual entries, one 'out' on the source account and one
    // 'in' on the destination account, both tagged INTERNAL_TRANSFER — so
    // it skips the normal income/expense direction cross-check entirely.
    if (!isTransferCategory(category) && isIncomeCategory(category) !== (type === 'in')) {
      alert(`⚠️ 「${category}」是${isIncomeCategory(category) ? '收入' : '支出'}分类，请点击对应的 ${isIncomeCategory(category) ? 'Income' : 'Expense'} 按钮提交。`);
      return;
    }

    // A CHEQUE's direction was already declared while filling in the form
    // (it decides Deposited To vs Issued From) — the clicked button must
    // agree, or the record would end up with the wrong cheque fields.
    if (paymentMethodValue.payment_method === 'CHEQUE' && chequeDirection !== type) {
      alert(`⚠️ 这张支票是「${chequeDirection === 'in' ? '收款支票 In' : '付款支票 Out'}」，请点击对应的 ${chequeDirection === 'in' ? 'Income' : 'Expense'} 按钮提交。`);
      return;
    }

    const syncError = validatePaymentMethodValue(paymentMethodValue, type);
    if (syncError) { alert(`⚠️ ${syncError}`); return; }

    let cashAccountId: string | null = null;
    if (paymentMethodValue.payment_method === 'CASH') {
      const resolved = await bankAccountsService.resolveActiveCashAccount();
      if (!resolved.ok) { alert(`⚠️ ${resolved.error}`); return; }
      cashAccountId = resolved.account.id;
    }

    const paymentFields = buildPaymentMethodPayload(paymentMethodValue, cashAccountId, type);

    const newTransaction: TransactionRecord = {
      id: `TXN-${Date.now()}`,
      date,
      note,
      type,
      amount: roundTo2(Number(amount)),
      ref_type: 'MANUAL',
      userId: 'Admin',
      category,
      subcategory: subcategory.trim() || undefined,
      source_module: 'FINANCE_MANUAL',
      customer_id: linkMode === 'customer' ? cpSelection.customerId || undefined : undefined,
      project_id: linkMode === 'customer' ? cpSelection.projectId || undefined : undefined,
      customer: linkMode === 'customer' ? cpSelection.customerName || undefined : undefined,
      supplier_id: linkMode === 'supplier' ? selectedSupplier?.id || undefined : undefined,
      supplier: linkMode === 'supplier' ? selectedSupplier?.supplier_name_display || undefined : undefined,
      ...paymentFields,
    };

    // Finance V1 fix (2026-09): a single new INSERT, not a re-upload of the
    // whole ledger history — see persistenceService.addTransaction(). The
    // old `saveTransactions([newTransaction, ...transactions])` pattern is
    // exactly what produced the ~7700 duplicate seed rows in Production.
    setTransactions(prev => [newTransaction, ...prev]);
    await persistence.addTransaction(newTransaction);

    // Jump the ledger view to wherever the money actually landed — a
    // PENDING cheque has no bank_account_id yet, so it stays wherever the
    // user was looking (it'll show up in "待清算支票" instead).
    if (newTransaction.bank_account_id) setActiveAccountId(newTransaction.bank_account_id);

    setNote('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setPaymentMethodValue(emptyPaymentMethodValue());
    setChequeDirection('in');
    setCategory('');
    setSubcategory('');
    setLinkMode('none');
    setCpSelection(emptyCustomerProjectSelection());
    setSelectedSupplier(null);
    setSupplierQuery('');
  };

  // Finance V1 (2026-09): 'in' cheques ask for a deposit account at
  // clearing time (depositAccountId param); 'out' cheques already had
  // their Issued From account chosen at creation, so clearing one just
  // needs the status flip — no account picker required here.
  const markChequeStatus = async (t: TransactionRecord, status: 'CLEARED' | 'BOUNCED' | 'CANCELLED', depositAccountId?: string) => {
    const isOut = t.type === 'out';
    if (status === 'CLEARED') {
      if (isOut) {
        if (!t.issued_from_bank_account_id) {
          alert('⚠️ 该支票缺少开票账户 (Issued From)，无法标记为已清算。');
          return;
        }
      } else if (!depositAccountId) {
        alert('⚠️ 标记为 Cleared 时必须选择存入哪个银行账户。');
        return;
      }
    }
    const clearedAccountId = isOut ? t.issued_from_bank_account_id : depositAccountId;
    const updated: TransactionRecord = {
      ...t,
      cheque_status: status,
      bank_account_id: status === 'CLEARED' ? clearedAccountId : undefined,
      ...(isOut ? {} : { deposited_to_bank_account_id: status === 'CLEARED' ? depositAccountId : undefined }),
    };
    setTransactions(prev => prev.map(x => (x.id === t.id ? updated : x)));
    await persistence.updateTransaction(updated);
    if (status === 'CLEARED' && clearedAccountId) setActiveAccountId(clearedAccountId);
  };

  const handleDelete = async (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    // Local-only delete on purpose (unchanged from before) — no cloud delete
    // rule yet, keeps this a low-risk V1 change. Finance V1 fix (2026-09):
    // this now genuinely IS local-only — saveTransactions() was silently
    // re-upserting the whole remaining list to cloud, contradicting this
    // comment. cacheTransactionsLocally never touches cloud.
    await persistence.cacheTransactionsLocally(updated);
  };

  const handleCreateAccount = async () => {
    if (!newAcc.account_name.trim()) return;
    const isCash = newAcc.account_type === 'Cash';
    setSavingAccount(true);
    try {
      const created = await bankAccountsService.create({
        account_name: newAcc.account_name.trim(),
        account_type: newAcc.account_type,
        currency: newAcc.currency.trim() || 'AED',
        opening_balance: newAcc.opening_balance ? Number(newAcc.opening_balance) : 0,
        // Cash accounts have no bank — banking detail fields stay empty
        // regardless of what's in the form (they're hidden for Cash anyway).
        bank_name: isCash ? undefined : newAcc.bank_name.trim() || undefined,
        account_holder_name: isCash ? undefined : newAcc.account_holder_name.trim() || undefined,
        account_number: isCash ? undefined : newAcc.account_number.trim() || undefined,
        iban: isCash ? undefined : newAcc.iban.trim() || undefined,
        swift_bic: isCash ? undefined : newAcc.swift_bic.trim() || undefined,
        bank_address: isCash ? undefined : newAcc.bank_address.trim() || undefined,
        branch_name: isCash ? undefined : newAcc.branch_name.trim() || undefined,
      });
      if (created) {
        await loadAccounts();
        setActiveAccountId(created.id);
      }
      setShowAddAccount(false);
      setNewAcc(emptyNewAccount);
    } catch (e: any) {
      alert(`创建账户失败：${e?.message || '未知错误'}`);
    } finally {
      setSavingAccount(false);
    }
  };

  const slugify = (s: string) => (s || 'account').trim().replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60);

  const handleExportSingleBankDetails = async (el: HTMLDivElement, account: BankAccount) => {
    await exportElementToPdf(el, `GCI_Bank_Details_${slugify(account.account_name)}.pdf`, { scale: 2 });
  };

  const activeCorporateAccounts = accounts.filter(a => a.account_type === 'Corporate' && a.is_active);

  const handleExportAllCorporate = async () => {
    if (activeCorporateAccounts.length === 0) {
      alert('没有可导出的 Corporate 账户（需要 account_type=Corporate 且 is_active）。');
      return;
    }
    setExportingAll(true);
    try {
      const els = activeCorporateAccounts
        .map(a => exportAllCardRefs.current[a.id])
        .filter((el): el is HTMLDivElement => !!el);
      await exportElementsToPdf(els, `GCI_Corporate_Bank_Details_${new Date().toISOString().slice(0, 10)}.pdf`, { scale: 2 });
    } catch (e: any) {
      alert(`导出失败：${e?.message || '未知错误'}`);
    } finally {
      setExportingAll(false);
    }
  };

  if (loading) {
    return <div className="h-[calc(100vh-250px)] flex items-center justify-center text-gray-300 text-xs font-black uppercase tracking-widest">Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>财务账</h1>
        <div className="flex items-center gap-2">
          {activeCorporateAccounts.length > 0 && (
            <button
              onClick={handleExportAllCorporate}
              disabled={exportingAll}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-[11px] font-black uppercase tracking-widest hover:border-[#CBA85C] transition-all disabled:opacity-40"
              title="导出全部 Corporate 账户的银行信息（Cash/Personal/Other 不包含）"
            >
              <FileDown className="w-4 h-4" />
              {exportingAll ? '导出中...' : 'Export All Corporate Accounts'}
            </button>
          )}
          <button
            onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#080D1E] text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-[#CBA85C] transition-all"
          >
            <Plus className="w-4 h-4" /> 新增账户
          </button>
        </div>
      </div>

      {/* Off-screen render targets for "Export All Corporate Accounts" —
          same BankDetailsCard template as the on-screen view modal, laid
          out off-screen so html2canvas can capture each one. Not visible,
          not interactive. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        {activeCorporateAccounts.map(acc => (
          <BankDetailsCard key={acc.id} account={acc} ref={(el) => { exportAllCardRefs.current[acc.id] = el; }} />
        ))}
      </div>

      {/* Top summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">总银行余额</p>
          <p className="text-xl font-black font-mono text-gray-800">AED {stats.bankTotal.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cash 余额</p>
          <p className="text-xl font-black font-mono text-gray-800">AED {stats.cashTotal.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">本月收款</p>
          <p className="text-xl font-black font-mono text-[#3F7D58]">+{stats.monthIncome.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">本月付款</p>
          <p className="text-xl font-black font-mono text-[#E0846A]">-{stats.monthExpense.toFixed(2)}</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-100 shadow-sm text-center space-y-4">
          <Landmark className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-black text-gray-500">还没有任何银行账户</p>
          <p className="text-xs text-gray-400">点右上角「新增账户」先建一个对公/对私/现金账户，才能开始记流水</p>
        </div>
      ) : (
        <>
          {/* Account picker — replaces the old hardcoded Corporate/Personal/Cash tabs */}
          <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-md flex flex-wrap gap-2">
            {accounts.map((acc) => {
              const Icon = ACCOUNT_ICON[acc.account_type] || Landmark;
              const isActive = activeAccountId === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => setActiveAccountId(acc.id)}
                  className={`flex-1 min-w-[180px] flex items-center justify-between gap-2 py-3 px-4 rounded-xl text-xs font-black transition-all ${
                    isActive ? 'bg-[#080D1E] text-white shadow-lg' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    <span className="truncate">{acc.account_name}</span>
                  </span>
                  <span className="font-mono opacity-80 shrink-0">{balanceForAccount(acc.id).toFixed(2)}</span>
                </button>
              );
            })}
          </div>

          {/* Pending cheques (Finance V1, 2026-09) — account-independent,
              since a PENDING cheque has no bank_account_id yet. */}
          {pendingCheques.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                <span className="font-black text-gray-800 uppercase text-xs tracking-[0.2em]">待清算支票 / Pending Cheques</span>
                <span className="text-[10px] px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600 font-black tracking-widest">{pendingCheques.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingCheques.map(t => {
                  const isOut = t.type === 'out';
                  const issuedFromAccount = isOut ? accounts.find(a => a.id === t.issued_from_bank_account_id) : null;
                  return (
                    <div key={t.id} className="p-6 flex flex-col gap-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="text-sm font-bold text-gray-700">
                            <span className={`inline-block px-2 py-0.5 mr-2 rounded-md text-[9px] font-black uppercase tracking-widest align-middle ${isOut ? 'bg-[#A85D45]/10 text-[#A85D45]' : 'bg-[#3F7D58]/10 text-[#3F7D58]'}`}>
                              {isOut ? '付款 OUT' : '收款 IN'}
                            </span>
                            {t.note} — <span className="font-mono">{t.cheque_bank}</span> #{t.cheque_number}
                          </p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                            {t.date} · {t.cheque_date} · AED {(t.cheque_amount ?? t.amount).toFixed(2)}
                            {isOut && (issuedFromAccount ? ` · Issued From ${issuedFromAccount.account_name}` : ' · ⚠️ 缺少 Issued From 账户')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (isOut) {
                                markChequeStatus(t, 'CLEARED');
                              } else {
                                setClearingChequeId(clearingChequeId === t.id ? null : t.id);
                                setClearingDepositAccount('');
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-[#3F7D58] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#2d5c40]"
                          >
                            标记已清算
                          </button>
                          <button
                            onClick={() => markChequeStatus(t, 'BOUNCED')}
                            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200"
                          >
                            退票
                          </button>
                          <button
                            onClick={() => markChequeStatus(t, 'CANCELLED')}
                            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200"
                          >
                            作废
                          </button>
                        </div>
                      </div>
                      {!isOut && clearingChequeId === t.id && (
                        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
                          <select
                            className="flex-1 p-3 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700 text-sm"
                            value={clearingDepositAccount}
                            onChange={e => setClearingDepositAccount(e.target.value)}
                          >
                            <option value="">选择存入账户 Deposited To…</option>
                            {bankTransferEligible(accounts).map(a => (
                              <option key={a.id} value={a.id}>{a.account_name}{a.bank_name ? ' · ' + a.bank_name : ''} · {a.currency}</option>
                            ))}
                          </select>
                          <button
                            onClick={async () => {
                              await markChequeStatus(t, 'CLEARED', clearingDepositAccount);
                              setClearingChequeId(null);
                            }}
                            disabled={!clearingDepositAccount}
                            className="px-5 py-3 rounded-xl bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                          >
                            确认
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col lg:flex-row gap-8">
            <div className="lg:w-2/5 flex flex-col gap-6">
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${activeBalance >= 0 ? 'bg-[#6FBF8E]' : 'bg-[#E0846A]'}`} />
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
                      Current Balance ({activeAccount?.account_name || '-'})
                    </p>
                    <p className={`text-4xl font-black font-mono tracking-tighter ${activeBalance >= 0 ? 'text-gray-800' : 'text-[#E0846A]'}`}>
                      {activeAccount?.currency || 'AED'} {activeBalance.toFixed(2)}
                    </p>
                  </div>
                  <div className={`p-4 rounded-2xl ${activeBalance >= 0 ? 'bg-[#6FBF8E]/10 text-[#3F7D58]' : 'bg-[#E0846A]/10 text-[#E0846A]'}`}>
                    <DollarSign className="w-8 h-8" />
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-gray-50 pt-6">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Income</p>
                    <p className="text-lg font-black text-[#3F7D58] flex items-center gap-1.5 font-mono">
                      <TrendingUp className="w-4 h-4" />
                      {activeIncome.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expense</p>
                    <p className="text-lg font-black text-[#E0846A] flex items-center gap-1.5 font-mono">
                      <TrendingDown className="w-4 h-4" />
                      {activeExpense.toFixed(2)}
                    </p>
                  </div>
                </div>

                {activeAccount?.account_type === 'Corporate' && (
                  <button
                    onClick={() => setShowBankDetailsFor(activeAccount)}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 text-gray-700 font-black text-[10px] uppercase tracking-widest hover:border-[#CBA85C] hover:text-[#CBA85C] transition-all"
                  >
                    <CreditCard className="w-4 h-4" /> 银行信息 / Bank Details
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-50">
                  <h3 className="font-black text-gray-800 flex items-center gap-3 uppercase text-sm tracking-widest">
                    <PlusCircle className="w-5 h-5 text-[#CBA85C]" />
                    Quick Entry
                  </h3>
                </div>

                <div className="space-y-5">
                  {/* Finance Reporting V1 (2026-09-15) — category decides
                      which report bucket this manual entry lands in
                      (income/expense breakdown, customer/supplier ranking).
                      Required; the list shown here is neutral (both income
                      and expense options together, grouped) since the form
                      doesn't know Income vs Expense until the user clicks
                      one of the two submit buttons below — addTransaction()
                      cross-checks the pick against whichever was clicked. */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Category / 分类 *</label>
                    <select
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      <option value="">选择分类…</option>
                      <optgroup label="收入 Income">
                        {INCOME_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </optgroup>
                      <optgroup label="非经营流入 Non-Operating（仅 Income 按钮）">
                        {NON_OPERATING_INFLOW_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </optgroup>
                      <optgroup label="转账 Transfer（Income/Expense 均可）">
                        {TRANSFER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </optgroup>
                      <optgroup label="支出 Expense">
                        {MANUAL_EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </optgroup>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategory / 子分类（可选）</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                      value={subcategory}
                      onChange={e => setSubcategory(e.target.value)}
                    />
                  </div>

                  {/* Optional relation — either a real customer/project or a
                      real supplier, never both (a manual entry is either
                      sales-adjacent or supplier-adjacent). */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">关联 Link（可选）</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['none', 'customer', 'supplier'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setLinkMode(m)}
                          className={`p-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${linkMode === m ? 'bg-[#080D1E] text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                          {m === 'none' ? '不关联' : m === 'customer' ? '客户/项目' : '供应商'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {linkMode === 'customer' && (
                    <CustomerProjectSelector value={cpSelection} onChange={setCpSelection} allowLead={false} />
                  )}

                  {linkMode === 'supplier' && (
                    <div className="space-y-1.5 relative">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supplier / 供应商</label>
                      <input
                        type="text"
                        className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                        placeholder="搜索供应商名称…"
                        value={selectedSupplier ? selectedSupplier.supplier_name_display : supplierQuery}
                        onChange={e => { setSupplierQuery(e.target.value); setSelectedSupplier(null); }}
                      />
                      {!selectedSupplier && supplierQuery.trim() && filteredSuppliers.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
                          {filteredSuppliers.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setSelectedSupplier(s); setSupplierQuery(''); }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-sm font-bold text-gray-700"
                            >
                              {s.supplier_name_display}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Finance V1 (2026-09): payment method now decides which
                      account the entry lands on — CASH auto-resolves,
                      BANK_TRANSFER/CHEQUE ask explicitly. Replaces the old
                      plain "Account" dropdown, which let a manual entry get
                      written to any account regardless of how the money
                      actually moved. */}
                  {paymentMethodValue.payment_method === 'CHEQUE' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cheque Direction / 支票方向</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setChequeDirection('in')}
                          className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${chequeDirection === 'in' ? 'bg-[#3F7D58] text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                          收款支票 / In
                        </button>
                        <button
                          type="button"
                          onClick={() => setChequeDirection('out')}
                          className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${chequeDirection === 'out' ? 'bg-[#A85D45] text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                          付款支票 / Out
                        </button>
                      </div>
                    </div>
                  )}
                  <PaymentMethodFields
                    value={paymentMethodValue}
                    onChange={setPaymentMethodValue}
                    accounts={accounts}
                    type={paymentMethodValue.payment_method === 'CHEQUE' ? chequeDirection : 'in'}
                  />

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transaction Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700 font-mono"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Memo / Note</label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700"
                        placeholder="e.g. Sales Deposit"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700 font-mono text-xl"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button
                      onClick={() => addTransaction('in')}
                      disabled={!note || !amount || !category}
                      className="flex items-center justify-center gap-2 p-4 rounded-xl bg-[#3F7D58] text-white hover:bg-[#2d5c40] shadow-lg font-black uppercase text-xs tracking-widest disabled:opacity-40"
                    >
                      <TrendingUp className="w-4 h-4" /> Income
                    </button>
                    <button
                      onClick={() => addTransaction('out')}
                      disabled={!note || !amount || !category}
                      className="flex items-center justify-center gap-2 p-4 rounded-xl bg-[#A85D45] text-white hover:bg-[#8b4c37] shadow-lg font-black uppercase text-xs tracking-widest disabled:opacity-40"
                    >
                      <TrendingDown className="w-4 h-4" /> Expense
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                <span className="font-black text-gray-800 uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#CBA85C]" />
                  {activeAccount?.account_name || '-'} Ledger
                </span>
                <span className="text-[10px] px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600 font-black tracking-widest">
                  {currentTransactions.length} ENTRIES
                </span>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Memo</th>
                      <th className="px-6 py-4 text-right">Value</th>
                      <th className="px-4 py-4 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {currentTransactions.map(t => (
                      <tr key={t.id} className="hover:bg-[#CBA85C]/5 transition-colors group">
                        <td className="px-6 py-5 text-gray-400 font-mono text-[11px] whitespace-nowrap">{t.date}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${t.type === 'in' ? 'bg-[#6FBF8E]' : 'bg-[#E0846A]'}`} />
                            <span className="text-sm font-bold text-gray-700 uppercase">{t.note}</span>
                            {classifyTransaction(t) && (
                              <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#080D1E]/5 text-[#080D1E] font-black uppercase">{classifyTransaction(t)}</span>
                            )}
                            {t.ref_type && t.ref_type !== 'MANUAL' && (
                              <span className="text-[8px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-black uppercase">{t.ref_type}</span>
                            )}
                            {t.payment_method && (
                              <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#CBA85C]/10 text-[#8A6D2F] font-black uppercase">
                                {t.payment_method === 'CHEQUE' ? `CHEQUE · ${t.cheque_status}` : t.payment_method}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-5 text-right font-black font-mono text-sm tracking-tighter ${t.type === 'in' ? 'text-[#3F7D58]' : 'text-[#E0846A]'}`}>
                          {t.type === 'in' ? '+' : '-'}{t.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-5 text-right">
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="text-gray-200 hover:text-[#E0846A] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {currentTransactions.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-16 text-center text-gray-300 text-xs font-black uppercase tracking-widest">No entries yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {showAddAccount && createPortal(
        // Portal fix (2026-09): rendering this overlay from inside
        // FinanceTracker's own DOM subtree meant `fixed inset-0` could be
        // hijacked by any ancestor that establishes a new containing block
        // for fixed-position elements (a `transform`/`filter`/`will-change`
        // on ANY ancestor — including ones added transiently by animation
        // utility classes — makes `fixed` behave like `absolute` relative
        // to that ancestor instead of the real viewport). Confirmed in
        // Production: the modal's position drifted further down on each
        // open. Mounting straight onto document.body via a portal sidesteps
        // the whole ancestor chain — there is no longer any ancestor between
        // this overlay and <body> that could reinterpret `fixed`.
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[6000] flex items-center justify-center p-4 sm:p-8">
          <div
            className="bg-white rounded-[40px] shadow-2xl max-w-md w-full flex flex-col overflow-hidden"
            style={{ maxHeight: 'calc(100dvh - 32px)' }}
          >
            {/* Header — fixed, never scrolls */}
            <div className="shrink-0 flex items-center justify-between px-10 pt-10 pb-6">
              <h3 className="text-sm font-black text-[#080D1E] uppercase tracking-[0.2em]">新增银行账户</h3>
              <button onClick={() => { setShowAddAccount(false); setNewAcc(emptyNewAccount); }} className="text-gray-300 hover:text-gray-600 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body — the only part that scrolls, everything else stays put.
                flex-1 + min-h-0 is load-bearing here: without min-h-0, a flex
                item defaults to min-height:auto (sized to its content), so
                this div would grow to fit ALL fields instead of shrinking to
                the space actually left after Header/Footer — which is what
                pushed the card taller than the viewport and the button off
                the bottom of the screen in Production. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-10">
            <div className="space-y-5 pb-8">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">账户名称</label>
                <input
                  type="text"
                  className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                  placeholder="e.g. Emirates NBD - GCI Trading"
                  value={newAcc.account_name}
                  onChange={e => setNewAccField('account_name', e.target.value)}
                />
              </div>

              {newAcc.account_type !== 'Cash' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">账户持有人</label>
                  <input
                    type="text"
                    className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                    placeholder="e.g. Globalcare Info General Trading FZCO"
                    value={newAcc.account_holder_name}
                    onChange={e => setNewAccField('account_holder_name', e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">账户类型</label>
                <select
                  className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                  value={newAcc.account_type}
                  onChange={e => setNewAccField('account_type', e.target.value)}
                >
                  <option value="Corporate">Corporate (对公)</option>
                  <option value="Personal">Personal (对私)</option>
                  <option value="Cash">Cash (现金)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {newAcc.account_type !== 'Cash' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">银行名称</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                      placeholder="e.g. WIO Bank PJSC"
                      value={newAcc.bank_name}
                      onChange={e => setNewAccField('bank_name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Number / 账号</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono"
                      value={newAcc.account_number}
                      onChange={e => setNewAccField('account_number', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">IBAN</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono"
                      value={newAcc.iban}
                      onChange={e => setNewAccField('iban', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SWIFT / BIC</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono"
                      value={newAcc.swift_bic}
                      onChange={e => setNewAccField('swift_bic', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Currency</label>
                <input
                  type="text"
                  className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                  placeholder="AED"
                  value={newAcc.currency}
                  onChange={e => setNewAccField('currency', e.target.value.toUpperCase())}
                />
              </div>

              {newAcc.account_type !== 'Cash' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Address</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                      value={newAcc.bank_address}
                      onChange={e => setNewAccField('bank_address', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Branch</label>
                    <input
                      type="text"
                      className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
                      value={newAcc.branch_name}
                      onChange={e => setNewAccField('branch_name', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opening Balance（可选，默认 0）</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono"
                  placeholder="0.00"
                  value={newAcc.opening_balance}
                  onChange={e => setNewAccField('opening_balance', e.target.value)}
                />
              </div>
            </div>
            </div>

            {/* Footer — fixed, the submit button is always reachable without scrolling */}
            <div className="shrink-0 px-10 pt-6 pb-10 border-t border-gray-100">
              <button
                onClick={handleCreateAccount}
                disabled={!newAcc.account_name.trim() || savingAccount}
                className="w-full py-4 rounded-[20px] bg-[#080D1E] text-white font-black text-[10px] uppercase disabled:opacity-40"
              >
                {savingAccount ? '创建中...' : '创建账户'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBankDetailsFor && (
        <BankDetailsModal
          account={showBankDetailsFor}
          onClose={() => setShowBankDetailsFor(null)}
          onExportPdf={handleExportSingleBankDetails}
        />
      )}
    </div>
  );
};

export default FinanceTracker;
