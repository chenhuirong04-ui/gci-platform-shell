import React from 'react';
import type { BankAccount, ChequeStatus, PaymentMethod, TransactionRecord } from '../types';

/**
 * Shared payment-method form fragment (Finance V1, 2026-09).
 *
 * One component, one validation function, one payload builder — used by
 * all three transaction-writing entry points (Trade order payments,
 * consignment settlements, FinanceTracker manual entries) so none of them
 * can drift into writing a different shape. See chat report for the full
 * CASH/BANK_TRANSFER/CHEQUE rules this encodes.
 */

export interface PaymentMethodFormValue {
  payment_method: PaymentMethod;
  bank_account_id: string;              // BANK_TRANSFER only — which account
  cheque_number: string;
  cheque_date: string;
  cheque_bank: string;
  cheque_amount: string;                // string for controlled input
  cheque_status: ChequeStatus;
  deposited_to_bank_account_id: string; // CHEQUE + type='in', required once CLEARED
  issued_from_bank_account_id: string;  // CHEQUE + type='out', required at creation
}

export const emptyPaymentMethodValue = (): PaymentMethodFormValue => ({
  payment_method: 'CASH',
  bank_account_id: '',
  cheque_number: '',
  cheque_date: new Date().toISOString().split('T')[0],
  cheque_bank: '',
  cheque_amount: '',
  cheque_status: 'PENDING',
  deposited_to_bank_account_id: '',
  issued_from_bank_account_id: '',
});

/** Bank accounts eligible for BANK_TRANSFER / cheque deposit — real banks
 * only, not Cash (a "bank transfer" or "deposit" into Cash makes no sense). */
export const bankTransferEligible = (accounts: BankAccount[]) => accounts.filter(a => a.account_type !== 'Cash');

const formatAccountOption = (a: BankAccount) =>
  `${a.account_name}${a.bank_name ? ' · ' + a.bank_name : ''} · ${a.currency}`;

/**
 * Synchronous validation — everything that doesn't need a Cash-account
 * lookup. `type` is the transaction direction ('in' = receiving money,
 * 'out' = paying money out) — for CHEQUE it decides which account field is
 * required and when (Finance V1 boundary, 2026-09):
 *   - type='in'  (cheque received): deposited_to_bank_account_id only
 *     required once cheque_status becomes 'CLEARED'.
 *   - type='out' (cheque issued):   issued_from_bank_account_id required
 *     immediately at creation, regardless of status.
 * Returns an error message, or null if this part is valid. Callers must
 * ALSO resolve the Cash account (bankAccountsService.
 * resolveActiveCashAccount()) when payment_method==='CASH' and treat that
 * failure the same way — this function can't do that lookup itself.
 */
export function validatePaymentMethodValue(value: PaymentMethodFormValue, type: 'in' | 'out'): string | null {
  if (value.payment_method === 'BANK_TRANSFER') {
    if (!value.bank_account_id) return '请选择具体的银行账户（不能只填"对公"）。';
  }
  if (value.payment_method === 'CHEQUE') {
    if (!value.cheque_number.trim()) return '请填写支票号 Cheque Number。';
    if (!value.cheque_date) return '请填写支票日期 Cheque Date。';
    if (!value.cheque_bank.trim()) return '请填写出票行 Cheque Bank。';
    if (!value.cheque_amount || Number(value.cheque_amount) <= 0) return '请填写支票金额 Cheque Amount。';
    if (type === 'out') {
      if (!value.issued_from_bank_account_id) {
        return '付款支票必须选择开票账户 (Issued From)。';
      }
    } else if (value.cheque_status === 'CLEARED' && !value.deposited_to_bank_account_id) {
      return '支票状态为 Cleared 时，必须选择存入哪个银行账户 (Deposited To)。';
    }
  }
  return null;
}

/**
 * Build the payment-method fields to merge into a TransactionRecord.
 * `cashAccountId` must already be resolved (or null if not applicable/not
 * yet resolved) — this function never looks it up itself, keeping it a
 * pure, synchronous, easily-testable step. `type` is the transaction
 * direction, same meaning as in validatePaymentMethodValue above.
 */
export function buildPaymentMethodPayload(
  value: PaymentMethodFormValue,
  cashAccountId: string | null,
  type: 'in' | 'out'
): Partial<TransactionRecord> {
  if (value.payment_method === 'CASH') {
    return {
      payment_method: 'CASH',
      bank_account_id: cashAccountId || undefined,
    };
  }
  if (value.payment_method === 'BANK_TRANSFER') {
    return {
      payment_method: 'BANK_TRANSFER',
      bank_account_id: value.bank_account_id,
    };
  }
  // CHEQUE — bank_account_id only set once Cleared, left unset while
  // PENDING/BOUNCED/CANCELLED so it never counts toward any account's
  // balance (countsTowardBalance() / balanceForAccount() rely on this).
  const cleared = value.cheque_status === 'CLEARED';
  const base = {
    payment_method: 'CHEQUE' as const,
    cheque_number: value.cheque_number.trim(),
    cheque_date: value.cheque_date,
    cheque_bank: value.cheque_bank.trim(),
    cheque_amount: Number(value.cheque_amount) || 0,
    cheque_status: value.cheque_status,
  };
  if (type === 'out') {
    // Issued From is chosen at creation and kept on the record regardless
    // of status; bank_account_id (what actually moves the balance) only
    // mirrors it once Cleared.
    return {
      ...base,
      bank_account_id: cleared ? value.issued_from_bank_account_id : undefined,
      issued_from_bank_account_id: value.issued_from_bank_account_id,
    };
  }
  return {
    ...base,
    bank_account_id: cleared ? value.deposited_to_bank_account_id : undefined,
    deposited_to_bank_account_id: cleared ? value.deposited_to_bank_account_id : undefined,
  };
}

