/**
 * Supplier AP V1 (2026-09) — supplier_payables. REAL columns, REAL RLS,
 * same pattern as bankAccountsService.ts (not cloudDb.ts's generic
 * {id,payload} wrapper) — gated by has_module('finance'), needs the real
 * authenticated Supabase client so auth.uid() resolves for RLS.
 *
 * `status` and `outstanding_amount` are never written here — the DB
 * trigger / generated column own them.
 *
 * Updated 2026-09-15: this service no longer writes `paid_amount` at all.
 * That used to happen here (applyPayment()) as a second, separate write
 * after supplierPaymentsService had already written supplier_payments and
 * transactions — three independent requests with no shared transaction, so
 * a failure on any one of them could leave the other two committed and the
 * payable's balance silently wrong. paid_amount is now updated ONLY inside
 * the create_supplier_payment()/clear_supplier_cheque() Postgres functions
 * (see supplierPaymentsService.ts), in the same DB transaction as the
 * payment/transaction rows they write — so this service is read/create/
 * cancel only now.
 */
import { supabase } from '../../../apps/shell/src/lib/supabase';
import type { SupplierPayable } from '../types';

export const supplierPayablesService = {
  async list(): Promise<SupplierPayable[]> {
    const { data, error } = await supabase
      .from('supplier_payables')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) {
      console.error('[supplierPayablesService] list failed:', error);
      return [];
    }
    return (data || []) as SupplierPayable[];
  },

  async get(id: string): Promise<SupplierPayable | null> {
    const { data, error } = await supabase
      .from('supplier_payables')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error('[supplierPayablesService] get failed:', error);
      return null;
    }
    return data as SupplierPayable;
  },

  async create(input: {
    supplier_id: string;
    supplier_name: string;
    reference_no?: string;
    invoice_no?: string;
    amount: number;
    due_date?: string;
    notes?: string;
  }): Promise<SupplierPayable | null> {
    const { data, error } = await supabase
      .from('supplier_payables')
      .insert({
        supplier_id: input.supplier_id,
        supplier_name: input.supplier_name,
        source_type: 'MANUAL',
        reference_no: input.reference_no || null,
        invoice_no: input.invoice_no || null,
        amount: input.amount,
        due_date: input.due_date || null,
        notes: input.notes || '',
      })
      .select('*')
      .single();
    if (error) {
      console.error('[supplierPayablesService] create failed:', error);
      throw error;
    }
    return data as SupplierPayable;
  },

  /**
   * Void a payable. Only possible while paid_amount = 0 — enforced by a DB
   * CHECK constraint (chk_supplier_payables_cancel_requires_zero_paid), not
   * just this client-side guard, so it holds regardless of caller. Never a
   * physical delete — same convention as bank_accounts (retire via a
   * status flag, the row and its id stay valid for anything that already
   * references it).
   */
  async cancel(payableId: string): Promise<SupplierPayable> {
    const current = await this.get(payableId);
    if (!current) throw new Error('找不到该应付账款。');
    if (current.status === 'CANCELLED') return current;
    if (current.paid_amount > 0) {
      throw new Error(`已有付款记录（已付 ${current.paid_amount.toFixed(2)}）的应付账款不能作废。`);
    }
    const { data, error } = await supabase
      .from('supplier_payables')
      .update({ status: 'CANCELLED' })
      .eq('id', payableId)
      .select('*')
      .single();
    if (error) {
      console.error('[supplierPayablesService] cancel failed:', error);
      throw new Error(error.message || '作废失败，请重试。');
    }
    return data as SupplierPayable;
  },
};
