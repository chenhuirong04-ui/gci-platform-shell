/**
 * Supplier AP V1 (2026-09) — supplier_payments.
 *
 * Updated 2026-09-15: create() and markChequeStatus() no longer perform
 * three independent Supabase requests (INSERT supplier_payments, INSERT/
 * UPDATE transactions, UPDATE supplier_payables) strung together on the
 * frontend — a failure partway through that sequence could leave a payment
 * row with no linked transaction, or a cleared cheque whose payable never
 * actually moved. Both now call a single Postgres RPC
 * (create_supplier_payment / clear_supplier_cheque, see
 * supabase/migrations/20260915_supplier_ap_v1.sql) that does all of it in
 * one DB transaction — any failure inside rolls back everything that call
 * did. This service is now a thin wrapper: client-side validation for fast
 * UX feedback, then one `supabase.rpc(...)` call.
 *
 * PaymentMethodFields / validatePaymentMethodValue are still reused
 * unchanged for that client-side check — buildPaymentMethodPayload is NOT
 * called here anymore, since the RPC now re-derives the same
 * CASH/BANK_TRANSFER/CHEQUE account resolution itself server-side (it
 * never trusts a client-resolved bank_account_id).
 */
import { supabase } from '../../../apps/shell/src/lib/supabase';
import { validatePaymentMethodValue, type PaymentMethodFormValue } from '../components/PaymentMethodFields';
import type { SupplierPayment } from '../types';

export const supplierPaymentsService = {
  async list(supplierId?: string): Promise<SupplierPayment[]> {
    let query = supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false });
    if (supplierId) query = query.eq('supplier_id', supplierId);
    const { data, error } = await query;
    if (error) {
      console.error('[supplierPaymentsService] list failed:', error);
      return [];
    }
    return (data || []) as SupplierPayment[];
  },

  /** Pending cheques (payment_method='CHEQUE' && cheque_status='PENDING'), across all suppliers. */
  async listPendingCheques(): Promise<SupplierPayment[]> {
    const { data, error } = await supabase
      .from('supplier_payments')
      .select('*')
      .eq('payment_method', 'CHEQUE')
      .eq('cheque_status', 'PENDING')
      .order('payment_date', { ascending: false });
    if (error) {
      console.error('[supplierPaymentsService] listPendingCheques failed:', error);
      return [];
    }
    return (data || []) as SupplierPayment[];
  },

  /**
   * Create a supplier payment via the create_supplier_payment() RPC — see
   * file header. Client-side validatePaymentMethodValue() runs first only
   * for immediate form feedback; the RPC independently re-validates
   * everything (permission, payable/overpay, payment-method fields) and is
   * the actual source of truth.
   */
  async create(input: {
    supplierId: string;
    supplierName: string;
    payableId?: string;
    amount: number;
    paymentDate: string;
    referenceNo?: string;
    notes?: string;
    pmValue: PaymentMethodFormValue;
  }): Promise<SupplierPayment> {
    const syncError = validatePaymentMethodValue(input.pmValue, 'out');
    if (syncError) throw new Error(syncError);
    if (input.amount <= 0) throw new Error('付款金额必须大于 0。');

    const isCheque = input.pmValue.payment_method === 'CHEQUE';

    const { data, error } = await supabase.rpc('create_supplier_payment', {
      p_supplier_id: input.supplierId,
      p_supplier_name: input.supplierName,
      p_amount: input.amount,
      p_payment_date: input.paymentDate,
      p_payment_method: input.pmValue.payment_method,
      p_payable_id: input.payableId || null,
      p_bank_account_id: input.pmValue.payment_method === 'BANK_TRANSFER' ? input.pmValue.bank_account_id : null,
      p_issued_from_bank_account_id: isCheque ? input.pmValue.issued_from_bank_account_id : null,
      p_cheque_number: isCheque ? input.pmValue.cheque_number.trim() : null,
      p_cheque_date: isCheque ? input.pmValue.cheque_date : null,
      p_cheque_bank: isCheque ? input.pmValue.cheque_bank.trim() : null,
      p_cheque_amount: isCheque ? Number(input.pmValue.cheque_amount) || null : null,
      p_cheque_status: isCheque ? input.pmValue.cheque_status : 'PENDING',
      p_reference_no: input.referenceNo || null,
      p_notes: input.notes || null,
    });
    if (error) {
      console.error('[supplierPaymentsService] create_supplier_payment RPC failed:', error);
      throw new Error(error.message || '付款失败，请重试。');
    }
    return data as SupplierPayment;
  },

  /**
   * Move a CHEQUE supplier payment from PENDING to CLEARED/BOUNCED/
   * CANCELLED via the clear_supplier_cheque() RPC — see file header.
   */
  async markChequeStatus(payment: SupplierPayment, status: 'CLEARED' | 'BOUNCED' | 'CANCELLED'): Promise<SupplierPayment> {
    const { data, error } = await supabase.rpc('clear_supplier_cheque', {
      p_payment_id: payment.id,
      p_status: status,
    });
    if (error) {
      console.error('[supplierPaymentsService] clear_supplier_cheque RPC failed:', error);
      throw new Error(error.message || '操作失败，请重试。');
    }
    return data as SupplierPayment;
  },
};
