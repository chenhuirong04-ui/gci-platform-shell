
import React from 'react';
import { SystemAudit } from '../types';
import { Database, List, ExternalLink } from 'lucide-react';

interface AuditPanelProps {
  stats: SystemAudit;
  onViewList: () => void;
  onViewLast: () => void;
}

const AuditPanel: React.FC<AuditPanelProps> = ({ stats, onViewList, onViewLast }) => {
  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-800 mb-8 animate-fadeIn">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300">系统审计 / 线索主库实时状态</h3>
        </div>
        <button 
          onClick={onViewList}
          className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-400 hover:text-white transition-colors"
        >
          <List className="w-3 h-3" /> 查看线索完整列表
        </button>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 font-bold uppercase">累计录入线索数</span>
          <span className="text-xl font-black text-white">{stats.totalLeadsCreated}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 font-bold uppercase">今日新增线索</span>
          <span className="text-xl font-black text-emerald-400">{stats.leadsToday}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 font-bold uppercase">已归档 SOT 线索</span>
          <span className="text-xl font-black text-orange-400">{stats.archivedCount}</span>
        </div>
        <button 
          onClick={onViewLast}
          disabled={!stats.lastCreatedLeadId}
          className="flex flex-col items-start group disabled:opacity-50"
        >
          <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-indigo-400 transition-colors">最新条目 ID <ExternalLink className="w-2 h-2 inline" /></span>
          <span className="text-[10px] font-mono text-slate-400 truncate w-full text-left group-hover:text-white transition-colors">{stats.lastCreatedLeadId || '暂无'}</span>
        </button>
      </div>
    </div>
  );
};

export default AuditPanel;
