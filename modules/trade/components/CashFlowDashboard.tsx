import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, Wallet, TrendingUp, TrendingDown, Search,
  Calendar, ArrowUpRight, PackageCheck, History,
  Activity, Info
} from 'lucide-react';
import { OrderRecord, PaymentRecord } from '../types';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb'; // ✅ NEW: Supabase

type FlowType = 'SALE' | 'CONSIGNMENT' | 'ADJUSTMENT';

interface CashFlowEntry {
  id: string;
  date: string;
  amount: number;
  type: FlowType;
  reference_no: string;
  customer: string;
  note: string;
}

const CashFlowDashboard: React.FC = () => {
  const [activeView, setActiveView] = useState<'daily' | 'monthly'>('daily');
  const [flows, setFlows] = useState<CashFlowEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * ✅ SAFE STRATEGY (不会“换了就什么都没有”)
   * 1) 优先读 Supabase: orders + payments（payload）
   * 2) 云端为空/失败 -> 自动回退读本地 persistence
   * 3) 如果用到了本地数据 -> 尝试回填到云端（让刷新后也有）
   *
   * 注意：consignment settlements 这块你现在仍然走 persistence.getSettlements（不动它，避免牵扯更多表/逻辑）
   */
  const loadFlowData = async () => {
    try {
      let allOrders: OrderRecord[] = [];
      let allPayments: PaymentRecord[] = [];

      // A) Cloud first
      try {
        const [orderRows, paymentRows] = await Promise.all([
          cloudDb.query('orders', 1000, 0, {}),
          cloudDb.query('payments', 2000, 0, {}),
        ]);

        allOrders = (orderRows || []).map((r: any) => r?.payload).filter(Boolean);
        allPayments = (paymentRows || []).map((r: any) => r?.payload).filter(Boolean);

        // cache local (安全感：即便云读到了，也同步到本地一份)
        if (allOrders.length) await persistence.saveOrders(allOrders as any);
        if (allPayments.length) await persistence.savePayments(allPayments as any);
      } catch {
        // ignore -> fallback local
      }

      // B) Fallback local if cloud empty/unavailable
      if (allOrders.length === 0 || allPayments.length === 0) {
        const [localOrders, localPayments] = await Promise.all([
          persistence.getOrders(),
          persistence.getPayments()
        ]);

        if (allOrders.length === 0 && localOrders?.length) allOrders = localOrders as any;
        if (allPayments.length === 0 && localPayments?.length) allPayments = localPayments as any;

        // backfill to cloud (best-effort) so refresh won't lose
        try {
          if (localOrders?.length) await cloudDb.upsert('orders', localOrders as any);
          if (localPayments?.length) await cloudDb.upsert('payments', localPayments as any);
        } catch {
          // keep silent; local already works
        }
      }

      // Aggregate flows
      let aggregatedFlows: CashFlowEntry[] = [];

      // 1) Direct Sale Payments
      (allPayments || []).forEach((p: any) => {
        aggregatedFlows.push({
          id: p.id,
          date: p.date,
          amount: p.amount,
          type: 'SALE',
          reference_no: p.orderId,
          customer: (allOrders || []).find((o: any) => o.id === p.orderId)?.customerName || 'Unknown',
          note: p.note || 'Direct payment'
        });
      });

      // 2) Consignment Settlement Payments (keep existing local logic)
      for (const o of (allOrders || [])) {
        const settlements = await persistence.getSettlements((o as any).id);
        (settlements || []).forEach((s: any) => {
          if (s.paid_amount !== 0) {
            aggregatedFlows.push({
              id: s.id,
              date: (s.created_at || '').split('T')[0] || (o as any).createdAt?.split('T')[0] || '',
              amount: s.paid_amount,
              type: 'CONSIGNMENT',
              reference_no: (o as any).id,
              customer: (o as any).customerName || 'Unknown',
              note: s.memo || 'Consignment settlement'
            });
          }
        });
      }

      // 3) Adjustment Payments (from orders)
      (allOrders || []).forEach((o: any) => {
        if (o.order_type === 'ADJUSTMENT' && o.paidAmount !== 0) {
          aggregatedFlows.push({
            id: o.id,
            date: (o.createdAt || '').split('T')[0] || '',
            amount: o.paidAmount,
            type: 'ADJUSTMENT',
            reference_no: o.id,
            customer: o.customerName || 'Unknown',
            note: `Adjustment for ${o.adjustmentOf || 'N/A'}`
          });
        }
      });

      setFlows(aggregatedFlows.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    } catch (e) {
      console.error("Failed to load cash flow data", e);
      setFlows([]);
    }
  };

  useEffect(() => {
    loadFlowData();
  }, []);

  const filteredFlows = useMemo(() => {
    return flows.filter(f =>
      (f.customer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.reference_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.note || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [flows, searchTerm]);

  const dailyAggregates = useMemo(() => {
    const groups: Record<string, { date: string, inflow: number, adjustment: number, net: number, items: CashFlowEntry[] }> = {};
    filteredFlows.forEach(f => {
      const d = f.date || 'Unknown';
      if (!groups[d]) {
        groups[d] = { date: d, inflow: 0, adjustment: 0, net: 0, items: [] };
      }
      if (f.type === 'ADJUSTMENT') {
        groups[d].adjustment = roundTo2(groups[d].adjustment + f.amount);
      } else {
        groups[d].inflow = roundTo2(groups[d].inflow + f.amount);
      }
      groups[d].net = roundTo2(groups[d].net + f.amount);
      groups[d].items.push(f);
    });
    return Object.values(groups).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [filteredFlows]);

  const monthlyAggregates = useMemo(() => {
    const groups: Record<string, { month: string, inflow: number, consignment: number, adjustment: number, net: number }> = {};
    filteredFlows.forEach(f => {
      const month = (f.date || '').substring(0, 7) || 'Unknown'; // YYYY-MM
      if (!groups[month]) {
        groups[month] = { month, inflow: 0, consignment: 0, adjustment: 0, net: 0 };
      }
      if (f.type === 'ADJUSTMENT') {
        groups[month].adjustment = roundTo2(groups[month].adjustment + f.amount);
      } else if (f.type === 'CONSIGNMENT') {
        groups[month].consignment = roundTo2(groups[month].consignment + f.amount);
        groups[month].inflow = roundTo2(groups[month].inflow + f.amount);
      } else {
        groups[month].inflow = roundTo2(groups[month].inflow + f.amount);
      }
      groups[month].net = roundTo2(groups[month].net + f.amount);
    });
    return Object.values(groups).sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  }, [filteredFlows]);

  const stats = useMemo(() => {
    const totalInflow = roundTo2(flows.filter(f => f.type !== 'ADJUSTMENT').reduce((s, f) => s + f.amount, 0));
    const totalAdj = roundTo2(flows.filter(f => f.type === 'ADJUSTMENT').reduce((s, f) => s + f.amount, 0));
    const net = roundTo2(totalInflow + totalAdj);
    return { totalInflow, totalAdj, net };
  }, [flows]);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-20">
      {/* FINANCE 分区页面标题 */}
      <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>资金流水</h1>
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all"><TrendingUp className="w-16 h-16 text-emerald-600" /></div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Sale Inflow (AED)</p>
          <p className="text-4xl font-black text-emerald-600 font-mono tracking-tighter leading-none">{stats.totalInflow.toFixed(2)}</p>
        </div>
        <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all"><Activity className="w-16 h-16 text-orange-600" /></div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Adjustments (AED)</p>
          <p className="text-4xl font-black text-orange-600 font-mono tracking-tighter leading-none">{stats.totalAdj.toFixed(2)}</p>
        </div>
        <div className="bg-[#1a237e] p-10 rounded-[40px] shadow-2xl text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all"><Wallet className="w-16 h-16" /></div>
          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Net Business Flow (AED)</p>
          <p className="text-4xl font-black font-mono tracking-tighter leading-none">{stats.net.toFixed(2)}</p>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex bg-white p-2 rounded-[30px] shadow-sm border border-gray-100 w-fit self-center no-print">
        <button
          onClick={() => setActiveView('daily')}
          className={`px-8 py-4 rounded-[22px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeView === 'daily' ? 'bg-indigo-600 text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <Calendar className="w-4 h-4" /> Daily Flow
        </button>
        <button
          onClick={() => setActiveView('monthly')}
          className={`px-8 py-4 rounded-[22px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeView === 'monthly' ? 'bg-indigo-600 text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <BarChart3 className="w-4 h-4" /> Monthly Review
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-6 rounded-[30px] border border-gray-100 shadow-sm max-w-2xl mx-auto w-full flex items-center gap-4">
        <Search className="w-5 h-5 text-gray-300" />
        <input
          type="text"
          placeholder="Search by customer, order or note..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none font-bold text-sm uppercase tracking-tight"
        />
      </div>

      {/* Content Area */}
      {activeView === 'daily' ? (
        <div className="space-y-10">
          {dailyAggregates.map(day => (
            <div key={day.date} className="bg-white rounded-[50px] border border-gray-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
              <div className="p-8 bg-gray-50/50 border-b flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 text-[#1a237e]">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-800 tracking-tighter">{day.date}</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Business Day Summary</p>
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="text-center">
                    <p className="text-[8px] font-black text-emerald-400 uppercase mb-1">Inflow</p>
                    <p className="text-lg font-black text-emerald-600 font-mono">+{day.inflow.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black text-orange-400 uppercase mb-1">Adj</p>
                    <p className="text-lg font-black text-orange-600 font-mono">{day.adjustment.toFixed(2)}</p>
                  </div>
                  <div className="text-center border-l border-gray-200 pl-8">
                    <p className="text-[8px] font-black text-indigo-400 uppercase mb-1">Net Flow</p>
                    <p className="text-lg font-black text-[#1a237e] font-mono">{day.net.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/30 text-[8px] font-black text-gray-400 uppercase tracking-widest border-b">
                    <tr>
                      <th className="px-8 py-4 w-24">Type</th>
                      <th className="px-8 py-4 w-32">Ref No.</th>
                      <th className="px-8 py-4">Customer</th>
                      <th className="px-8 py-4">Memo / Details</th>
                      <th className="px-8 py-4 text-right">Amount (AED)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {day.items.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-8 py-4">
                          <span className={`px-3 py-1 rounded-full text-[7px] font-black uppercase border ${
                            item.type === 'SALE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            item.type === 'CONSIGNMENT' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                            'bg-orange-50 text-orange-600 border-orange-100'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-8 py-4 font-mono text-[10px] text-indigo-600 font-bold">{item.reference_no}</td>
                        <td className="px-8 py-4 text-[10px] font-black text-gray-700 uppercase">{item.customer}</td>
                        <td className="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase truncate max-w-[200px]">{item.note}</td>
                        <td className={`px-8 py-4 text-right font-mono font-black text-xs ${item.amount < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                          {item.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {dailyAggregates.length === 0 && (
            <div className="py-40 text-center text-gray-200 uppercase text-[10px] font-black tracking-widest">No cash movements recorded</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {monthlyAggregates.map(month => (
            <div key={month.month} className="bg-white p-10 rounded-[50px] border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-50 rounded-full opacity-0 group-hover:opacity-100 transition-all -z-0"></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h3 className="text-2xl font-black text-[#1a237e] tracking-tighter uppercase">{month.month}</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monthly Performance Review</p>
                  </div>
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-50">
                    <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-2"><ArrowUpRight className="w-3 h-3" /> Total Inflow</span>
                    <span className="font-mono font-black text-emerald-600">AED {month.inflow.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-50">
                    <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-2"><PackageCheck className="w-3 h-3" /> Consignment Portion</span>
                    <span className="font-mono font-bold text-indigo-400">AED {month.consignment.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-50">
                    <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-2"><History className="w-3 h-3" /> Adjustments</span>
                    <span className={`font-mono font-black ${month.adjustment < 0 ? 'text-red-500' : 'text-orange-600'}`}>AED {month.adjustment.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-6">
                    <span className="text-xs font-black text-[#1a237e] uppercase tracking-widest">Monthly Net Flow</span>
                    <span className="text-3xl font-black text-[#1a237e] font-mono tracking-tighter leading-none">AED {month.net.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {monthlyAggregates.length === 0 && (
            <div className="col-span-full py-40 text-center text-gray-200 uppercase text-[10px] font-black tracking-widest">No monthly records found</div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-center gap-4 text-gray-300 py-10">
        <Info className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase tracking-widest">Data is aggregated from cloud (Supabase) with local fallback.</span>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
