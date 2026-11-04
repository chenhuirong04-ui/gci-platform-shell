import React from 'react';
import { useI18n, zh, type Dictionary } from '@gci/i18n';
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
export function validatePaymentMethodValue(value: PaymentMethodFormValue, type: 'in' | 'out', m: Dictionary['trade']['pm'] = zh.trade.pm): string | null {
  if (value.payment_method === 'BANK_TRANSFER') {
    if (!value.bank_account_id) return m.errBankAccount;
  }
  if (value.payment_method === 'CHEQUE') {
    if (!value.cheque_number.trim()) return m.errChequeNumber;
    if (!value.cheque_date) return m.errChequeDate;
    if (!value.cheque_bank.trim()) return m.errChequeBank;
    if (!value.cheque_amount || Number(value.cheque_amount) <= 0) return m.errChequeAmount;
    if (type === 'out') {
      if (!value.issued_from_bank_account_id) {
        return m.errIssuedFrom;
      }
    } else if (value.cheque_status === 'CLEARED' && !value.deposited_to_bank_account_id) {
      return m.errDepositedTo;
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
  const M = useI18n().dict.trade.pm;
  const set = <K extends keyof PaymentMethodFormValue>(key: K, v: PaymentMethodFormValue[K]) =>
    onChange({ ...value, [key]: v });
  const gap = compact ? 'space-y-3' : 'space-y-5';
  const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';
  const inputCls = 'w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700';

  const bankAccounts = bankTransferEligible(accounts);

  return (
    <div className={gap}>
      <div className="space-y-1.5">
        <label className={labelCls}>{M.paymentMethod}</label>
        <select
          className={inputCls}
          value={value.payment_method}
          onChange={e => onChange({ ...value, payment_method: e.target.value as PaymentMethod })}
        >
          <option value="CASH">{M.methodCash}</option>
          <option value="BANK_TRANSFER">{M.methodBank}</option>
          <option value="CHEQUE">{M.methodCheque}</option>
        </select>
      </div>

      {value.payment_method === 'CASH' && (
        <p className="text-[11px] text-gray-400 px-1">
          {M.cashHint}
        </p>
      )}

      {value.payment_method === 'BANK_TRANSFER' && (
        <div className="space-y-1.5">
          <label className={labelCls}>{M.bankAccount}</label>
          {bankAccounts.length === 0 ? (
            <p className="text-[11px] text-[#E0846A] font-bold px-1">
              {M.noBankAccounts}
            </p>
          ) : (
            <select className={inputCls} value={value.bank_account_id} onChange={e => set('bank_account_id', e.target.value)}>
              <option value="">{M.selectAccount}</option>
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
              <option value="PENDING">{M.statusPending}</option>
              <option value="CLEARED">{M.statusCleared}</option>
              <option value="BOUNCED">{M.statusBounced}</option>
              <option value="CANCELLED">{M.statusCancelled}</option>
            </select>
          </div>
          {type === 'out' ? (
            // Issued From — required at creation time, not just once
            // Cleared, since it's the account the cheque is drawn against.
            <div className="space-y-1.5">
              <label className={labelCls}>{M.issuedFrom}</label>
              {bankAccounts.length === 0 ? (
                <p className="text-[11px] text-[#E0846A] font-bold px-1">{M.noBankAccountsShort}</p>
              ) : (
                <select className={inputCls} value={value.issued_from_bank_account_id} onChange={e => set('issued_from_bank_account_id', e.target.value)}>
                  <option value="">{M.selectAccount}</option>
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>{formatAccountOption(a)}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            value.cheque_status === 'CLEARED' && (
              <div className="space-y-1.5">
                <label className={labelCls}>{M.depositedTo}</label>
                {bankAccounts.length === 0 ? (
                  <p className="text-[11px] text-[#E0846A] font-bold px-1">{M.noBankAccountsShort}</p>
                ) : (
                  <select className={inputCls} value={value.deposited_to_bank_account_id} onChange={e => set('deposited_to_bank_account_id', e.target.value)}>
                    <option value="">{M.selectAccount}</option>
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
                    ? M.hintPendingOut
                    : M.hintPendingIn)
                : M.hintVoid}
            </p>
          )}
        </>
      )}
    </div>
  );
}
