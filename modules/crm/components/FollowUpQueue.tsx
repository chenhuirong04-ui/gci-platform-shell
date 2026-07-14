import React, { useMemo, useState } from 'react';
import { FollowUpTask, TradeStatus } from '../types';
import { Language, translations } from '../services/i18n';
import {
  Clock, Archive, Sparkles, ChevronRight,
  LayoutList, LayoutGrid, AlertCircle, Search, X as XIcon,
} from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';

// ── Dark theme tokens ─────────────────────────────────────────────────
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const ROW_H  = 'rgba(255,255,255,0.04)'; // hover
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const GOLD_L = '#D4AF37';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';

interface FollowUpQueueProps {
  tasks: FollowUpTask[];
  onAction: (task: FollowUpTask) => void;
  onUpdateStatus: (id: string, status: FollowUpTask['status']) => void;
  onUpdateTradeStatus: (id: string, status: TradeStatus) => void;
  onArchiveTask?: (id: string) => void;
  lang: Language;
  onFilteredTasksChange?: (tasks: FollowUpTask[]) => void;
}

const TRADE_STATUSES: TradeStatus[] = [
  '新询盘','需求整理中','待报价','已报价待确认','合同待签',
  '执行中','已成交','暂缓','已归档',
];

type FilterChip = '今日重点'|'全部'|'高优先级'|'待报价'|'等待回复'|'内部任务'|'已完成';
const CHIPS: FilterChip[] = ['今日重点','全部','高优先级','待报价','等待回复','内部任务','已完成'];

function applyFilter(tasks: FollowUpTask[], chip: FilterChip): FollowUpTask[] {
  const today = new Date().toISOString().slice(0, 10);
  switch (chip) {
    case '今日重点': return tasks.filter(t => t.status === 'todo' && (t.nextFollowUpAt||'').slice(0,10) <= today);
    case '高优先级': return tasks.filter(t => t.status === 'todo' && t.priority === 'A');
    case '待报价':   return tasks.filter(t => t.tradeStatus === '待报价');
    case '等待回复': return tasks.filter(t => t.tradeStatus === '已报价待确认' || t.tradeStatus === '合同待签');
    case '内部任务': return tasks.filter(t => t.businessType === 'LOG_ONLY' || !(t.clientName||'').trim() || (t.clientName||'') === '未知客户');
    case '已完成':   return tasks.filter(t => t.status === 'completed');
    default:         return tasks.filter(t => t.status !== 'deleted' && t.status !== 'archived');
  }
}

const PRIORITY_COLOR: Record<string, string> = { A: '#EF4444', B: '#F59E0B', C: '#64748B' };
const PRIORITY_LABEL: Record<string, string>  = { A: '高', B: '中', C: '低' };
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易', PROJECT: '项目', LOG_ONLY: '内部', INTERNAL: '内部',
};

function relativeDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  return `${diff} 天后`;
}

function isOverdue(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d < new Date(new Date().toDateString());
}

function pickAIPriority(tasks: FollowUpTask[]): FollowUpTask[] {
  return [...tasks]
    .filter(t => t.status === 'todo')
    .sort((a, b) => {
      const pa = a.priority === 'A' ? 0 : a.priority === 'B' ? 1 : 2;
      const pb = b.priority === 'A' ? 0 : b.priority === 'B' ? 1 : 2;
      return pa !== pb ? pa - pb : (a.nextFollowUpAt||'') < (b.nextFollowUpAt||'') ? -1 : 1;
    })
    .slice(0, 3);
}

function aiReason(task: FollowUpTask): string {
  if (isOverdue(task.nextFollowUpAt)) return '跟进日期已逾期，需立即处理';
  if (task.priority === 'A') return '高优先级，建议今天跟进';
  if (task.tradeStatus === '待报价') return '客户待报价，需尽快回复';
  if (task.tradeStatus === '已报价待确认') return '报价已发出，等待客户确认';
  if (task.tradeStatus === '合同待签') return '客户确认合作，催促签署合同';
  return '按计划跟进';
}

