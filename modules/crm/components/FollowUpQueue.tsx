import React, { useMemo, useState } from 'react';
import { FollowUpTask, TradeStatus } from '../types';
import { Language, translations } from '../services/i18n';
import {
  Clock, Archive, Globe, User, Sparkles, ChevronRight,
  LayoutList, LayoutGrid, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';

const NAVY = '#0F172A';
const GOLD = '#B8960C';

interface FollowUpQueueProps {
  tasks: FollowUpTask[];
  onAction: (task: FollowUpTask) => void;
  onUpdateStatus: (id: string, status: FollowUpTask['status']) => void;
  onUpdateTradeStatus: (id: string, status: TradeStatus) => void;
  lang: Language;
}

const TRADE_STATUSES: TradeStatus[] = [
  '新询盘', '需求整理中', '待报价', '已报价待确认',
  '执行中', '已成交', '暂缓', '已归档',
];

// ── Filter chip definitions ─────────────────────────────────────────
type FilterChip = '今日重点' | '全部' | '高优先级' | '待报价' | '等待回复' | '内部任务' | '已完成';
const CHIPS: FilterChip[] = ['今日重点', '全部', '高优先级', '待报价', '等待回复', '内部任务', '已完成'];

function applyFilter(tasks: FollowUpTask[], chip: FilterChip): FollowUpTask[] {
  const today = new Date().toISOString().slice(0, 10);
  switch (chip) {
    case '今日重点':
      return tasks.filter(t =>
        t.status === 'todo' &&
        (t.nextFollowUpAt || '').slice(0, 10) <= today
      );
    case '高优先级':
      return tasks.filter(t => t.status === 'todo' && t.priority === 'A');
    case '待报价':
      return tasks.filter(t => t.tradeStatus === '待报价');
    case '等待回复':
      return tasks.filter(t => t.tradeStatus === '已报价待确认');
    case '内部任务':
      return tasks.filter(t =>
        t.businessType === 'LOG_ONLY' ||
        (t.clientName || '') === '' ||
        (t.clientName || '') === '未知客户'
      );
    case '已完成':
      return tasks.filter(t => t.status === 'completed');
    case '全部':
    default:
      return tasks.filter(t => t.status !== 'deleted' && t.status !== 'archived');
  }
}

// ── Priority / status helpers ───────────────────────────────────────
const PRIORITY_LABEL: Record<string, string> = { A: '高', B: '中', C: '低' };
const PRIORITY_COLOR: Record<string, string> = {
  A: '#EF4444', B: '#F59E0B', C: '#94A3B8',
};
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易', PROJECT: '项目', LOG_ONLY: '内部', INTERNAL: '内部',
};

function relativeDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `逾期 ${Math.abs(diff)}天`;
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  return `${diff}天后`;
}

function isOverdue(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d < new Date(new Date().toDateString());
}

// ── AI priority mock ────────────────────────────────────────────────
function pickAIPriority(tasks: FollowUpTask[]): FollowUpTask[] {
  return [...tasks]
    .filter(t => t.status === 'todo')
    .sort((a, b) => {
      const pa = a.priority === 'A' ? 0 : a.priority === 'B' ? 1 : 2;
      const pb = b.priority === 'A' ? 0 : b.priority === 'B' ? 1 : 2;
      if (pa !== pb) return pa - pb;
      return (a.nextFollowUpAt || '') < (b.nextFollowUpAt || '') ? -1 : 1;
    })
    .slice(0, 3);
}

function aiReason(task: FollowUpTask): string {
  if (isOverdue(task.nextFollowUpAt)) return '跟进日期已逾期，需立即处理';
  if (task.priority === 'A') return '高优先级，建议今天跟进';
  if (task.tradeStatus === '待报价') return '客户待报价，需尽快回复';
  if (task.tradeStatus === '已报价待确认') return '报价已发出，等待客户回复';
  return '按计划跟进';
}

