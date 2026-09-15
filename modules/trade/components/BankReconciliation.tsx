import React, { useState, useEffect, useRef } from 'react';
import { Check, Link2, XCircle, Paperclip, Landmark } from 'lucide-react';
import { bankAccountsService } from '../services/bankAccountsService';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb';
import { listSuppliers } from '../../suppliers/lib/suppliersCloud';
import { getAllCustomerNames } from '../../../apps/shell/src/lib/crmSupabase';
import {
  uploadFinanceFile, computeFileHash, fileToBase64, suggestCategoryFromDescription,
  fuzzyMatchByName, parseStatementCsv, confirmBankLineAsTransaction, matchBankStatementLine,
  dateMatchTier, bankStatementService, type DateMatchTier,
} from '../services/bookkeepingService';
import {
  INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, NON_OPERATING_INFLOW_CATEGORIES, TRANSFER_CATEGORIES,
} from '../services/transactionCategories';
import type { BankAccount, BankStatementImport, BankStatementLine, TransactionRecord } from '../types';

interface LineDraft {
  row: BankStatementLine;
  category: string;
  customerId: string;
  customerName: string;
  supplierId: string;
  supplierName: string;
  busy: boolean;
}

interface Supplier { id: string; supplier_name_display: string }
interface CustomerOpt { id: string; customer_name: string }

function hasId<T extends { id?: string }>(s: T): s is T & { id: string } {
  return !!s.id;
}

