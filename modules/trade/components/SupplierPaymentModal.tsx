import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import { roundTo2 } from '../services/currencyUtils';
import { supplierPaymentsService } from '../services/supplierPaymentsService';
import {
  PaymentMethodFields, emptyPaymentMethodValue, type PaymentMethodFormValue,
} from './PaymentMethodFields';
import type { SupplierPayable, BankAccount } from '../types';

interface SupplierPaymentModalProps {
  payable: SupplierPayable;
  accounts: BankAccount[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Supplier AP V1 (2026-09) — always tied to one specific payable (per the
 * confirmed design: 付款 always defaults in supplier/payable/outstanding).
 * Reuses PaymentMethodFields with type="out" — CASH/BANK_TRANSFER/CHEQUE
 * OUT rules are not reimplemented here.
 */
export default function SupplierPaymentModal({ payable, accounts, onClose, onSuccess }: SupplierPaymentModalProps) {
  const [amount, setAmount] = useState(String(payable.outstanding_amount));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [pmValue, setPmValue] = useState<PaymentMethodFormValue>(emptyPaymentMethodValue());
  const [submitting, setSubmitting] = useState(false);

  const amtNum = Number(amount) || 0;
  const overOutstanding = amtNum > payable.outstanding_amount + 0.005;

  const submit = async () => {
    if (amtNum <= 0) { alert('⚠️ 付款金额必须大于 0。'); return; }
    if (overOutstanding) { alert(`⚠️ 本次付款金额不能大于未付余额 AED ${payable.outstanding_amount.toFixed(2)}。`); return; }
    setSubmitting(true);
    try {
      await supplierPaymentsService.create({
        supplierId: payable.supplier_id,
        supplierName: payable.supplier_name,
        payableId: payable.id,
        amount: roundTo2(amtNum),
        paymentDate,
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
        pmValue,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '付款失败，请重试。'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[5000] flex items-center justify-center p-8">
      <div className="bg-white w-full max-w-xl rounded-[40px] overflow-hidden flex flex-col shadow-2xl max-h-[90dvh]">
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">供应商付款 / Supplier Payment</h3>
            <p className="text-xs font-bold text-gray-400 mt-1">{payable.supplier_name} — {payable.invoice_no || payable.reference_no || payable.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-full transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-2xl">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">应付金额</p>
              <p className="text-lg font-black font-mono text-gray-700">AED {payable.amount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">未付余额</p>
              <p className="text-lg font-black font-mono text-[#E0846A]">AED {payable.outstanding_amount.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">本次付款金额 (AED)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className={`w-full p-4 border rounded-xl outline-none font-black font-mono text-lg ${overOutstanding ? 'border-red-400 text-red-500' : 'border-gray-300 focus:border-[#CBA85C] text-gray-700'}`}
            />
            {overOutstanding && (
              <p className="text-[11px] text-red-500 font-bold px-1">⚠️ 不能大于未付余额 AED {payable.outstanding_amount.toFixed(2)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 font-mono"
            />
          </div>

          <PaymentMethodFields value={pmValue} onChange={setPmValue} accounts={accounts} type="out" />

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference No / 单据参考号（可选）</label>
            <input
              type="text"
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">备注（可选）</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
            />
          </div>
        </div>

        <div className="p-8 border-t border-gray-100 shrink-0">
          <button
            onClick={submit}
            disabled={submitting || overOutstanding || amtNum <= 0}
            className="w-full py-5 bg-[#080D1E] text-white rounded-2xl font-black uppercase text-xs tracking-wide shadow-lg hover:bg-[#CBA85C] transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-40"
          >
            <Save className="w-4 h-4" /> {submitting ? '提交中…' : '确认付款'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
