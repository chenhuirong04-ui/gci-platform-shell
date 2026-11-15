import React, { useState, useEffect, useRef } from 'react';
import { Upload, Check, FileClock } from 'lucide-react';
import { bankAccountsService } from '../services/bankAccountsService';
import { listSuppliers } from '../../suppliers/lib/suppliersCloud';
import { getAllCustomerNames } from '../../../apps/shell/src/lib/crmSupabase';
import { CustomerProjectSelector, emptyCustomerProjectSelection, type CustomerProjectSelection } from '../../../apps/shell/src/components/CustomerProjectSelector';
import {
  uploadFinanceFile, fileToBase64, suggestCategoryFromDescription, fuzzyMatchByName,
  confirmVoucherAsTransaction, confirmVoucherAsPayable, financeVoucherService,
} from '../services/bookkeepingService';
import { INCOME_CATEGORIES, MANUAL_EXPENSE_CATEGORIES, NON_OPERATING_INFLOW_CATEGORIES, TRANSFER_CATEGORIES } from '../services/transactionCategories';
import type { BankAccount } from '../types';
import { useI18n } from '@gci/i18n';

type Direction = 'in' | 'out';
type PaymentContext = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';

interface Supplier { id: string; supplier_name_display: string }
interface CustomerOpt { id: string; customer_name: string }

function hasId<T extends { id?: string }>(s: T): s is T & { id: string } {
  return !!s.id;
}

interface ParsedVoucherFields {
  date?: string; amount?: number; currency?: string; counterparty?: string;
  invoice_no?: string; vat_amount?: number; description?: string; confidence?: string;
}