// ── Kanban (optional view) ────────────────────────────────────────────
function KanbanView({ tasks, onAction, onUpdateTradeStatus }: {
  tasks: FollowUpTask[];
  onAction: (t: FollowUpTask) => void;
  onUpdateTradeStatus: (id: string, s: TradeStatus) => void;
}) {
  return (
    <div className="overflow-x-auto" style={{ height: 'calc(100vh - 360px)' }}>
      <div className="flex gap-4 h-full pb-2" style={{ minWidth: 'max-content' }}>
        {TRADE_STATUSES.map(status => {
          const col = tasks.filter(t => t.status === 'todo' && t.tradeStatus === status);
          return (
            <div key={status} className="w-60 shrink-0 flex flex-col h-full">
              <div className="px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between"
                style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                <span className="text-xs font-black" style={{ color: T2 }}>{status}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: T3 }}>
                  {col.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5">
                {col.length === 0 ? (
                  <div className="py-10 text-center text-xs font-bold rounded-xl"
                    style={{ border: `2px dashed ${BORDER}`, color: T3 }}>暂无</div>
                ) : col.map(task => (
                  <div key={task.id} onClick={() => onAction(task)}
                    className="p-4 rounded-xl cursor-pointer transition-all hover:opacity-80"
                    style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-black line-clamp-1" style={{ color: T1 }}>
                        {task.clientName || task.inquirySummary || '—'}
                      </span>
                      <span className="ml-2 shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded"
                        style={{ background: `${PRIORITY_COLOR[task.priority||'B']}25`, color: PRIORITY_COLOR[task.priority||'B'] }}>
                        {PRIORITY_LABEL[task.priority||'B']}
                      </span>
                    </div>
                    <p className="text-xs line-clamp-2 mb-3" style={{ color: T2 }}>
                      {task.lastContext || task.inquirySummary || '详情待补充'}
                    </p>
                    <div className="flex items-center justify-between text-xs font-bold mb-3">
                      <span className={isOverdue(task.nextFollowUpAt) ? 'text-red-400' : ''} style={!isOverdue(task.nextFollowUpAt) ? { color: T3 } : {}}>
                        <Clock className="w-3 h-3 inline mr-1" />{relativeDate(task.nextFollowUpAt)}
                      </span>
                      <span style={{ color: GOLD }}>{task.owner}</span>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <select value={task.tradeStatus}
                        onChange={e => onUpdateTradeStatus(task.id, e.target.value as TradeStatus)}
                        className="w-full rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                        style={{ background: CARD, border: `1px solid ${BORDER}`, color: T2 }}>
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

// ── Main ──────────────────────────────────────────────────────────────
const FollowUpQueue: React.FC<FollowUpQueueProps> = ({
  tasks, onAction, onUpdateStatus, onUpdateTradeStatus, onArchiveTask, lang, onFilteredTasksChange,
}) => {
  const _t = translations[lang]; void _t;
  const [view, setView]   = useState<'list'|'kanban'>('list');
  const [chip, setChip]   = useState<FilterChip>('全部');
  const [searchQ, setSearchQ] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string|null>(null);

  const aiPriority = useMemo(() => pickAIPriority(tasks), [tasks]);

  const filtered = useMemo(() => {
    const base = applyFilter(tasks, chip);
    if (!searchQ.trim()) return base;
    const q = searchQ.trim().toLowerCase();
    return base.filter(t => [
      t.clientName, t.inquirySummary, t.lastContext, t.goal,
      t.suggestedAction, t.owner, t.tradeStatus, t.countryCity,
      t.email, t.whatsapp, t.phoneE164,
      t.aiInsights?.nextActionSuggestion, t.aiInsights?.realNeed, t.businessType,
    ].some(v => v && String(v).toLowerCase().includes(q)));
  }, [tasks, chip, searchQ]);

  useEffect(() => { onFilteredTasksChange?.(filtered); }, [filtered, onFilteredTasksChange]);

  // ── List view ─────────────────────────────────────────────────────
  const ListView = () => (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {/* Column headers */}
      <div className="grid px-5 py-3 text-xs font-black uppercase tracking-widest"
        style={{ gridTemplateColumns: '2fr 60px 120px 50px 90px 1.6fr 70px 100px', borderBottom: `1px solid ${BORDER}`, color: T3 }}>
        <span>客户 / 标题</span>
        <span>类型</span>
        <span>状态</span>
        <span>优先</span>
        <span>跟进日期</span>
        <span>下一步</span>
        <span>负责人</span>
        <span className="text-right">操作</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-base font-bold" style={{ color: T3 }}>
          {searchQ.trim() ? '没有找到相关跟进记录' : '暂无记录'}
        </div>
      ) : filtered.map((task, idx) => {
        const overdue = isOverdue(task.nextFollowUpAt);
        const nextDate = relativeDate(task.nextFollowUpAt);
        const pri = task.priority || 'B';
        const name = task.clientName || task.inquirySummary || '未知客户';
        const subtitle = task.lastContext || task.aiInsights?.realNeed || task.inquirySummary || '';
        const nextAction = task.aiInsights?.nextActionSuggestion || task.suggestedAction || '';
        const isHovered = hoveredRow === task.id;

        return (
          <div
            key={task.id}
            onClick={() => onAction(task)}
            onMouseEnter={() => setHoveredRow(task.id)}
            onMouseLeave={() => setHoveredRow(null)}
            className="grid items-center px-5 py-3.5 cursor-pointer transition-colors"
            style={{
              gridTemplateColumns: '2fr 60px 120px 50px 90px 1.6fr 70px 100px',
              borderTop: idx > 0 ? `1px solid ${BORDER}` : 'none',
              background: isHovered ? ROW_H : (overdue ? 'rgba(239,68,68,0.05)' : 'transparent'),
            }}
          >
            {/* Customer / Title */}
            <div className="min-w-0 pr-4">
              <div className="text-sm font-black truncate" style={{ color: T1 }}>{name}</div>
              {subtitle ? (
                <div className="text-xs truncate mt-0.5" style={{ color: T2 }}>{subtitle}</div>
              ) : (
                <div className="text-xs italic mt-0.5" style={{ color: T3 }}>下一步待补充</div>
              )}
            </div>

            {/* Type */}
            <div>
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}>
                {TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易'}
              </span>
            </div>

            {/* Status */}
            <div onClick={e => e.stopPropagation()} className="pr-2">
              <select value={task.tradeStatus || '新询盘'}
                onChange={e => onUpdateTradeStatus(task.id, e.target.value as TradeStatus)}
                className="w-full rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}>
                {TRADE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <span className="text-xs font-black px-2 py-0.5 rounded"
                style={{ background: `${PRIORITY_COLOR[pri]}22`, color: PRIORITY_COLOR[pri] }}>
                {PRIORITY_LABEL[pri]}
              </span>
            </div>

            {/* Next follow-up date */}
            <div>
              <span className="text-xs font-bold flex items-center gap-1"
                style={{ color: overdue ? '#F87171' : T2 }}>
                {overdue && <AlertCircle className="w-3 h-3 shrink-0" />}
                {nextDate}
              </span>
            </div>

            {/* Next action */}
            <div className="pr-4 min-w-0">
              {nextAction
                ? <span className="text-sm truncate block" style={{ color: T1 }}>{nextAction}</span>
                : <span className="text-sm italic" style={{ color: T3 }}>详情待补充</span>
              }
            </div>

            {/* Owner */}
            <div>
              <span className="text-sm font-bold" style={{ color: task.owner ? GOLD_L : T3 }}>
                {task.owner || '待分配'}
              </span>
            </div>

            {/* Action */}
            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
              <button onClick={() => onAction(task)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black text-white transition-all hover:opacity-80"
                style={{ background: '#0F172A', border: `1px solid ${GOLD}50` }}>
                跟进 <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onArchiveTask ? onArchiveTask(task.id) : onUpdateStatus(task.id, 'archived')}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                title="关闭本次跟进"
                style={{ color: T3 }}
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* AI Priority Summary */}
      {aiPriority.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: GOLD_L }} />
            <span className="text-sm font-black" style={{ color: GOLD_L }}>AI 今日建议先处理</span>
          </div>
          <div>
            {aiPriority.map((task, i) => (
              <div key={task.id}
                className="flex items-center px-5 py-3.5 gap-4 cursor-pointer transition-colors hover:bg-white/[0.03]"
                style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}
                onClick={() => onAction(task)}>
                <span className="text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white"
                  style={{ background: i === 0 ? '#DC2626' : i === 1 ? GOLD : T3 }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black truncate" style={{ color: T1 }}>
                    {task.clientName || task.inquirySummary || '—'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: T2 }}>{aiReason(task)}</div>
                </div>
                <div className="text-sm shrink-0 hidden sm:block truncate max-w-[200px]" style={{ color: T2 }}>
                  {task.aiInsights?.nextActionSuggestion || task.suggestedAction || '确认需求并回复'}
                </div>
                <button
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors hover:bg-white/10"
                  style={{ border: `1px solid ${BORDER}`, color: T2 }}
                  onClick={e => { e.stopPropagation(); onAction(task); }}>
                  查看详情 <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: T3 }} />
        <input
          type="text"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="搜索客户、标题、联系人、备注、下一步动作..."
          className="w-full pl-11 pr-10 py-3 rounded-xl text-sm font-medium outline-none transition-colors"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}
          onFocus={e => (e.target.style.borderColor = GOLD)}
          onBlur={e => (e.target.style.borderColor = BORDER)}
        />
        {searchQ && (
          <button onClick={() => setSearchQ('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
            style={{ color: T3 }}>
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHIPS.map(c => (
            <button key={c} onClick={() => setChip(c)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
              style={chip === c
                ? { background: GOLD, color: '#fff' }
                : { background: 'rgba(255,255,255,0.06)', color: T2 }}>
              {c}
            </button>
          ))}
          {(chip !== '全部' || searchQ.trim()) && (
            <span className="text-xs font-bold" style={{ color: T3 }}>{filtered.length} 条</span>
          )}
        </div>

        {/* View switch */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {([['list','列表',LayoutList],['kanban','看板',LayoutGrid]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={view === v
                ? { background: CARD2, color: T1, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }
                : { color: T3 }}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      {view === 'list'
        ? <ListView />
        : <KanbanView tasks={filtered} onAction={onAction} onUpdateTradeStatus={onUpdateTradeStatus} />
      }
    </div>
  );
};

export default FollowUpQueue;
