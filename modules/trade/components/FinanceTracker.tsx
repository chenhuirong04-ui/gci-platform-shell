import React, { useState, useRef, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Trash2, Calendar, FileText, PlusCircle,
  Building2, User, Wallet, Camera, Loader2, Lock
} from 'lucide-react';
import { parseFinancialDocument } from '../services/geminiService';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { cloudDb } from '../services/cloudDb'; // ✅ NEW: read/write Supabase
import { TransactionRecord } from '../types';

type AccountType = 'Corporate' | 'Personal' | 'Cash';

interface FinanceTrackerProps {
  onCancel: () => void;
}

const FinanceTracker: React.FC<FinanceTrackerProps> = ({ onCancel }) => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const MASTER_PWD = "241027";

  const [activeAccount, setActiveAccount] = useState<AccountType>('Corporate');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * ✅ SAFE LOADING STRATEGY (no risk of "nothing shows"):
   * 1) Try Supabase first: transactions table -> payload[]
   * 2) If cloud empty/unavailable, fallback to local persistence
   * 3) If local also empty, seed defaults to BOTH local + cloud
   */
  useEffect(() => {
    const loadData = async () => {
      // 1) cloud first
      try {
        const rows = await cloudDb.query('transactions', 500, 0, {});
        const cloudList: TransactionRecord[] = (rows || [])
          .map((r: any) => r?.payload)
          .filter(Boolean);

        if (cloudList.length > 0) {
          setTransactions(cloudList);
          // also cache locally to reduce fear & allow offline view
          await persistence.saveTransactions(cloudList);
          return;
        }
      } catch (e) {
        // ignore, fallback to local
      }

      // 2) local fallback
      const saved = await persistence.getTransactions();
      if (saved && saved.length > 0) {
        setTransactions(saved);

        // best-effort: backfill to cloud once (so future refresh has cloud)
        try { await cloudDb.upsert('transactions', saved as any); } catch {}
        return;
      }

      // 3) seed defaults (first-ever run)
      const defaults: TransactionRecord[] = [
        { id: '1', date: '2025-12-16', note: 'Initial Capital (启动资金)', type: 'in', amount: 50000.00, account: 'Corporate' },
        { id: '2', date: '2025-12-17', note: 'Office Supplies (办公用品)', type: 'out', amount: 450.00, account: 'Corporate' },
      ];
      setTransactions(defaults);
      await persistence.saveTransactions(defaults);
      try { await cloudDb.upsert('transactions', defaults as any); } catch {}
    };

    loadData();
  }, []);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === MASTER_PWD) {
      setIsAuthorized(true);
    } else {
      alert("Access Denied");
      onCancel();
    }
  };

  const addTransaction = async (type: 'in' | 'out') => {
    if (!note.trim() || !amount || Number(amount) <= 0) return;

    const newTransaction: TransactionRecord = {
      id: Date.now().toString(),
      date,
      note,
      type,
      amount: roundTo2(Number(amount)),
      account: activeAccount,
    };

    const updated = [newTransaction, ...transactions];
    setTransactions(updated);

    // ✅ write local first (instant, safe)
    await persistence.saveTransactions(updated);

    // ✅ then best-effort write to cloud (keeps all records after refresh)
    try {
      await cloudDb.upsert('transactions', [newTransaction as any]);
    } catch (e) {
      // keep quiet; local already saved
      console.warn('[FinanceTracker] cloud upsert failed, kept local.', e);
    }

    setNote('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleDelete = async (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    await persistence.saveTransactions(updated);

    // NOTE: we are NOT changing DB delete rules now (stability first)
    // keeping it local-only delete to avoid accidental data loss.
  };

  const currentTransactions = transactions.filter(t => t.account === activeAccount);
  const totalIncome = roundTo2(currentTransactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0));
  const totalExpense = roundTo2(currentTransactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0));
  const balance = roundTo2(totalIncome - totalExpense);

  if (!isAuthorized) {
    return (
      <div className="h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] shadow-2xl border border-gray-100 max-w-md w-full text-center space-y-8 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-[#CBA85C]/10 rounded-full flex items-center justify-center mx-auto text-[#CBA85C]">
            <Lock className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-[#080D1E] uppercase tracking-tighter">Private Area</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Please Enter Password to Access Ledger</p>
          </div>
          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="password"
              autoFocus
              className="w-full p-5 bg-gray-50 border-2 border-gray-100 rounded-[24px] outline-none font-black text-center text-2xl tracking-[0.5em] focus:border-[#CBA85C]"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center justify-center gap-2 py-4 rounded-[20px] bg-gray-50 text-gray-400 font-black text-[10px] uppercase"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 py-4 rounded-[20px] bg-[#080D1E] text-white font-black text-[10px] uppercase shadow-lg hover:bg-[#CBA85C] transition-all"
              >
                Verify
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const accounts: { id: AccountType; label: string; icon: React.ElementType }[] = [
    { id: 'Corporate', label: 'Corporate (对公)', icon: Building2 },
    { id: 'Personal', label: 'Personal (对私)', icon: User },
    { id: 'Cash', label: 'Cash (现金)', icon: Wallet },
  ];

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
      {/* FINANCE 分区页面标题 */}
      <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>财务账</h1>
      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-md flex flex-col sm:flex-row gap-2">
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setActiveAccount(acc.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-4 px-4 rounded-xl text-sm font-black transition-all ${
              activeAccount === acc.id
                ? 'bg-[#080D1E] text-white shadow-lg'
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            <acc.icon className={`w-4 h-4 ${activeAccount === acc.id ? 'text-white' : 'text-gray-400'}`} />
            {acc.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-8">
        <div className="lg:w-2/5 flex flex-col gap-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${balance >= 0 ? 'bg-[#6FBF8E]' : 'bg-[#E0846A]'}`} />
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
                  Current Balance ({activeAccount})
                </p>
                <p className={`text-4xl font-black font-mono tracking-tighter ${balance >= 0 ? 'text-gray-800' : 'text-[#E0846A]'}`}>
                  AED {balance.toFixed(2)}
                </p>
              </div>
              <div className={`p-4 rounded-2xl ${balance >= 0 ? 'bg-[#6FBF8E]/10 text-[#3F7D58]' : 'bg-[#E0846A]/10 text-[#E0846A]'}`}>
                <DollarSign className="w-8 h-8" />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-gray-50 pt-6">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Income</p>
                <p className="text-lg font-black text-[#3F7D58] flex items-center gap-1.5 font-mono">
                  <TrendingUp className="w-4 h-4" />
                  {totalIncome.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expense</p>
                <p className="text-lg font-black text-[#E0846A] flex items-center gap-1.5 font-mono">
                  <TrendingDown className="w-4 h-4" />
                  {totalExpense.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-50">
              <h3 className="font-black text-gray-800 flex items-center gap-3 uppercase text-sm tracking-widest">
                <PlusCircle className="w-5 h-5 text-[#CBA85C]" />
                Quick Entry
              </h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-[#CBA85C]/10 text-[#CBA85C] rounded-xl hover:bg-[#CBA85C]/20 transition-all text-[11px] font-black uppercase tracking-widest border border-[#CBA85C]/20 shadow-sm"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {isAnalyzing ? "Processing..." : "AI Scan"}
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" />
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transaction Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700 font-mono"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Memo / Note</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700"
                    placeholder="e.g. Sales Deposit"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount (AED)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    className="w-full pl-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] focus:ring-4 focus:ring-[#CBA85C]/20 bg-white font-bold text-gray-700 font-mono text-xl"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button
                  onClick={() => addTransaction('in')}
                  disabled={!note || !amount || isAnalyzing}
                  className="flex items-center justify-center gap-2 p-4 rounded-xl bg-[#3F7D58] text-white hover:bg-[#2d5c40] shadow-lg font-black uppercase text-xs tracking-widest"
                >
                  <TrendingUp className="w-4 h-4" /> Income
                </button>
                <button
                  onClick={() => addTransaction('out')}
                  disabled={!note || !amount || isAnalyzing}
                  className="flex items-center justify-center gap-2 p-4 rounded-xl bg-[#A85D45] text-white hover:bg-[#8b4c37] shadow-lg font-black uppercase text-xs tracking-widest"
                >
                  <TrendingDown className="w-4 h-4" /> Expense
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <span className="font-black text-gray-800 uppercase text-xs tracking-[0.2em] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#CBA85C]" />
              {activeAccount} Ledger
            </span>
            <span className="text-[10px] px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600 font-black tracking-widest">
              {currentTransactions.length} ENTRIES
            </span>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Memo</th>
                  <th className="px-6 py-4 text-right">Value (AED)</th>
                  <th className="px-4 py-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {currentTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-[#CBA85C]/5 transition-colors group">
                    <td className="px-6 py-5 text-gray-400 font-mono text-[11px] whitespace-nowrap">{t.date}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${t.type === 'in' ? 'bg-[#6FBF8E]' : 'bg-[#E0846A]'}`} />
                        <span className="text-sm font-bold text-gray-700 uppercase">{t.note}</span>
                      </div>
                    </td>
                    <td className={`px-6 py-5 text-right font-black font-mono text-sm tracking-tighter ${t.type === 'in' ? 'text-[#3F7D58]' : 'text-[#E0846A]'}`}>
                      {t.type === 'in' ? '+' : '-'}{t.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-5 text-right">
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-gray-200 hover:text-[#E0846A] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
};

export default FinanceTracker;
