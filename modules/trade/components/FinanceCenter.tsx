import React, { useState, useEffect } from 'react';
import { LayoutGrid, Landmark, ArrowLeftRight, Building2, Wallet, FileStack, Receipt } from 'lucide-react';
import { colors } from '@gci/design-system';
import FinanceTracker from './FinanceTracker';
import CashFlowDashboard from './CashFlowDashboard';
import AccountsPayable from './AccountsPayable';
import { InvoicePage } from '../../../apps/shell/src/pages/InvoicePage';
import { bankAccountsService } from '../services/bankAccountsService';
import type { BankAccount } from '../types';

/**
 * Finance Center (2026-09) — single entry point replacing the old two
 * separate sidebar rows (资金流水 / 财务账). Reuses FinanceTracker and
 * CashFlowDashboard as-is (no business logic rewritten) behind an internal
 * tab strip. See apps/shell/src/config/navigation.ts for the nav
 * consolidation and TradeModule.tsx for how the legacy /trade?tab=finance
 * and /trade?tab=cashflow deep links still resolve here.
 */

export type FinanceSubTab = 'overview' | 'accounts' | 'cashflow' | 'ap' | 'invoice';

interface FinanceCenterProps {
  initialSubTab?: FinanceSubTab;
  /** Sidebar can re-navigate to a different sub-tab without unmounting this
   * component (same pattern TradeModule uses for its own tabs) — only
   * takes effect when it actually changes, so it never fights the user's
   * own in-page tab clicks. */
  subTabKey?: string;
}

const SUB_TABS: { id: FinanceSubTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '财务总览', icon: LayoutGrid },
  { id: 'accounts', label: '银行账户', icon: Landmark },
  { id: 'cashflow', label: '资金流水', icon: ArrowLeftRight },
  { id: 'ap', label: '应付账款', icon: FileStack },
  { id: 'invoice', label: '发票管理', icon: Receipt },
];

function FinanceOverview({ onNavigate }: { onNavigate: (tab: FinanceSubTab) => void }) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);

  useEffect(() => {
    bankAccountsService.list().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const corporateCount = accounts?.filter(a => a.account_type === 'Corporate').length ?? 0;
  const cashCount = accounts?.filter(a => a.account_type === 'Cash').length ?? 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>财务总览</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => onNavigate('accounts')}
          className="text-left bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#CBA85C] transition-all group"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="p-4 rounded-2xl bg-[#080D1E]/5 text-[#080D1E] group-hover:bg-[#CBA85C]/10 group-hover:text-[#CBA85C] transition-all">
              <Landmark className="w-7 h-7" />
            </div>
          </div>
          <h3 className="text-lg font-black text-gray-800 mb-1">银行账户 / Bank Accounts</h3>
          <p className="text-xs text-gray-400 mb-4">管理对公/对私/现金账户、记流水、导出银行信息 PDF</p>
          <div className="flex items-center gap-4 text-[11px] font-black text-gray-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {accounts === null ? '…' : corporateCount} Corporate</span>
            <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> {accounts === null ? '…' : cashCount} Cash</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('cashflow')}
          className="text-left bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#CBA85C] transition-all group"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="p-4 rounded-2xl bg-[#080D1E]/5 text-[#080D1E] group-hover:bg-[#CBA85C]/10 group-hover:text-[#CBA85C] transition-all">
              <ArrowLeftRight className="w-7 h-7" />
            </div>
          </div>
          <h3 className="text-lg font-black text-gray-800 mb-1">资金流水 / Cash Flow</h3>
          <p className="text-xs text-gray-400 mb-4">按日/月查看订单收款、代销结算、冲账的汇总流水</p>
        </button>
      </div>

      <div className="flex items-center gap-3 text-gray-300 py-6 justify-center">
        <span className="text-[10px] font-black uppercase tracking-widest">点上面的卡片，或用顶部的 Tab 切换</span>
      </div>
    </div>
  );
}

export default function FinanceCenter({ initialSubTab }: FinanceCenterProps) {
  const [activeSubTab, setActiveSubTab] = useState<FinanceSubTab>(initialSubTab || 'overview');

  // Deep-link switch (sidebar/AI capability links to /trade?tab=finance or
  // /trade?tab=cashflow) without unmounting FinanceCenter — mirrors how
  // TradeModule itself reacts to a new initialTab prop.
  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubTab]);

  return (
    <div className="min-h-screen">
      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-md flex gap-2 mb-6 w-fit">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                isActive ? 'text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={isActive ? { background: colors.bgBase } : undefined}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'overview' && <FinanceOverview onNavigate={setActiveSubTab} />}
      {activeSubTab === 'accounts' && <FinanceTracker onCancel={() => setActiveSubTab('overview')} />}
      {activeSubTab === 'cashflow' && <CashFlowDashboard />}
      {activeSubTab === 'ap' && <AccountsPayable />}
      {activeSubTab === 'invoice' && <InvoicePage />}
    </div>
  );
}