export default function BankReconciliation() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [currentImport, setCurrentImport] = useState<BankStatementImport | null>(null);
  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [existingTxns, setExistingTxns] = useState<TransactionRecord[]>([]);
  const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    bankAccountsService.list().then(list => {
      setAccounts(list);
      if (list.length > 0) setAccountId(list[0].id);
    });
    listSuppliers({ limit: 500 }).then(list => setSuppliers(list.filter(hasId))).catch(() => setSuppliers([]));
    getAllCustomerNames().then(r => setCustomers(r.ok ? r.rows : [])).catch(() => setCustomers([]));
    (async () => {
      try {
        const rows = await cloudDb.query('transactions', 2000, 0, {});
        setExistingTxns((rows || []).map((r: any) => r?.payload).filter(Boolean));
      } catch {
        setExistingTxns(await persistence.getTransactions());
      }
    })();
  }, []);

  const buildDraft = (row: BankStatementLine): LineDraft => ({
    row,
    category: row.ai_suggested_category || '',
    customerId: row.ai_suggested_customer_id || '',
    customerName: row.ai_suggested_customer_id ? (customers.find(c => c.id === row.ai_suggested_customer_id)?.customer_name || '') : '',
    supplierId: row.ai_suggested_supplier_id || '',
    supplierName: row.ai_suggested_supplier_id ? (suppliers.find(s => s.id === row.ai_suggested_supplier_id)?.supplier_name_display || '') : '',
    busy: false,
  });

  const handleFile = async (file: File) => {
    if (!accountId) { setUploadError('请先选择银行账户。'); return; }
    setUploadError('');
    setUploading(true);
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      let parsed: { date: string | null; direction: 'in' | 'out' | null; amount: number; description: string }[] = [];

      if (isCsv) {
        const text = await file.text();
        parsed = parseStatementCsv(text);
      } else {
        const base64 = await fileToBase64(file);
        const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
        const res = await fetch('/api/finance/parse-bank-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType, data: base64 }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'AI 解析失败');
        parsed = data.lines || [];
      }
      if (parsed.length === 0) throw new Error('未能从文件中解析出任何流水行，请检查文件格式。');

      const fileHash = await computeFileHash(file);
      const { path, error: upErr } = await uploadFinanceFile('statements', file);
      if (upErr) throw new Error(`Storage: ${upErr}`);
      // createImport throws a friendly message on a duplicate
      // (bank_account_id, file_hash) — enforced by a DB UNIQUE constraint,
      // not just this check (see the migration).
      const imp = await bankStatementService.createImport(accountId, file.name, path, fileHash);

      const toInsert = parsed.filter(l => l.amount > 0).map(l => {
        const direction = l.direction || 'in';
        const suggestedCat = suggestCategoryFromDescription(l.description, direction);
        const matchedCustomer = direction === 'in' ? fuzzyMatchByName(l.description, customers, c => c.customer_name) : null;
        const matchedSupplier = direction === 'out' ? fuzzyMatchByName(l.description, suppliers, s => s.supplier_name_display) : null;
        return {
          import_id: imp.id,
          bank_account_id: accountId,
          line_date: l.date,
          direction,
          amount: l.amount,
          bank_description: l.description || '',
          ai_suggested_category: suggestedCat || undefined,
          ai_suggested_customer_id: matchedCustomer?.id,
          ai_suggested_supplier_id: matchedSupplier?.id,
          ai_confidence: isCsv ? undefined : 'ai',
        };
      });
      const created = await bankStatementService.createLines(toInsert);
      setCurrentImport(imp);
      setDrafts(created.map(buildDraft));
    } catch (e: any) {
      setUploadError(e?.message || '解析失败，请重试。');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateDraft = (lineId: string, patch: Partial<LineDraft>) => {
    setDrafts(prev => prev.map(d => (d.row.id === lineId ? { ...d, ...patch } : d)));
  };

  const attachToLine = async (lineId: string, file: File) => {
    const { path, error } = await uploadFinanceFile('bank-lines', file);
    if (error) { alert(`⚠️ 附件上传失败：${error}`); return; }
    await bankStatementService.updateLine(lineId, { storage_path: path, file_name: file.name, mime_type: file.type });
    setDrafts(prev => prev.map(d => (d.row.id === lineId
      ? { ...d, row: { ...d.row, storage_path: path, file_name: file.name, mime_type: file.type } }
      : d)));
  };

  // Confirm/match both go through atomic Postgres RPCs (see
  // bookkeepingService.ts header comment) — a bank_statement_line can only
  // ever be confirmed or matched ONCE, enforced in the database. `busy`
  // additionally disables the button immediately on click so a double-click
  // never even fires a second request, but the real guard is the RPC's
  // atomic claim, not this flag.
  const confirmLine = async (draft: LineDraft) => {
    if (draft.busy || draft.row.status !== 'pending') return;
    if (!draft.category) { alert('⚠️ 请先选择科目分类。'); return; }
    updateDraft(draft.row.id, { busy: true });
    try {
      const txnId = await confirmBankLineAsTransaction({
        lineId: draft.row.id,
        category: draft.category,
        customerId: draft.customerId || undefined,
        customerName: draft.customerName || undefined,
        supplierId: draft.supplierId || undefined,
        supplierName: draft.supplierName || undefined,
      });
      setDrafts(prev => prev.map(d => (d.row.id === draft.row.id ? { ...d, row: { ...d.row, status: 'confirmed', confirmed_transaction_ref: txnId }, busy: false } : d)));
      setExistingTxns(prev => [{
        id: txnId,
        date: draft.row.line_date || new Date().toISOString().split('T')[0],
        note: draft.row.bank_description,
        type: draft.row.direction || 'in',
        amount: draft.row.amount,
        bank_account_id: draft.row.bank_account_id,
        reconciliation_status: 'matched',
      } as TransactionRecord, ...prev]);
    } catch (e: any) {
      alert(`⚠️ 入账失败：${e?.message || '请重试'}`);
      // Re-sync this line's real status from the server — a failure here
      // most likely means someone else already confirmed/matched it.
      const fresh = await bankStatementService.listLines(draft.row.import_id);
      const freshRow = fresh.find(l => l.id === draft.row.id);
      updateDraft(draft.row.id, { busy: false, ...(freshRow ? { row: freshRow } : {}) });
    }
  };

  const ignoreLine = async (draft: LineDraft) => {
    if (draft.row.status !== 'pending') return;
    await bankStatementService.updateLine(draft.row.id, { status: 'ignored' });
    setDrafts(prev => prev.map(d => (d.row.id === draft.row.id ? { ...d, row: { ...d.row, status: 'ignored' } } : d)));
  };

  // Hard filters (account/direction/amount) + date-proximity scoring —
  // same-day best, then ±1 day, then ±3 days; anything older is never
  // suggested at all. Always a suggestion list the user clicks, never an
  // automatic match.
  const candidateMatches = (draft: LineDraft): { txn: TransactionRecord; tier: DateMatchTier }[] => {
    const tierRank: Record<DateMatchTier, number> = { same_day: 0, within_1_day: 1, within_3_days: 2 };
    return existingTxns
      .filter(t =>
        t.bank_account_id === draft.row.bank_account_id &&
        t.type === draft.row.direction &&
        Math.abs(t.amount - draft.row.amount) < 0.01 &&
        !t.reconciliation_status
      )
      .map(txn => ({ txn, tier: dateMatchTier(draft.row.line_date, txn.date) }))
      .filter((x): x is { txn: TransactionRecord; tier: DateMatchTier } => x.tier !== null)
      .sort((a, b) => tierRank[a.tier] - tierRank[b.tier])
      .slice(0, 5);
  };

  const TIER_LABEL: Record<DateMatchTier, string> = { same_day: '同日', within_1_day: '±1天', within_3_days: '±3天' };

  const linkToExisting = async (draft: LineDraft, txn: TransactionRecord) => {
    if (draft.row.status !== 'pending') return;
    try {
      await matchBankStatementLine(draft.row.id, txn.id);
      setDrafts(prev => prev.map(d => (d.row.id === draft.row.id ? { ...d, row: { ...d.row, status: 'matched', matched_transaction_ref: txn.id } } : d)));
      setMatchingLineId(null);
    } catch (e: any) {
      alert(`⚠️ 关联失败：${e?.message || '请重试'}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Landmark className="w-3 h-3" /> Bank Account</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="p-3 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700 text-sm min-w-[220px]">
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">上传银行对账单 (CSV / PDF / 图片)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,application/pdf,image/*"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            disabled={uploading}
            className="text-sm"
          />
        </div>
        {uploading && <span className="text-xs font-black text-[#CBA85C] uppercase">AI 解析中…</span>}
        {uploadError && <span className="text-xs font-bold text-red-500">{uploadError}</span>}
      </div>

      {drafts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <span className="font-black text-gray-800 uppercase text-xs tracking-[0.2em]">{currentImport?.file_name} — {drafts.length} 笔</span>
          </div>
          <div className="divide-y divide-gray-50">
            {drafts.map(draft => {
              const r = draft.row;
              const allCategories = r.direction === 'in'
                ? [...INCOME_CATEGORIES, ...NON_OPERATING_INFLOW_CATEGORIES, ...TRANSFER_CATEGORIES]
                : [...MANUAL_EXPENSE_CATEGORIES, { value: 'SUPPLIER_PAYMENT', label: 'Supplier Payment / 供应商付款' }, ...TRANSFER_CATEGORIES];
              return (
                <div key={r.id} className="p-5 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-mono text-gray-400 w-24 shrink-0">{r.line_date || '—'}</span>
                  <span className={`text-[9px] px-2 py-1 rounded-md font-black uppercase w-12 text-center shrink-0 ${r.direction === 'in' ? 'bg-[#3F7D58]/10 text-[#3F7D58]' : 'bg-[#E0846A]/10 text-[#E0846A]'}`}>{r.direction}</span>
                  <span className="font-mono font-black text-sm w-24 text-right shrink-0">{r.amount.toFixed(2)}</span>
                  <span className="text-xs text-gray-500 flex-1 min-w-[140px] truncate" title={r.bank_description}>{r.bank_description}</span>

                  {r.status === 'pending' ? (
                    <>
                      <select
                        value={draft.category}
                        onChange={e => updateDraft(r.id, { category: e.target.value })}
                        className="p-2 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-xs font-bold text-gray-700 max-w-[160px]"
                      >
                        <option value="">科目…</option>
                        {allCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <input
                        placeholder="客户/供应商"
                        value={draft.customerName || draft.supplierName}
                        onChange={e => {
                          if (r.direction === 'in') updateDraft(r.id, { customerName: e.target.value, customerId: '' });
                          else updateDraft(r.id, { supplierName: e.target.value, supplierId: '' });
                        }}
                        className="p-2 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-xs font-bold text-gray-700 w-28"
                      />
                      <input
                        ref={el => { attachRefs.current[r.id] = el; }}
                        type="file"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) attachToLine(r.id, f); }}
                      />
                      <button onClick={() => attachRefs.current[r.id]?.click()} className={`p-2 rounded-lg ${r.storage_path ? 'text-[#3F7D58]' : 'text-gray-300 hover:text-gray-500'}`} title="上传补充凭证">
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <button onClick={() => confirmLine(draft)} disabled={draft.busy} className="px-3 py-2 rounded-lg bg-[#080D1E] text-white text-[10px] font-black uppercase flex items-center gap-1 disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" /> 确认入账
                      </button>
                      <button onClick={() => setMatchingLineId(matchingLineId === r.id ? null : r.id)} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5" /> 关联已有
                      </button>
                      <button onClick={() => ignoreLine(draft)} className="p-2 rounded-lg text-gray-300 hover:text-red-500" title="忽略">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className={`text-[10px] px-3 py-1.5 rounded-full font-black uppercase ${r.status === 'confirmed' ? 'bg-[#3F7D58]/10 text-[#3F7D58]' : r.status === 'matched' ? 'bg-[#4A6090]/10 text-[#4A6090]' : 'bg-gray-100 text-gray-400'}`}>{r.status}</span>
                  )}

                  {matchingLineId === r.id && (
                    <div className="w-full pl-24 pt-2 space-y-1">
                      {candidateMatches(draft).map(({ txn, tier }) => (
                        <button key={txn.id} onClick={() => linkToExisting(draft, txn)} className="w-full text-left text-xs bg-gray-50 hover:bg-gray-100 rounded-lg p-2 font-bold text-gray-600 flex items-center gap-2">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase shrink-0 ${tier === 'same_day' ? 'bg-[#3F7D58]/10 text-[#3F7D58]' : tier === 'within_1_day' ? 'bg-[#CBA85C]/10 text-[#8A6D2F]' : 'bg-gray-200 text-gray-500'}`}>{TIER_LABEL[tier]}</span>
                          <span>{txn.date} · {txn.amount.toFixed(2)} · {txn.note} · {txn.ref_type}</span>
                        </button>
                      ))}
                      {candidateMatches(draft).length === 0 && <p className="text-[11px] text-gray-300">3天内没有找到金额/账户/方向匹配的现有记录。</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