export default function VoucherEntry() {
  const [direction, setDirection] = useState<Direction>('out');
  const { dict } = useI18n();
  const tf = dict.trade.finance;
  const t = tf.voucher;
  const catName = (c: { value: string; label: string }) => (tf.categories as Record<string, string>)[c.value] || c.label;
  const [context, setContext] = useState<PaymentContext>('BANK_TRANSFER');
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [fields, setFields] = useState<ParsedVoucherFields>({});
  const [purposeNote, setPurposeNote] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [linkMode, setLinkMode] = useState<'none' | 'customer' | 'supplier'>('none');
  const [cpSelection, setCpSelection] = useState<CustomerProjectSelection>(emptyCustomerProjectSelection());
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'transaction' | 'payable' | null>(null);

  useEffect(() => {
    bankAccountsService.list().then(setAccounts);
    listSuppliers({ limit: 500 }).then(list => setSuppliers(list.filter(hasId))).catch(() => setSuppliers([]));
    getAllCustomerNames().then(r => setCustomers(r.ok ? r.rows : [])).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    setLinkMode(direction === 'out' ? 'supplier' : 'customer');
  }, [direction]);

  const filteredSuppliers = suppliers.filter(s =>
    supplierQuery.trim() ? s.supplier_name_display?.toLowerCase().includes(supplierQuery.trim().toLowerCase()) : true
  ).slice(0, 15);

  const handleFile = async (f: File) => {
    setFile(f);
    setParseError('');
    setDone(null);
    setParsing(true);
    try {
      const base64 = await fileToBase64(f);
      const mimeType = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
      const res = await fetch('/api/finance/parse-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, data: base64 }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || t.errAi);
      const pf: ParsedVoucherFields = data.fields || {};
      setFields(pf);
      setPurposeNote(pf.description || '');

      const suggestedCat = suggestCategoryFromDescription(pf.description || '', direction);
      if (suggestedCat) setCategory(suggestedCat);

      if (direction === 'out') {
        const match = fuzzyMatchByName(pf.counterparty, suppliers, s => s.supplier_name_display);
        if (match) { setSelectedSupplier(match); setLinkMode('supplier'); }
      } else {
        const match = fuzzyMatchByName(pf.counterparty, customers, c => c.customer_name);
        if (match) { setCpSelection({ ...emptyCustomerProjectSelection(), customerId: match.id, customerName: match.customer_name }); setLinkMode('customer'); }
      }
    } catch (e: any) {
      setParseError(e?.message || t.errParse);
    } finally {
      setParsing(false);
    }
  };

  const reset = () => {
    setFile(null); setFields({}); setPurposeNote(''); setCategory(''); setSubcategory('');
    setLinkMode(direction === 'out' ? 'supplier' : 'customer');
    setCpSelection(emptyCustomerProjectSelection()); setSelectedSupplier(null); setSupplierQuery('');
    setDueDate(''); setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submitAsPaid = async () => {
    if (!file) return;
    if (!category) { alert(t.errCategory); return; }
    if (!fields.amount || fields.amount <= 0) { alert(t.errAmount); return; }
    setSubmitting(true);
    try {
      const { path, error } = await uploadFinanceFile('vouchers', file);
      if (error) throw new Error(`Storage: ${error}`);

      const voucher = await financeVoucherService.create({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        payment_context: context,
        bank_account_id: context === 'BANK_TRANSFER' ? bankAccountId || undefined : undefined,
        purpose_note: purposeNote,
        ai_date: fields.date,
        ai_amount: fields.amount,
        ai_counterparty: fields.counterparty,
        ai_invoice_no: fields.invoice_no,
        ai_vat_amount: fields.vat_amount,
        ai_description: fields.description,
        ai_suggested_category: category,
        ai_suggested_customer_id: linkMode === 'customer' ? cpSelection.customerId || undefined : undefined,
        ai_suggested_supplier_id: linkMode === 'supplier' ? selectedSupplier?.id || undefined : undefined,
        ai_suggested_project_id: linkMode === 'customer' ? cpSelection.projectId || undefined : undefined,
      });

      const txn = await confirmVoucherAsTransaction({
        direction,
        date: fields.date || new Date().toISOString().split('T')[0],
        amount: fields.amount,
        description: purposeNote || fields.description || 'Voucher entry',
        paymentMethod: context,
        bankAccountId: context === 'BANK_TRANSFER' ? bankAccountId || undefined : undefined,
        category,
        subcategory: subcategory || undefined,
        customerId: linkMode === 'customer' ? cpSelection.customerId || undefined : undefined,
        customerName: linkMode === 'customer' ? cpSelection.customerName || undefined : undefined,
        supplierId: linkMode === 'supplier' ? selectedSupplier?.id || undefined : undefined,
        supplierName: linkMode === 'supplier' ? selectedSupplier?.supplier_name_display || undefined : undefined,
        projectId: linkMode === 'customer' ? cpSelection.projectId || undefined : undefined,
        attachmentPath: path,
        attachmentFileName: file.name,
      });

      if (voucher) await financeVoucherService.update(voucher.id, { status: 'confirmed', resulting_transaction_ref: txn.id });
      setDone('transaction');
    } catch (e: any) {
      alert(`${t.errPost}${e?.message || tf.common.retry}`);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAsPayable = async () => {
    if (!file || !selectedSupplier) return;
    if (!fields.amount || fields.amount <= 0) { alert(t.errAmount); return; }
    setSubmitting(true);
    try {
      const { path, error } = await uploadFinanceFile('vouchers', file);
      if (error) throw new Error(`Storage: ${error}`);

      const voucher = await financeVoucherService.create({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        payment_context: context,
        bank_account_id: context === 'BANK_TRANSFER' ? bankAccountId || undefined : undefined,
        purpose_note: purposeNote,
        ai_date: fields.date,
        ai_amount: fields.amount,
        ai_counterparty: fields.counterparty,
        ai_invoice_no: fields.invoice_no,
        ai_vat_amount: fields.vat_amount,
        ai_description: fields.description,
        ai_suggested_category: category || 'SUPPLIER_PAYMENT',
        ai_suggested_supplier_id: selectedSupplier.id,
      });

      const payable = await confirmVoucherAsPayable({
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.supplier_name_display,
        amount: fields.amount,
        dueDate: dueDate || undefined,
        invoiceNo: fields.invoice_no,
        notes: purposeNote,
      });
      if (!payable) throw new Error(t.errCreatePayable);

      if (voucher) await financeVoucherService.update(voucher.id, { status: 'confirmed', resulting_payable_id: payable.id });
      setDone('payable');
    } catch (e: any) {
      alert(`${t.errPayable}${e?.message || tf.common.retry}`);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = direction === 'in'
    ? [...INCOME_CATEGORIES, ...NON_OPERATING_INFLOW_CATEGORIES, ...TRANSFER_CATEGORIES]
    : [{ value: 'SUPPLIER_PAYMENT', label: 'Supplier Payment / 供应商付款' }, ...MANUAL_EXPENSE_CATEGORIES, ...TRANSFER_CATEGORIES];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 ">{t.type}</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDirection('in')} className={`p-3 rounded-md text-xs font-bold ${direction === 'in' ? 'bg-[#3F7D58] text-white' : 'bg-gray-100 text-slate-600'}`}>{t.typeIn}</button>
              <button onClick={() => setDirection('out')} className={`p-3 rounded-md text-xs font-bold ${direction === 'out' ? 'bg-[#A85D45] text-white' : 'bg-gray-100 text-slate-600'}`}>{t.typeOut}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 ">{t.context}</label>
            <select value={context} onChange={e => setContext(e.target.value as PaymentContext)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700 text-sm">
              <option value="CASH">{t.cash}</option>
              <option value="BANK_TRANSFER">{t.bankAccount}</option>
              <option value="CHEQUE">{t.cheque}</option>
            </select>
          </div>
        </div>

        {context === 'BANK_TRANSFER' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 ">{t.bankAccount}</label>
            <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700 text-sm">
              <option value="">{t.selectAccount}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </div>
        )}

        {/* Upload zone (UI only) — the whole zone is a <label> for the same
            file input below, and drag & drop calls the same handleFile(). */}
        <div className="space-y-1.5">
          <label
            onDragOver={e => { e.preventDefault(); if (!parsing) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              if (parsing) return;
              const f = e.dataTransfer.files?.[0];
              if (f && (f.type === 'application/pdf' || f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.pdf'))) handleFile(f);
            }}
            className={`block rounded-[10px] border-2 border-dashed p-6 text-center transition-all ${parsing ? 'cursor-wait opacity-90' : 'cursor-pointer hover:border-[#CBA85C]'} ${dragOver ? 'border-[#CBA85C] bg-[#CBA85C]/10' : 'border-[#CBA85C]/50 bg-[#F5F6FA]'}`}
          >
            <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} disabled={parsing} className="hidden" />
            <div className="w-12 h-12 rounded-full bg-[#CBA85C]/15 flex items-center justify-center mx-auto mb-3">
              {parsing ? <FileClock className="w-6 h-6 text-[#7A5F2A] animate-pulse" /> : <Upload className="w-6 h-6 text-[#7A5F2A]" />}
            </div>
            <p className="text-sm font-bold text-[#0C1B3A]">{t.upload}</p>
            <p className="text-xs mt-1 text-slate-600">{t.uploadHint}</p>
            {!file && <p className="text-xs font-bold text-[#7A5F2A] mt-3">{t.uploadCta}</p>}
            {file && (
              <p className="text-xs font-bold text-[#7A5F2A] mt-3 truncate" title={file.name}>{t.selectedFile}{file.name}</p>
            )}
            {parsing && <p className="text-xs font-bold text-[#0C1B3A] mt-2 flex items-center justify-center gap-1.5"><FileClock className="w-3.5 h-3.5 text-[#7A5F2A]" /> {t.parsing}</p>}
          </label>
          {parseError && <p className="text-xs font-bold text-red-600 pt-1">{parseError}</p>}
        </div>
      </div>

      {file && !done && (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.date}</label>
              <input type="date" value={fields.date || ''} onChange={e => setFields(f => ({ ...f, date: e.target.value }))} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono-label" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.amount}</label>
              <input type="number" step="0.01" value={fields.amount ?? ''} onChange={e => setFields(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono-label" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.invoiceNo}</label>
              <input value={fields.invoice_no || ''} onChange={e => setFields(f => ({ ...f, invoice_no: e.target.value }))} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.vat}</label>
              <input type="number" step="0.01" value={fields.vat_amount ?? ''} onChange={e => setFields(f => ({ ...f, vat_amount: Number(e.target.value) }))} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono-label" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 ">{t.purpose}</label>
            <input value={purposeNote} onChange={e => setPurposeNote(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.categoryReq}</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] bg-white font-bold text-gray-700">
                <option value="">{tf.common.selectCategory}</option>
                {categoryOptions.map(c => <option key={c.value} value={c.value}>{catName(c)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ">{t.subcatOpt}</label>
              <input value={subcategory} onChange={e => setSubcategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 ">{tf.common.linkOptional}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['none', 'customer', 'supplier'] as const).map(m => (
                <button key={m} onClick={() => setLinkMode(m)} className={`p-2.5 rounded-md text-xs font-bold ${linkMode === m ? 'bg-[#080D1E] text-white' : 'bg-gray-100 text-slate-600'}`}>
                  {m === 'none' ? tf.common.linkNone : m === 'customer' ? tf.common.linkCustomer : tf.common.linkSupplier}
                </button>
              ))}
            </div>
          </div>

          {linkMode === 'customer' && <CustomerProjectSelector value={cpSelection} onChange={setCpSelection} allowLead={false} />}

          {linkMode === 'supplier' && (
            <div className="space-y-1.5 relative">
              <label className="text-xs font-bold text-slate-600 ">{tf.common.supplier}</label>
              <input
                value={selectedSupplier ? selectedSupplier.supplier_name_display : supplierQuery}
                onChange={e => { setSupplierQuery(e.target.value); setSelectedSupplier(null); }}
                placeholder={tf.common.searchSupplier}
                className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700"
              />
              {!selectedSupplier && supplierQuery.trim() && filteredSuppliers.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-[10px] shadow-xl">
                  {filteredSuppliers.map(s => (
                    <button key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierQuery(''); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-sm font-bold text-gray-700">
                      {s.supplier_name_display}
                    </button>
                  ))}
                </div>
              )}
              {direction === 'out' && selectedSupplier && (
                <div className="pt-2">
                  <label className="text-xs font-bold text-slate-600 ">{t.dueDateOpt}</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono-label mt-1" />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={submitAsPaid} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-md bg-[#080D1E] text-white font-bold text-xs disabled:opacity-40">
              <Check className="w-4 h-4" /> {submitting ? t.processing : t.submitPaid}
            </button>
            {direction === 'out' && linkMode === 'supplier' && selectedSupplier && (
              <button onClick={submitAsPayable} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-md bg-gray-100 text-gray-700 font-bold text-xs disabled:opacity-40">
                <Upload className="w-4 h-4" /> {submitting ? t.processing : t.submitUnpaid}
              </button>
            )}
          </div>
        </div>
      )}

      {done && (
        <div className="bg-[#3F7D58]/5 border border-[#3F7D58]/20 rounded-[10px] p-6 flex items-center justify-between">
          <p className="text-sm font-bold text-[#3F7D58]">{done === 'transaction' ? t.doneTxn : t.donePayable}</p>
          <button onClick={reset} className="px-4 py-2 rounded-md bg-white border border-gray-200 text-gray-600 text-xs font-bold ">{t.next}</button>
        </div>
      )}
    </div>
  );
}
