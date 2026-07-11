import React, { useState } from 'react';
import type { BSLang } from '../types';

export interface ReceivableRecord {
  id: string;
  quote_id?: string;
  customer_id?: string;
  fee_type: 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';
  service_summary: string;
  currency: string;
  amount: number;
  total_receivable: number;
  received_amount: number;
  outstanding_amount: number;
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  due_date?: string;
  customer_name: string;
  quote_no: string;
  income_category: string;
}

interface Props {
  lang: BSLang;
  receivable: ReceivableRecord;
  onClose: () => void;
  onSuccess: () => void;
}

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

function fmt(n: number, cur: string) {
  return `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const FEE_TYPE_LABEL: Record<string, string> = {
  ONE_TIME: '一次性费用',
  MONTHLY: '月费',
  ANNUAL: '年费',
};

export function PaymentModal({ lang, receivable, onClose, onSuccess }: Props) {
  const isZh = lang === 'zh';
  const today = new Date().toISOString().slice(0, 10);

  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<'Corporate' | 'Personal' | 'Cash'>('Corporate');
  const [method, setMethod] = useState<'BANK' | 'CASH' | 'CHEQUE' | 'OTHER'>('BANK');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const outstanding = Number(receivable.outstanding_amount) || 0;
  const parsedAmount = parseFloat(amount) || 0;

  const validate = (): string => {
    if (!paymentDate) return isZh ? '请选择收款日期' : 'Payment date is required';
    if (parsedAmount <= 0) return isZh ? '收款金额必须大于 0' : 'Amount must be greater than 0';
    if (parsedAmount > outstanding + 0.001)
      return isZh
        ? `收款金额不能超过未收金额 ${fmt(outstanding, receivable.currency)}`
        : `Amount cannot exceed outstanding ${fmt(outstanding, receivable.currency)}`;
    return '';
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/bs/service-payment-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivable_id: receivable.id,
          payment_date: paymentDate,
          amount: parsedAmount,
          currency: receivable.currency,
          account,
          payment_method: method,
          notes,
          created_by: 'user',
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error && data.error.includes('exceeds_outstanding')) {
          setError(isZh ? `收款金额超出未收余额，请核实` : 'Payment exceeds outstanding balance');
        } else if (data.error && data.error.includes('duplicate_bank_reference')) {
          setError(isZh ? '该银行流水号已存在，请检查是否重复登记' : 'Duplicate bank reference');
        } else {
          setError(isZh ? '登记失败，请稍后再试' : 'Registration failed, please try again');
        }
        return;
      }
      onSuccess();
    } catch {
      setError(isZh ? '网络错误，请检查连接' : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(12,27,58,0.55)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#fff' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: NAVY, borderBottom: `2px solid ${GOLD}` }}>
          <div>
            <div className="text-white font-bold text-base">{isZh ? '登记收款' : 'Register Payment'}</div>
            <div className="text-white/50 text-xs mt-0.5">{receivable.quote_no} · {receivable.customer_name}</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Readonly info */}
        <div className="px-6 py-4 border-b" style={{ borderColor: '#f0ede8', background: '#faf8f5' }}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-400 mb-0.5">{isZh ? '费用类型' : 'Fee Type'}</div>
              <div className="font-medium text-gray-800">{FEE_TYPE_LABEL[receivable.fee_type] || receivable.fee_type}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">{isZh ? '应收金额' : 'Total Receivable'}</div>
              <div className="font-medium text-gray-800">{fmt(receivable.total_receivable, receivable.currency)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">{isZh ? '已收金额' : 'Received'}</div>
              <div className="font-medium text-green-600">{fmt(receivable.received_amount, receivable.currency)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">{isZh ? '当前未收' : 'Outstanding'}</div>
              <div className="font-bold text-lg" style={{ color: NAVY }}>{fmt(outstanding, receivable.currency)}</div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isZh ? '收款日期' : 'Payment Date'} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': GOLD } as React.CSSProperties}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isZh ? `收款金额（${receivable.currency}）` : `Amount (${receivable.currency})`} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={outstanding.toFixed(2)}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setAmount(outstanding.toFixed(2))}
                className="text-xs px-3 py-2 rounded-lg border font-medium whitespace-nowrap"
                style={{ borderColor: GOLD, color: GOLD }}
              >
                {isZh ? '全额' : 'Full'}
              </button>
            </div>
          </div>

          {/* Account + Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isZh ? '收款账户' : 'Account'}</label>
              <select
                value={account}
                onChange={e => setAccount(e.target.value as typeof account)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
              >
                <option value="Corporate">{isZh ? '公司账户' : 'Corporate'}</option>
                <option value="Personal">{isZh ? '个人账户' : 'Personal'}</option>
                <option value="Cash">{isZh ? '现金' : 'Cash'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isZh ? '付款方式' : 'Method'}</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as typeof method)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
              >
                <option value="BANK">{isZh ? '银行转账' : 'Bank Transfer'}</option>
                <option value="CASH">{isZh ? '现金' : 'Cash'}</option>
                <option value="CHEQUE">{isZh ? '支票' : 'Cheque'}</option>
                <option value="OTHER">{isZh ? '其他' : 'Other'}</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isZh ? '备注' : 'Notes'}</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isZh ? '可选备注' : 'Optional'}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: '#cbd5e1', color: '#64748b' }}
              disabled={loading}
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: loading ? '#cbd5e1' : NAVY, color: 'white' }}
            >
              {loading ? (isZh ? '提交中…' : 'Submitting…') : (isZh ? '确认收款' : 'Confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
