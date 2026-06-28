
import React, { useMemo } from 'react';
import { FollowUpTask, TradeStatus } from '../types';
import { Language, translations } from '../services/i18n';
import { Clock, Archive, Globe, User } from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';

interface FollowUpQueueProps {
  tasks: FollowUpTask[];
  onAction: (task: FollowUpTask) => void;
  onUpdateStatus: (id: string, status: FollowUpTask['status']) => void;
  onUpdateTradeStatus: (id: string, status: TradeStatus) => void;
  lang: Language;
}

// Canonical statuses — matches Notion 行动状态 exactly
const TRADE_STATUSES_CN: TradeStatus[] = ['新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '已成交', '暂缓', '已归档'];
const TRADE_STATUSES_EN: TradeStatus[] = ['新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '已成交', '暂缓', '已归档'];

const FollowUpQueue: React.FC<FollowUpQueueProps> = ({ tasks, onAction, onUpdateStatus, onUpdateTradeStatus, lang }) => {
  const t = translations[lang];
  const tradeStatuses = lang === 'zh' ? TRADE_STATUSES_CN : TRADE_STATUSES_EN;

  const TaskItem: React.FC<{ task: FollowUpTask }> = ({ task }) => {
    const bizId = (task as any).businessId || getTaskBusinessId(task.id);
    return (
      /* Entire card is clickable — same pattern as Project Progress */
      <div
        onClick={() => onAction(task)}
        className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm transition-all hover:shadow-lg hover:border-[#B8960C] cursor-pointer group animate-slideIn"
      >
        {/* ── Header: bizId · clientName · role badge ── */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {bizId && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#0F172A10', color: '#0F172A' }}>{bizId}</span>
              )}
              <span className="text-sm font-black text-slate-800">{task.clientName}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${task.myRole === 'SELLER' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                {task.myRole === 'SELLER' ? '询盘客户' : '供应商'}
              </span>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Globe className="w-3 h-3 text-slate-400" /> {task.countryCity}
            </div>
          </div>
        </div>

        {/* ── Context summary ── */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
          <p className="text-[11px] text-slate-600 leading-relaxed font-medium line-clamp-2">
            {task.aiInsights?.realNeed || task.lastContext || '—'}
          </p>
        </div>

        {/* ── Date / owner row ── */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <Clock className="w-3 h-3" /> {new Date(task.nextFollowUpAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase" style={{ color: '#B8960C' }}>
            <User className="w-3 h-3" /> {task.owner}
          </div>
        </div>

        {/* ── Quick actions (stopPropagation prevents card click) ── */}
        <div
          className="grid grid-cols-2 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <select
            value={task.tradeStatus}
            onChange={(e) => onUpdateTradeStatus(task.id, e.target.value as TradeStatus)}
            className="col-span-1 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-black outline-none appearance-none cursor-pointer"
          >
            {TRADE_STATUSES_CN.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => onUpdateStatus(task.id, 'archived')}
            className="col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 text-[10px] font-black uppercase"
          >
            <Archive className="w-3.5 h-3.5" /> {t.status_archived}
          </button>
        </div>
      </div>
    );
  };

  return (
    /* Outer: fixed viewport height, horizontal scroll always visible */
    <div
      className="overflow-x-auto custom-scrollbar"
      style={{ height: 'calc(100vh - 220px)' }}
    >
      {/* Inner flex: fills full height, columns side by side */}
      <div className="flex gap-4 h-full pb-2" style={{ minWidth: 'max-content' }}>
        {tradeStatuses.map(status => {
          const colTasks = tasks.filter(t => t.status === 'todo' && t.tradeStatus === status);
          return (
            <div key={status} className="w-72 shrink-0 flex flex-col h-full">
              {/* Column header — fixed, never scrolls */}
              {(() => {
                const isPaused  = status === '暂缓';
                const isDone    = status === '已成交';
                const isArchive = status === '已归档';
                const bgColor   = isPaused ? '#F1F5F9' : isDone ? '#ECFDF5' : isArchive ? '#F8FAFF' : '#F1F5F9';
                const textColor = isPaused ? '#94A3B8' : isDone ? '#10B981' : isArchive ? '#6366F1' : '#475569';
                return (
                  <div className="px-4 py-3 rounded-2xl border shadow-sm flex items-center justify-between shrink-0 mb-3"
                    style={{ backgroundColor: bgColor, borderColor: textColor + '30' }}>
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: textColor }}>{status}</span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black"
                      style={{ backgroundColor: '#FFFFFF80', color: textColor }}>{colTasks.length}</span>
                  </div>
                );
              })()}
              {/* Column body — scrolls independently */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {colTasks.length === 0 ? (
                  <div className="py-16 text-center text-slate-300 italic text-[10px] font-bold uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-2xl">
                    No Opportunities
                  </div>
                ) : (
                  colTasks.map(task => <TaskItem key={task.id} task={task} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FollowUpQueue;
