import React, { useState } from 'react';
import { Landmark, FileImage } from 'lucide-react';
import { colors } from '@gci/design-system';
import BankReconciliation from './BankReconciliation';
import VoucherEntry from './VoucherEntry';

type Tab = 'bank' | 'voucher';

/**
 * Finance Bookkeeping & Reconciliation V1 (2026-09-15) — "记账与对账", two
 * entry points feeding the same `transactions` table. See
 * bookkeepingService.ts and supabase/migrations/20260915_finance_bookkeeping_v1.sql.
 */
export default function Bookkeeping() {
  const [tab, setTab] = useState<Tab>('bank');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>记账与对账 / Bookkeeping &amp; Reconciliation</h1>

      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-md flex gap-2 w-fit">
        {[
          { id: 'bank' as Tab, label: '银行对账', icon: Landmark },
          { id: 'voucher' as Tab, label: '凭证录入', icon: FileImage },
        ].map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${isActive ? 'text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
              style={isActive ? { background: colors.bgBase } : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'bank' && <BankReconciliation />}
      {tab === 'voucher' && <VoucherEntry />}
    </div>
  );
}
