import React, { useState, useEffect } from 'react';
import { LayoutGrid, Landmark, ArrowLeftRight, FileStack, Receipt, Layers, BookOpenCheck } from 'lucide-react';
import { colors } from '@gci/design-system';
import FinanceTracker from './FinanceTracker';
import CashFlowDashboard from './CashFlowDashboard';
import AccountsPayable from './AccountsPayable';
import FinanceReportingOverview from './FinanceReportingOverview';
import FinanceProfitability from './FinanceProfitability';
import Bookkeeping from './Bookkeeping';
import { InvoicePage } from '../../../apps/shell/src/pages/InvoicePage';

/**
 * Finance Center (2026-09) — single entry point replacing the old two
 * separate sidebar rows (资金流水 / 财务账). Reuses FinanceTracker and
 * CashFlowDashboard as-is (no business logic rewritten) behind an internal
 * tab strip. See apps/shell/src/config/navigation.ts for the nav
 * consolidation and TradeModule.tsx for how the legacy /trade?tab=finance
 * and /trade?tab=cashflow deep links still resolve here.
 */

export type FinanceSubTab = 'overview' | 'accounts' | 'cashflow' | 'ap' | 'invoice' | 'profitability' | 'bookkeeping';

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
  { id: 'profitability', label: '项目与客户利润', icon: Layers },
  { id: 'bookkeeping', label: '记账与对账', icon: BookOpenCheck },
];

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

      {activeSubTab === 'overview' && <FinanceReportingOverview />}
      {activeSubTab === 'accounts' && <FinanceTracker onCancel={() => setActiveSubTab('overview')} />}
      {activeSubTab === 'cashflow' && <CashFlowDashboard />}
      {activeSubTab === 'ap' && <AccountsPayable />}
      {activeSubTab === 'invoice' && <InvoicePage />}
      {activeSubTab === 'profitability' && <FinanceProfitability />}
      {activeSubTab === 'bookkeeping' && <Bookkeeping />}
    </div>
  );
}
