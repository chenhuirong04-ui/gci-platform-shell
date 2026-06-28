import React, { useMemo } from 'react';
import { FollowUpTask } from '../types';

interface Props {
  tasks: FollowUpTask[];
}

const EXCLUDED = new Set(['暂缓', '已成交', '已归档', '执行中']);

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function BossDashboard({ tasks }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const tradeTasks = tasks.filter(t =>
    t.businessType === 'TRADE' && t.status !== 'deleted' && t.status !== 'archived'
  );

  const stats = useMemo(() => {
    const active = tradeTasks;

    const todayNew = active.filter(t =>
      (t.businessCreatedAt || t.createdAt)?.slice(0, 10) === today
    );
    const todayFollowUp = active.filter(t =>
      !!t.nextFollowUpAt &&
      t.nextFollowUpAt.slice(0, 10) <= today &&
      !EXCLUDED.has(t.tradeStatus)
    );
    const overdue7 = active.filter(t =>
      !!t.nextFollowUpAt &&
      t.nextFollowUpAt.slice(0, 10) < daysAgo(7) &&
      !EXCLUDED.has(t.tradeStatus)
    );
    const pendingQuote  = active.filter(t => t.tradeStatus === '待报价');
    const quoted        = active.filter(t => t.tradeStatus === '已报价待确认');
    const highPriority  = active.filter(t => t.priority === 'A' && !EXCLUDED.has(t.tradeStatus));
    const potentiallyLost = active.filter(t =>
      t.tradeStatus === '暂缓' ||
      (!!t.nextFollowUpAt &&
        t.nextFollowUpAt.slice(0, 10) < daysAgo(14) &&
        !EXCLUDED.has(t.tradeStatus))
    );

    return { todayNew, todayFollowUp, overdue7, pendingQuote, quoted, highPriority, potentiallyLost };
  }, [tradeTasks, today]);

  const rows: { label: string; clients: FollowUpTask[]; color: string; urgent?: boolean }[] = [
    { label: '今日新增客户',      clients: stats.todayNew,         color: '#6366F1' },
    { label: '今日应跟进',        clients: stats.todayFollowUp,    color: '#F59E0B', urgent: stats.todayFollowUp.length > 0 },
    { label: '超过7天未回复',     clients: stats.overdue7,         color: '#EF4444', urgent: stats.overdue7.length > 0 },
    { label: '待报价',            clients: stats.pendingQuote,     color: '#10B981', urgent: stats.pendingQuote.length > 0 },
    { label: '已报价待确认',      clients: stats.quoted,           color: '#8B5CF6', urgent: stats.quoted.length > 0 },
    { label: '高优先级 (A级)',     clients: stats.highPriority,     color: '#B8960C', urgent: stats.highPriority.length > 0 },
    { label: '可能失效客户',      clients: stats.potentiallyLost,  color: '#94A3B8' },
  ];

  return (
    <div className="rounded-2xl border border-slate-100 p-5 shadow-sm bg-white space-y-2">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        AI 老板日报 · TRADE 客户池 ({tradeTasks.length} 个)
      </div>

      {rows.map(row => (
        <div
          key={row.label}
          className="flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors"
          style={{
            backgroundColor: row.urgent ? `${row.color}08` : '#F8FAFC',
            borderColor: row.urgent ? `${row.color}35` : '#F1F5F9',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
            <span className="text-xs font-bold text-slate-600">{row.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black" style={{ color: row.urgent ? row.color : '#0F172A' }}>
              {row.clients.length}
            </span>
            {row.clients.length > 0 && (
              <span className="text-[10px] text-slate-400 font-medium max-w-[180px] truncate hidden sm:block">
                {row.clients.slice(0, 3).map(t => t.clientName).join('、')}
                {row.clients.length > 3 ? ` +${row.clients.length - 3}` : ''}
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Receivables placeholder */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          <span className="text-xs font-bold text-slate-400">应收款提醒</span>
        </div>
        <span className="text-[10px] font-bold text-slate-400 italic">暂未接入应收数据</span>
      </div>
    </div>
  );
}
