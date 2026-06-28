import React from 'react';
import { ScreeningResult } from '../types';
import { Filter, Trash2, Trophy, Medal, AlertCircle } from 'lucide-react';

interface ScreeningStatsProps {
  stats: ScreeningResult;
}

const ScreeningStats: React.FC<ScreeningStatsProps> = ({ stats }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 animate-fadeIn">
      <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Filter className="w-5 h-5 text-emerald-400" />
           <h2 className="text-lg font-bold text-white">iCare 智能分级海选 (Tiered Screening)</h2>
        </div>
        <span className="text-slate-400 text-xs">Total Processed: {stats.totalInputLines}</span>
      </div>
      
      <div className="p-6 grid gap-6 md:grid-cols-4">
        
        {/* Grade A: Gold */}
        <div className="flex items-center gap-4 border-r border-slate-100 last:border-0 pr-4 bg-amber-50/50 p-2 rounded-lg border border-amber-100">
          <div className="p-3 bg-amber-100 rounded-lg">
             <Trophy className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] text-amber-600 uppercase font-bold tracking-wider">A级重点客户</p>
            <p className="text-2xl font-bold text-amber-700">{stats.gradeACount}</p>
            <p className="text-[10px] text-amber-500">建议电话+面谈</p>
          </div>
        </div>

        {/* Grade B: Silver */}
        <div className="flex items-center gap-4 border-r border-slate-100 last:border-0 pr-4 bg-slate-50 p-2 rounded-lg border border-slate-100">
          <div className="p-3 bg-slate-200 rounded-lg">
             <Medal className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">B级潜力客户</p>
            <p className="text-2xl font-bold text-slate-700">{stats.gradeBCount}</p>
            <p className="text-[10px] text-slate-400">建议邮件触达</p>
          </div>
        </div>

        {/* Grade C: Discard */}
        <div className="flex items-center gap-4 border-r border-slate-100 last:border-0 pr-4 opacity-75">
          <div className="p-3 bg-red-50 rounded-lg">
             <Trash2 className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-[10px] text-red-400 uppercase font-bold tracking-wider">已剔除 (Grade C)</p>
            <p className="text-2xl font-bold text-red-500">{stats.discardCount}</p>
            <p className="text-[10px] text-red-300">非精准/竞争对手</p>
          </div>
        </div>

        {/* Summary Text */}
        <div className="md:col-span-1 flex items-center">
            <div className="bg-slate-50 border border-slate-100 rounded p-3 text-xs text-slate-600 leading-relaxed w-full">
              <span className="font-bold text-slate-800 block mb-1 flex items-center gap-1">
                 <AlertCircle className="w-3 h-3" /> 筛选报告:
              </span>
              {stats.summaryCn}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ScreeningStats;