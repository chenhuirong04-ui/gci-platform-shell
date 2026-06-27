import { useState } from 'react';
import QuoteManager from './components/QuoteManager';
import FinanceTracker from './components/FinanceTracker';
import OrderConverter from './components/OrderConverter';
import HistoryDashboard from './components/HistoryDashboard';
import CashFlowDashboard from './components/CashFlowDashboard';
import SalesDashboard from './components/SalesDashboard';
import HomeDashboard from './components/HomeDashboard';
import InventoryManager from './components/InventoryManager';
import ConsignmentManager from './components/ConsignmentManager';
import { Zap, ArrowLeft } from 'lucide-react';
import { Button } from '@gci/design-system';

console.log('[TRADE OPS BUILD]',    'ops-dashboard-inventory-consignment-v1');
console.log('[TRADE FORMAL BUILD]', 'trade-formal-v1');

type Currency = 'AED' | 'USD' | 'CNY';

// Feature Flag: Set to true to re-enable the feature
const ENABLE_ORDER_CONVERSION_AI = false;

/**
 * Migrated from icare-trade-system's App.tsx (Day 2-3 of the monorepo merge
 * plan). The outer AppShell/Sidebar/Header are gone -- the GCI Platform shell
 * (apps/shell) now owns that chrome globally. Everything below -- activeTab
 * state, the tab strip, all 9 panels -- is untouched business logic/UI,
 * just re-homed. The tab strip used to be a "mobile-only fallback" (the
 * Sidebar carried these 7 tabs on desktop); now it's the module's only
 * sub-navigation, shown at all sizes, since the global Sidebar just has one
 * "Trade" entry.
 */
export default function TradeModule() {
  const _initTab = new URLSearchParams(window.location.search).get('tab');
  const _validTabs = ['home','quote','finance','convert','history','cashflow','dashboard','inventory','consignment'];
  const _startTab = (_validTabs.includes(_initTab || '') ? _initTab : 'home') as any;
  const [activeTab, setActiveTab] = useState<'home' | 'quote' | 'finance' | 'convert' | 'history' | 'cashflow' | 'dashboard' | 'inventory' | 'consignment'>(_startTab);
  const [currency, setCurrency] = useState<Currency>('AED');
  const [currentUserId] = useState('Admin'); // 物理隔离：默认 Admin

  const navTabs = [
    { id: 'home',        code: 'HM', label: '首页驾驶舱' },
    { id: 'quote',       code: 'QT', label: 'PI 报价' },
    { id: 'dashboard',   code: 'DB', label: '经营看板' },
    { id: 'inventory',   code: 'IV', label: '库存' },
    { id: 'consignment', code: 'CS', label: '寄售' },
    { id: 'history',     code: 'HS', label: '看板与历史' },
    { id: 'cashflow',    code: 'CF', label: '资金流水' },
    { id: 'finance',     code: 'FN', label: '财务账' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* In-module sub-nav: was "mobile-only", now the only nav for Trade's
          7 sub-tabs since the global Sidebar only has one "Trade" entry. */}
      <nav className="no-print bg-white border-b border-gray-100 sticky top-0 z-40 px-3 shadow-sm">
        <div className="flex overflow-x-auto custom-scrollbar gap-1.5 py-2">
          {navTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id ? 'bg-[#080D1E] text-white' : 'text-slate-500 bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="max-w-[1600px] w-full mx-auto p-4 md:p-6 px-[15px]">
        {activeTab === 'home'        && <HomeDashboard onNavigate={tab => setActiveTab(tab as any)} />}
        {activeTab === 'quote'       && <QuoteManager />}
        {activeTab === 'dashboard'   && <SalesDashboard />}
        {activeTab === 'inventory'   && <InventoryManager />}
        {activeTab === 'consignment' && <ConsignmentManager />}
        {activeTab === 'convert' && (
          ENABLE_ORDER_CONVERSION_AI ? <OrderConverter /> : (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] animate-in fade-in">
              <div className="bg-white p-12 rounded-[40px] shadow-xl border border-gray-100 text-center space-y-6">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
                  <Zap className="w-10 h-10" />
                </div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">This feature is currently disabled.</p>
                <Button
                  variant="primary"
                  onClick={() => setActiveTab('history')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )
        )}
        {activeTab === 'history' && <HistoryDashboard currentUserId={currentUserId} />}
        {activeTab === 'cashflow' && <CashFlowDashboard />}
        {activeTab === 'finance' && <FinanceTracker onCancel={() => setActiveTab('quote')} />}
      </div>
    </div>
  );
}