// ── Kanban column (legacy view) ─────────────────────────────────────
function KanbanView({
  tasks, onAction, onUpdateStatus, onUpdateTradeStatus, t,
}: {
  tasks: FollowUpTask[];
  onAction: (t: FollowUpTask) => void;
  onUpdateStatus: (id: string, s: FollowUpTask['status']) => void;
  onUpdateTradeStatus: (id: string, s: TradeStatus) => void;
  t: ReturnType<typeof translations['zh' | 'en']>;
}) {
  return (
    <div className="overflow-x-auto" style={{ height: 'calc(100vh - 320px)' }}>
      <div className="flex gap-4 h-full pb-2" style={{ minWidth: 'max-content' }}>
        {TRADE_STATUSES.map(status => {
          const colTasks = tasks.filter(t => t.status === 'todo' && t.tradeStatus === status);
          const isPaused = status === '暂缓';
          const isDone = status === '已成交';
          const textColor = isPaused ? '#94A3B8' : isDone ? '#10B981' : '#475569';

          return (
            <div key={status} className="w-64 shrink-0 flex flex-col h-full">
              <div
                className="px-4 py-2.5 rounded-xl border flex items-center justify-between shrink-0 mb-3"
                style={{ backgroundColor: `${textColor}10`, borderColor: `${textColor}30` }}
              >
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textColor }}>
                  {status}
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-white/60" style={{ color: textColor }}>
                  {colTasks.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                {colTasks.length === 0 ? (
                  <div className="py-12 text-center text-slate-300 text-[10px] font-bold border-2 border-dashed border-slate-100 rounded-xl">
                    暂无
                  </div>
                ) : colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => onAction(task)}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-[#B8960C]/50 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-black text-slate-800 leading-snug line-clamp-1">
                        {task.clientName || task.inquirySummary || '—'}
                      </span>
                      <span
                        className="ml-2 shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${PRIORITY_COLOR[task.priority || 'B']}20`, color: PRIORITY_COLOR[task.priority || 'B'] }}
                      >
                        {PRIORITY_LABEL[task.priority || 'B']}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mb-3">
                      {task.lastContext || task.inquirySummary || '详情待补充'}
                    </p>
                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {relativeDate(task.nextFollowUpAt)}
                      </span>
                      <span style={{ color: GOLD }}>{task.owner}</span>
                    </div>
                    <div className="mt-3" onClick={e => e.stopPropagation()}>
                      <select
                        value={task.tradeStatus}
                        onChange={e => onUpdateTradeStatus(task.id, e.target.value as TradeStatus)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-black outline-none cursor-pointer"
                      >
                        {TRADE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────
const FollowUpQueue: React.FC<FollowUpQueueProps> = ({
  tasks, onAction, onUpdateStatus, onUpdateTradeStatus, lang,
}) => {
  const t = translations[lang];
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [chip, setChip] = useState<FilterChip>('全部');

  const aiPriority = useMemo(() => pickAIPriority(tasks), [tasks]);
  const filtered = useMemo(() => applyFilter(tasks, chip), [tasks, chip]);

  // ── List view ───────────────────────────────────────────────────
  const ListView = () => (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      {/* Table header */}
      <div
        className="grid text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-2.5 border-b border-slate-100"
        style={{ gridTemplateColumns: '2fr 60px 110px 48px 80px 1.5fr 60px 90px' }}
      >
        <span>客户 / 标题</span>
        <span>类型</span>
        <span>状态</span>
        <span>优先</span>
        <span>跟进日期</span>
        <span>下一步</span>
        <span>负责人</span>
        <span className="text-right">操作</span>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-300 text-sm font-bold">
          暂无记录
        </div>
      ) : filtered.map((task, idx) => {
        const overdue = isOverdue(task.nextFollowUpAt);
        const nextDate = relativeDate(task.nextFollowUpAt);
        const pri = task.priority || 'B';
        const name = task.clientName || task.inquirySummary || '未知客户';
        const summary = task.lastContext || task.aiInsights?.nextActionSuggestion || task.inquirySummary || '';

        return (
          <div
            key={task.id}
            onClick={() => onAction(task)}
            className={`grid items-center px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 group ${idx > 0 ? 'border-t border-slate-100' : ''} ${overdue ? 'bg-red-50/30' : ''}`}
            style={{ gridTemplateColumns: '2fr 60px 110px 48px 80px 1.5fr 60px 90px' }}
          >
            {/* Customer / Title */}
            <div className="min-w-0 pr-3">
              <div className="font-black text-sm text-slate-800 truncate">{name}</div>
              {summary ? (
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{summary}</div>
              ) : (
                <div className="text-[10px] text-slate-300 mt-0.5 italic">下一步待补充</div>
              )}
            </div>

            {/* Type */}
            <div>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${NAVY}10`, color: NAVY }}>
                {TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易'}
              </span>
            </div>

            {/* Status */}
            <div
              onClick={e => e.stopPropagation()}
              className="pr-2"
            >
              <select
                value={task.tradeStatus || '新询盘'}
                onChange={e => onUpdateTradeStatus(task.id, e.target.value as TradeStatus)}
                className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[9px] font-black outline-none cursor-pointer"
                title={task.tradeStatus}
              >
                {TRADE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${PRIORITY_COLOR[pri]}15`, color: PRIORITY_COLOR[pri] }}
              >
                {PRIORITY_LABEL[pri]}
              </span>
            </div>

            {/* Next follow-up date */}
            <div>
              <span
                className={`text-[10px] font-bold flex items-center gap-1 ${overdue ? 'text-red-500' : 'text-slate-500'}`}
              >
                {overdue && <AlertCircle className="w-3 h-3 shrink-0" />}
                {nextDate}
              </span>
            </div>

            {/* Next action */}
            <div className="pr-3 min-w-0">
              <span className="text-[10px] text-slate-600 truncate block">
                {task.aiInsights?.nextActionSuggestion || task.suggestedAction || (
                  <span className="text-slate-300 italic">详情待补充</span>
                )}
              </span>
            </div>

            {/* Owner */}
            <div>
              <span className="text-[10px] font-bold" style={{ color: GOLD }}>{task.owner || '—'}</span>
            </div>

            {/* Action */}
            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onAction(task)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black text-white transition-all hover:opacity-80"
                style={{ backgroundColor: NAVY }}
              >
                跟进 <ChevronRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => onUpdateStatus(task.id, 'archived')}
                className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                title="归档"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── AI Priority Summary ─────────────────────────────────── */}
      {aiPriority.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs font-black" style={{ color: NAVY }}>AI 今日建议先处理</span>
          </div>
          <div className="divide-y divide-slate-100">
            {aiPriority.map((task, i) => (
              <div
                key={task.id}
                className="flex items-center px-5 py-3 gap-4 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => onAction(task)}
              >
                <span
                  className="text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white"
                  style={{ backgroundColor: i === 0 ? '#EF4444' : i === 1 ? GOLD : '#94A3B8' }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-slate-800 truncate">
                    {task.clientName || task.inquirySummary || '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{aiReason(task)}</div>
                </div>
                <div className="text-[10px] text-slate-500 shrink-0 hidden sm:block truncate max-w-[180px]">
                  {task.aiInsights?.nextActionSuggestion || task.suggestedAction || '确认需求并回复'}
                </div>
                <button
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                  onClick={e => { e.stopPropagation(); onAction(task); }}
                >
                  查看详情 <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar: filters + view switch ─────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHIPS.map(c => (
            <button
              key={c}
              onClick={() => setChip(c)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all whitespace-nowrap"
              style={
                chip === c
                  ? { backgroundColor: NAVY, color: '#fff' }
                  : { backgroundColor: '#F1F5F9', color: '#64748B' }
              }
            >
              {c}
            </button>
          ))}
          {chip !== '全部' && (
            <span className="text-[10px] font-bold text-slate-400">
              {filtered.length} 条
            </span>
          )}
        </div>

        {/* View switch */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
            style={view === 'list' ? { backgroundColor: '#fff', color: NAVY, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#94A3B8' }}
          >
            <LayoutList className="w-3.5 h-3.5" /> 列表
          </button>
          <button
            onClick={() => setView('kanban')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
            style={view === 'kanban' ? { backgroundColor: '#fff', color: NAVY, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#94A3B8' }}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> 看板
          </button>
        </div>
      </div>

      {/* ── Records ────────────────────────────────────────────── */}
      {view === 'list' ? (
        <ListView />
      ) : (
        <KanbanView
          tasks={filtered}
          onAction={onAction}
          onUpdateStatus={onUpdateStatus}
          onUpdateTradeStatus={onUpdateTradeStatus}
          t={t}
        />
      )}
    </div>
  );
};

export default FollowUpQueue;