interface PaymentMethodFieldsProps {
  value: PaymentMethodFormValue;
  onChange: (next: PaymentMethodFormValue) => void;
  /** Active bank_accounts (any type) — filtered internally per field. */
  accounts: BankAccount[];
  /** Compact styling for tight spaces (e.g. inside an existing modal that
   * already has its own field spacing). Defaults to the fuller spacing. */
  compact?: boolean;
  /** Transaction direction — 'in' (receiving money) or 'out' (paying money
   * out). Only affects the CHEQUE section (Finance V1 boundary, 2026-09):
   * a received cheque asks "Deposited To" once Cleared, an issued cheque
   * asks "Issued From" up front. Callers that only ever write one
   * direction (Trade order payments, consignment settlements) pass a fixed
   * 'in'; FinanceTracker's manual entry passes whichever direction the
   * user is currently recording. */
  type: 'in' | 'out';
}

export function PaymentMethodFields({ value, onChange, accounts, compact, type }: PaymentMethodFieldsProps) {
  const set = <K extends keyof PaymentMethodFormValue>(key: K, v: PaymentMethodFormValue[K]) =>
    onChange({ ...value, [key]: v });
  const gap = compact ? 'space-y-3' : 'space-y-5';
  const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';
  const inputCls = 'w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700';

  const bankAccounts = bankTransferEligible(accounts);

  return (
    <div className={gap}>
      <div className="space-y-1.5">
        <label className={labelCls}>Payment Method / 收付款方式</label>
        <select
          className={inputCls}
          value={value.payment_method}
          onChange={e => onChange({ ...value, payment_method: e.target.value as PaymentMethod })}
        >
          <option value="CASH">CASH / 现金</option>
          <option value="BANK_TRANSFER">BANK_TRANSFER / 银行转账</option>
          <option value="CHEQUE">CHEQUE / 支票</option>
        </select>
      </div>

      {value.payment_method === 'CASH' && (
        <p className="text-[11px] text-gray-400 px-1">
          将自动记到系统里唯一启用中的 Cash 账户——如果没有 Cash 账户，或者有不止一个，提交时会提示，不会自动乱选。
        </p>
      )}

      {value.payment_method === 'BANK_TRANSFER' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Bank Account / 银行账户</label>
          {bankAccounts.length === 0 ? (
            <p className="text-[11px] text-[#E0846A] font-bold px-1">
              没有可选的银行账户，请先去"银行账户"新建一个 Corporate/Personal/Other 账户。
            </p>
          ) : (
            <select className={inputCls} value={value.bank_account_id} onChange={e => set('bank_account_id', e.target.value)}>
              <option value="">请选择账户…</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{formatAccountOption(a)}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {value.payment_method === 'CHEQUE' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Cheque Number</label>
              <input className={inputCls + ' font-mono'} value={value.cheque_number} onChange={e => set('cheque_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Cheque Date</label>
              <input type="date" className={inputCls + ' font-mono'} value={value.cheque_date} onChange={e => set('cheque_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Cheque Bank</label>
              <input className={inputCls} placeholder="e.g. Emirates NBD" value={value.cheque_bank} onChange={e => set('cheque_bank', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Cheque Amount</label>
              <input type="number" step="0.01" className={inputCls + ' font-mono'} value={value.cheque_amount} onChange={e => set('cheque_amount', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Cheque Status</label>
            <select className={inputCls} value={value.cheque_status} onChange={e => set('cheque_status', e.target.value as ChequeStatus)}>
              <option value="PENDING">PENDING / 待清算</option>
              <option value="CLEARED">CLEARED / 已清算</option>
              <option value="BOUNCED">BOUNCED / 退票</option>
              <option value="CANCELLED">CANCELLED / 作废</option>
            </select>
          </div>
          {type === 'out' ? (
            // Issued From — required at creation time, not just once
            // Cleared, since it's the account the cheque is drawn against.
            <div className="space-y-1.5">
              <label className={labelCls}>Issued From / 开票账户</label>
              {bankAccounts.length === 0 ? (
                <p className="text-[11px] text-[#E0846A] font-bold px-1">没有可选的银行账户，请先去"银行账户"新建一个。</p>
              ) : (
                <select className={inputCls} value={value.issued_from_bank_account_id} onChange={e => set('issued_from_bank_account_id', e.target.value)}>
                  <option value="">请选择账户…</option>
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>{formatAccountOption(a)}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            value.cheque_status === 'CLEARED' && (
              <div className="space-y-1.5">
                <label className={labelCls}>Deposited To / 存入账户</label>
                {bankAccounts.length === 0 ? (
                  <p className="text-[11px] text-[#E0846A] font-bold px-1">没有可选的银行账户，请先去"银行账户"新建一个。</p>
                ) : (
                  <select className={inputCls} value={value.deposited_to_bank_account_id} onChange={e => set('deposited_to_bank_account_id', e.target.value)}>
                    <option value="">请选择账户…</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{formatAccountOption(a)}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          )}
          {value.cheque_status !== 'CLEARED' && (
            <p className="text-[11px] text-gray-400 px-1">
              {value.cheque_status === 'PENDING'
                ? (type === 'out'
                    ? '支票 Cleared 之前不减少开票账户余额；后续可以在"待清算支票"列表里把它标记为已清算。'
                    : '支票 Cleared 之前不计入任何账户余额；后续可以在"待清算支票"列表里把它标记为已清算。')
                : '退票/作废的支票不计入任何账户余额。'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
