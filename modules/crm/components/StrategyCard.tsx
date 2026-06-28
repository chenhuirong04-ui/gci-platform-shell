import React from 'react';
import { StrategyInsight } from '../types';
import { Target, TrendingUp, Lightbulb, Languages } from 'lucide-react';

interface StrategyCardProps {
  data: StrategyInsight;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ data }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800">Part 1: 商业策略与洞察 (Strategy & Insight)</h2>
        </div>
        <div className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-50 px-2 py-1 rounded-full">
            <Languages className="w-3 h-3" />
            <span>中英双语版</span>
        </div>
      </div>
      
      <div className="p-6 grid gap-6 md:grid-cols-3">
        {/* Pain Points */}
        <div className="bg-red-50/50 p-4 rounded-lg border border-red-100 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-800">市场痛点 (Pain Points)</h3>
          </div>
          <div className="space-y-3">
             {/* Chinese (Primary for review) */}
             <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-line font-medium">
                {data.painPoints.cn}
            </p>
            <div className="h-px bg-red-200/50 w-full my-2"></div>
            {/* English (Original) */}
            <p className="text-slate-500 text-xs leading-relaxed whitespace-pre-line font-sans">
                {data.painPoints.en}
            </p>
          </div>
        </div>

        {/* Differentiation */}
        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-800">差异化优势 (Differentiation)</h3>
          </div>
          <div className="space-y-3">
             {/* Chinese */}
             <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-line font-medium">
                {data.differentiation.cn}
            </p>
            <div className="h-px bg-blue-200/50 w-full my-2"></div>
            {/* English */}
            <p className="text-slate-500 text-xs leading-relaxed whitespace-pre-line font-sans">
                {data.differentiation.en}
            </p>
          </div>
        </div>

        {/* Action Plan */}
        <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-emerald-800">行动计划 (Action Plan)</h3>
          </div>
           <div className="space-y-3">
            {/* Chinese */}
            <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-line font-medium">
                {data.actionPlan.cn}
            </p>
            <div className="h-px bg-emerald-200/50 w-full my-2"></div>
            {/* English */}
            <p className="text-slate-500 text-xs leading-relaxed whitespace-pre-line font-sans">
                {data.actionPlan.en}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyCard;