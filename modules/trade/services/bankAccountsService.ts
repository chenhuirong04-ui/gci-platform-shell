/**
 * Bank Accounts (Finance V1) — REAL columns, REAL RLS.
 *
 * Deliberately NOT using cloudDb.ts's generic {id,payload} wrapper pattern
 * (that's what Trade's older tables — orders/payments/transactions — use,
 * always over the static anon key, bypassing per-user auth at the DB layer).
 * bank_accounts is a new table gated by has_module('finance') RLS, so it
 * needs the real authenticated Supabase client so auth.uid() actually
 * resolves. This mirrors the pattern already used by CRM/Business
 * Solutions/Suppliers modules importing apps/shell's client directly.
 */
import { supabase } from '../../../apps/shell/src/lib/supabase';
import type { BankAccount } from '../types';

export const bankAccountsService = {
  async list(includeInactive = false): Promise<BankAccount[]> {
    let query = supabase.from('bank_accounts').select('*').order('account_name', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) {
      console.error('[bankAccountsService] list failed:', error);
      return [];
    }
    return (data || []) as BankAccount[];
  },

  async create(input: {
    account_name: string;
    account_type: BankAccount['account_type'];
    bank_name?: string;
    currency?: string;
    opening_balance?: number;
    notes?: string;
    // Banking detail fields (Finance V1, 2026-09) — all optional, left null
    // for Cash accounts which have no bank.
    account_holder_name?: string;
    account_number?: string;
    iban?: string;
    swift_bic?: string;
    bank_address?: string;
    branch_name?: string;
  }): Promise<BankAccount | null> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({
        account_name: input.account_name,
        account_type: input.account_type,
        bank_name: input.bank_name || null,
        currency: input.currency || 'AED',
        opening_balance: input.opening_balance || 0,
        notes: input.notes || '',
        account_holder_name: input.account_holder_name || null,
        account_number: input.account_number || null,
        iban: input.iban || null,
        swift_bic: input.swift_bic || null,
        bank_address: input.bank_address || null,
        branch_name: input.branch_name || null,
      })
      .select('*')
      .single();
    if (error) {
      console.error('[bankAccountsService] create failed:', error);
      throw error;
    }
    return data as BankAccount;
  },

  async setActive(id: string, is_active: boolean): Promise<void> {
    const { error } = await supabase.from('bank_accounts').update({ is_active }).eq('id', id);
    if (error) {
      console.error('[bankAccountsService] setActive failed:', error);
      throw error;
    }
  },
};
