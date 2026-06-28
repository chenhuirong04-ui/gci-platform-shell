import React, { useState, useEffect } from 'react';
import {
  Brain, AlertTriangle, Clock, MessageSquare,
  Copy, Check, RefreshCw, X, Zap, Sparkles,
  PackageSearch, Lightbulb, ChevronRight, Tag,
  Bot, Shield, Cpu, PauseCircle,
} from 'lucide-react';
import { FollowUpTask, Project } from '../types';
import { getTaskBusinessId } from '../utils/businessId';
import { GoogleGenAI } from '@google/genai';

const GOLD = '#B8960C';
const NAVY = '#0F172A';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  clientName: string;
  problem: string;
  suggestion: string;
  matchReason: string;
  daysOverdue: number;
  tradeStatus: string;
  task?: FollowUpTask;
  source: 'task' | 'project';
}

interface NewOpportunity {
  id: string;
  clientName: string;
  tradeStatus: string;
  suggestedType: '项目型' | '贸易型' | '小B/C';
  createdAt: string;
  matchReason: string;
  task: FollowUpTask;
}

interface GPTAction {
  title: string;
  clientName: string;
  reason: string;
  risk: string;
  commStyle: string;
  waTemplate: string;
  worthInvesting: boolean;
}

interface GPTResult {
  actions: GPTAction[];
  overallInsight: string;
  priorityFocus: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns positive = overdue, 0 = due today, negative = not yet due
function calcDaysOverdue(nextFollowUpAt: string | undefined): number {
  if (!nextFollowUpAt) return -999;
  const today = new Date().toISOString().slice(0, 10);
  const a = new Date(nextFollowUpAt.slice(0, 10)).getTime();
  const b = new Date(today).getTime();
  return Math.round((b - a) / 86400000);
}

function getGeminiKey(): string {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ── Classification constants ──────────────────────────────────────────────────
// ALL classification is status-field only. No keyword/text guessing allowed.
// Source of truth: Notion 行动状态 → tradeStatus field in FollowUpTask.

// GCI has quoted, waiting for client/owner confirmation
const QUOTED_WAITING   = '已报价待确认';
// Statuses that are done/closed/paused — excluded from ALL Action blocks
const DONE_STATUSES    = ['已成交', '已归档', '暂缓', '执行中'];
// How many days '已报价待确认' can sit before escalating to Block 1 (urgent)
const QUOTE_ESCALATE_DAYS = 3;

// ── Block 1: 今日必须推进 ─────────────────────────────────────────────────────
// Rules (status-based, no keywords):
//   • 需求整理中 — always urgent (internal work blocking progress)
//   • 已报价 — escalate after QUOTE_ESCALATE_DAYS days overdue
//   • Priority A — any overdue status

function buildUrgent(tasks: FollowUpTask[]): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && !DONE_STATUSES.includes(t.tradeStatus))
    .map(t => ({ t, od: calcDaysOverdue(t.nextFollowUpAt) }))
    .filter(({ t, od }) => {
      if (t.tradeStatus === '需求整理中') return od >= 0;
      if (t.tradeStatus === QUOTED_WAITING && od >= QUOTE_ESCALATE_DAYS) return true;
      if (t.priority === 'A' && od >= 0) return true;
      return false;
    })
    .sort((a, b) => {
      const pa = a.t.priority === 'A' ? 3 : a.t.priority === 'B' ? 2 : 1;
      const pb = b.t.priority === 'A' ? 3 : b.t.priority === 'B' ? 2 : 1;
      if (b.od !== a.od) return b.od - a.od;
      return pb - pa;
    })
    .slice(0, 8)
    .map(({ t, od }) => {
      const isQuoteOverdue = t.tradeStatus === QUOTED_WAITING && od >= QUOTE_ESCALATE_DAYS;
      const isInternal = t.tradeStatus === '需求整理中';

      const problem = isInternal
        ? '需求整理中，内部方案/BOQ 尚未完成，阻碍报价进度'
        : isQuoteOverdue ? `报价已发 ${od} 天，客户尚未回复`
        : od > 0 ? `A 级客户，跟进计划逾期 ${od} 天`
        : 'A 级客户，今日到期';

      const suggestion = isInternal
        ? '今日内完成需求整理，推进 BOQ/RFQ 生成'
        : isQuoteOverdue && od >= 5 ? '立即发 WhatsApp，询问客户决策进度'
        : isQuoteOverdue ? '主动跟进，确认客户是否收到并已阅报价'
        : t.suggestedAction || 'A 级客户，今日必须完成联系';

      const reasons = [
        t.tradeStatus,
        t.priority === 'A' ? 'A级' : '',
        od > 0 ? `逾期${od}天` : '今日到期',
      ].filter(Boolean);

      return {
        id: t.id, clientName: t.clientName, problem, suggestion,
        matchReason: '状态: ' + reasons.join(' · '),
        daysOverdue: od, tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    });
}

// ── Block 2: 等待客户审批/确认 ────────────────────────────────────────────────
// Rule: tradeStatus === '已报价待确认' (not yet escalated to urgent)

function buildWaitingClient(tasks: FollowUpTask[], urgentIds: Set<string>): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && t.tradeStatus === QUOTED_WAITING && !urgentIds.has(t.id))
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      return {
        id: t.id, clientName: t.clientName,
        problem: od > 0 ? `等待客户/业主确认，已等 ${od} 天` : '等待客户/业主确认',
        suggestion: od >= 5 ? '立即跟进，询问审批进展，提供补充资料支持'
          : od >= 2 ? '主动催促，提供进一步支持或备选方案'
          : '保持跟进，等待客户内部决策',
        matchReason: `状态: 已报价待确认${od > 0 ? ` · 已等${od}天` : ''}`,
        daysOverdue: Math.max(0, od), tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Block 3: 等供应商报价/确认 ────────────────────────────────────────────────
// Rule: tradeStatus === '待报价'

function buildWaitingSupplier(tasks: FollowUpTask[]): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && t.tradeStatus === '待报价')
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      return {
        id: t.id, clientName: t.clientName,
        problem: od > 0 ? `正在寻价/等供应商报价，已等 ${od} 天` : '正在寻价/等供应商报价',
        suggestion: od >= 3 ? '今日催促供应商，确认报价时间，同步反馈给客户'
          : '跟进供应商进度，预估报价到位时间',
        matchReason: `状态: 待报价${od > 0 ? ` · 已等${od}天` : ''}`,
        daysOverdue: Math.max(0, od), tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Block 4: 暂缓中 ───────────────────────────────────────────────────────────
// Rule: tradeStatus === '暂缓'

function buildPaused(tasks: FollowUpTask[]): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && t.tradeStatus === '暂缓')
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      return {
        id: t.id, clientName: t.clientName,
        problem: od > 0 ? `已暂缓，跟进计划已过期 ${od} 天` : '当前处于暂缓状态',
        suggestion: od > 7
          ? '建议评估是否重新激活此客户'
          : '按既定计划维持暂缓，等待合适时机',
        matchReason: `状态: 暂缓${od > 0 ? ` · 已过期${od}天` : ''}`,
        daysOverdue: Math.max(0, od), tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Block 5 helpers: rule-based fallback when GPT unavailable ─────────────────

function buildRuleSuggestions(
  tasks: FollowUpTask[],
  projects: Project[],
  urgent: ActionItem[],
  waitingClient: ActionItem[],
  waitingSupplier: ActionItem[],
): string[] {
  const active     = tasks.filter(t => t.status === 'todo' && !DONE_STATUSES.includes(t.tradeStatus));
  const aCount     = active.filter(t => t.priority === 'A').length;
  const quotedOld  = active.filter(t => t.tradeStatus === QUOTED_WAITING && calcDaysOverdue(t.nextFollowUpAt) >= 5).length;
  const internalCount = active.filter(t => t.tradeStatus === '需求整理中').length;
  const projCount  = projects.filter(p => !p.deleted && !p.archivedAt && p.type === '项目型').length;
  const tradeCount = projects.filter(p => !p.deleted && !p.archivedAt && p.type === '贸易型').length;

  const suggestions: string[] = [];
  const urgentA = urgent.filter(a => a.task?.priority === 'A').length;
  if (internalCount > 0)
    suggestions.push(`${internalCount} 条处于"需求整理中"—— 内部方案未完成，会直接阻碍报价进度`);
  if (aCount > 0 && urgentA > 0)
    suggestions.push(`${aCount} 条 A 级客户中有 ${urgentA} 条已逾期 —— 建议今日优先处理`);
  if (quotedOld > 0)
    suggestions.push(`${quotedOld} 条报价已发出 5 天以上无回复 —— 主动催促可显著提升成交率`);
  if (waitingSupplier.length >= 2)
    suggestions.push(`${waitingSupplier.length} 条在等供应商报价 —— 建议集中催报价，再统一回复客户`);
  if (waitingClient.length >= 3)
    suggestions.push(`${waitingClient.length} 条在等客户/业主确认 —— 可用 WhatsApp 模板批量催促`);
  if (projCount > 3 && projCount > tradeCount)
    suggestions.push(`项目型（${projCount}）> 贸易型（${tradeCount}）—— 建议集中推进工程 BOQ 和 FF&E 报价`);
  if (suggestions.length === 0)
    return ['当前暂无明显异常，建议按高优先级客户顺序跟进。'];
  return suggestions.slice(0, 3);
}

// ── Build GPT payload ─────────────────────────────────────────────────────────

function buildGPTPayload(tasks: FollowUpTask[], projects: Project[]) {
  const active = tasks.filter(t => t.status === 'todo' && !DONE_STATUSES.includes(t.tradeStatus));
  const sorted = [...active].sort((a, b) => {
    const pa = a.priority === 'A' ? 3 : a.priority === 'B' ? 2 : 1;
    const pb = b.priority === 'A' ? 3 : b.priority === 'B' ? 2 : 1;
    const oa = calcDaysOverdue(a.nextFollowUpAt);
    const ob = calcDaysOverdue(b.nextFollowUpAt);
    if (pb !== pa) return pb - pa;
    return ob - oa;
  });

  const taskSnaps = sorted.slice(0, 15).map(t => ({
    id: t.id,
    clientName: t.clientName,
    priority: t.priority,
    tradeStatus: t.tradeStatus,
    nextFollowUpAt: t.nextFollowUpAt || '',
    goal: (t.goal || '').slice(0, 80),
    lastContext: (t.lastContext || '').slice(0, 80),
    daysOverdue: calcDaysOverdue(t.nextFollowUpAt),
  }));

  const projSnaps = projects
    .filter(p => !p.deleted && !p.archivedAt && p.status === '进行中')
    .slice(0, 10)
    .map(p => ({ id: p.id, clientName: p.clientName, type: p.type, tradeStatus: p.tradeStatus, name: p.name }));

  const aCount      = active.filter(t => t.priority === 'A').length;
  const urgentCount = active.filter(t => {
    const od = calcDaysOverdue(t.nextFollowUpAt);
    return od >= 0 && (t.priority === 'A' || t.tradeStatus === '需求整理中' || (t.tradeStatus === QUOTED_WAITING && od >= QUOTE_ESCALATE_DAYS));
  }).length;
  const quotedOld    = active.filter(t => t.tradeStatus === QUOTED_WAITING && calcDaysOverdue(t.nextFollowUpAt) >= QUOTE_ESCALATE_DAYS).length;
  const sourcingCount = active.filter(t => t.tradeStatus === '待报价').length;

  return {
    tasks: taskSnaps,
    projects: projSnaps,
    stats: {
      totalActive: active.length,
      aCount,
      urgentCount,
      quotedOld,
      sourcingCount,
      projCount: projSnaps.length,
    },
    dateStr: new Date().toISOString().slice(0, 10),
  };
}

// ── WhatsApp Draft (Gemini) ────────────────────────────────────────────────────

function buildWAPrompt(item: ActionItem): string {
  const t = item.task!;
  return `你是 GCI (Global Care Info) 的 Chris，正在给客户发 WhatsApp 跟进消息。
客户：${t.clientName}，当前阶段：${item.tradeStatus}
问题：${item.problem}
目标：${t.goal || item.suggestion}
最近情况：${t.lastContext || '无'}

写一条 WhatsApp 消息：英文，不超过 5 行，开头称呼客户名，一句话点出进展，结尾问句推动下一步，简洁商务禁用套话。只输出消息正文。`.trim();
}

function WAModal({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const [draft, setDraft]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [copied, setCopied]   = useState(false);

  const generate = async () => {
    const key = getGeminiKey();
    if (!key) { setError('未配置 GEMINI API KEY'); return; }
    setLoading(true); setError('');
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildWAPrompt(item) }] }],
        config: { maxOutputTokens: 300 },
      });
      setDraft((res.text ?? '').trim());
    } catch (e: any) { setError(e?.message || '生成失败，请重试'); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: NAVY }}>
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-black" style={{ color: NAVY }}>WhatsApp 草稿</div>
              <div className="text-[10px] text-slate-400">{item.clientName} · {item.tradeStatus}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="rounded-xl p-3 bg-slate-50 text-xs font-bold text-slate-500 space-y-0.5">
          <div>问题：<span className="text-slate-700">{item.problem}</span></div>
          <div>建议：<span className="text-slate-700">{item.suggestion}</span></div>
        </div>
        {draft ? (
          <textarea
            className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
            style={{ minHeight: '110px' }}
            value={draft} onChange={e => setDraft(e.target.value)}
          />
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">
            点击生成，AI 将根据当前卡点和阶段起草消息
          </div>
        )}
        {error && <div className="rounded-lg p-2.5 bg-red-50 text-xs font-bold text-red-600">{error}</div>}
        <div className="flex gap-2">
          <button onClick={generate} disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: NAVY }}>
            {loading
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 生成中...</>
              : <><Brain className="w-3.5 h-3.5" /> {draft ? '重新生成' : 'AI 生成草稿'}</>}
          </button>
          {draft && (
            <button onClick={copy}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border-2 hover:bg-amber-50"
              style={{ borderColor: GOLD, color: GOLD }}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Block Header ──────────────────────────────────────────────────────────────

function BlockHeader({ dot, icon, title, count, emptyLabel }: {
  dot: string; icon: React.ReactNode; title: string; count: number; emptyLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
      <div style={{ color: dot }}>{icon}</div>
      <span className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>{title}</span>
      {count > 0 ? (
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ml-auto"
          style={{ backgroundColor: dot }}>{count}</span>
      ) : emptyLabel ? (
        <span className="text-[9px] font-bold text-slate-400 ml-auto">{emptyLabel}</span>
      ) : null}
    </div>
  );
}

// ── Rule Engine Badge ─────────────────────────────────────────────────────────

function RuleEngineBadge() {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
      style={{ backgroundColor: '#6366F115', color: '#6366F1' }}>
      <Cpu className="w-2.5 h-2.5" />
      <span className="text-[9px] font-black">规则引擎</span>
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ item, accentColor, onWA, onOpen }: {
  item: ActionItem; accentColor: string;
  onWA?: (item: ActionItem) => void;
  onOpen?: (item: ActionItem) => void;
}) {
  const bizId = item.task ? getTaskBusinessId(item.task.id) : '';
  return (
    <div className="flex gap-3 p-3.5 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: NAVY + '10', color: NAVY }}>{bizId}</span>
            )}
            <span className="text-sm font-black truncate" style={{ color: NAVY }}>{item.clientName}</span>
          </div>
          {item.daysOverdue > 0 && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: accentColor + '18', color: accentColor }}>
              已等 {item.daysOverdue} 天
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">{item.problem}</p>
        <p className="text-[11px] font-bold mt-1 flex items-start gap-1" style={{ color: NAVY }}>
          <Zap className="w-2.5 h-2.5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          {item.suggestion}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          <Tag className="w-2.5 h-2.5 flex-shrink-0 text-slate-300" />
          <span className="text-[9px] font-bold text-slate-400">{item.matchReason}</span>
        </div>
        {(onWA || onOpen) && (
          <div className="flex gap-1.5 mt-2">
            {onWA && item.source === 'task' && item.task && (
              <button onClick={() => onWA(item)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black text-white"
                style={{ backgroundColor: NAVY }}>
                <MessageSquare className="w-2.5 h-2.5" /> 生成 WA 消息
              </button>
            )}
            {onOpen && (
              <button onClick={() => onOpen(item)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border"
                style={{ borderColor: NAVY + '30', color: NAVY }}>
                打开详情 <ChevronRight className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp, onOpen }: { opp: NewOpportunity; onOpen: (t: FollowUpTask) => void }) {
  const typeColor = opp.suggestedType === '项目型' ? '#6366F1' : opp.suggestedType === '贸易型' ? GOLD : '#10B981';
  const bizId = getTaskBusinessId(opp.task.id);
  return (
    <div className="flex gap-3 p-3.5 rounded-xl bg-white border border-slate-100 shadow-sm">
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: '#10B981' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: NAVY + '10', color: NAVY }}>{bizId}</span>
            )}
            <span className="text-sm font-black truncate" style={{ color: NAVY }}>{opp.clientName}</span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: typeColor + '18', color: typeColor }}>
            建议: {opp.suggestedType}
          </span>
        </div>
        <p className="text-[11px] text-slate-500">状态: {opp.tradeStatus}  ·  今日录入</p>
        <div className="flex items-center gap-1 mt-1.5">
          <Tag className="w-2.5 h-2.5 flex-shrink-0 text-slate-300" />
          <span className="text-[9px] font-bold text-slate-400">{opp.matchReason}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => onOpen(opp.task)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border"
            style={{ borderColor: NAVY + '30', color: NAVY }}>
            打开详情 <ChevronRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GPT Action Card ───────────────────────────────────────────────────────────

function GPTActionCard({ action, index }: { action: GPTAction; index: number }) {
  const [copied, setCopied] = useState(false);
  const [showWA, setShowWA] = useState(false);

  const copyWA = async () => {
    await navigator.clipboard.writeText(action.waTemplate);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const rankColor = index === 0 ? '#EF4444' : index === 1 ? '#F97316' : GOLD;

  return (
    <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-50"
        style={{ backgroundColor: rankColor + '08' }}>
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
          style={{ backgroundColor: rankColor }}>
          {index + 1}
        </div>
        <span className="text-sm font-black flex-1" style={{ color: NAVY }}>{action.title}</span>
        {!action.worthInvesting && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">低优先</span>
        )}
      </div>
      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">客户 · </span>
          <span className="text-[11px] font-black" style={{ color: NAVY }}>{action.clientName}</span>
        </div>
        <div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">原因分析</div>
          <p className="text-[11px] text-slate-600 leading-relaxed">{action.reason}</p>
        </div>
        <div className="flex items-start gap-1.5 rounded-lg p-2.5 bg-red-50">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-400" />
          <p className="text-[11px] font-bold text-red-700 leading-relaxed">{action.risk}</p>
        </div>
        <div className="flex items-start gap-1.5">
          <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          <p className="text-[11px] font-bold leading-relaxed" style={{ color: NAVY }}>{action.commStyle}</p>
        </div>
        {/* WA Template */}
        {action.waTemplate && (
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-1">
                <MessageSquare className="w-2.5 h-2.5 text-slate-400" />
                <span className="text-[9px] font-black text-slate-400 uppercase">WhatsApp 文案</span>
              </div>
              <button onClick={() => setShowWA(v => !v)}
                className="text-[9px] font-black text-indigo-500">
                {showWA ? '收起' : '展开'}
              </button>
            </div>
            {showWA && (
              <div className="px-3 py-2.5">
                <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">
                  {action.waTemplate}
                </p>
                <button onClick={copyWA}
                  className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border"
                  style={{ borderColor: GOLD + '60', color: GOLD }}>
                  {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                  {copied ? '已复制' : '复制文案'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Block 4b: 新询盘 · 其他 (catch-all) ──────────────────────────────────────
// Rule: everything in todayFollowups not claimed by urgent / supplier / client

function buildOthers(
  tasks: FollowUpTask[],
  urgentIds: Set<string>,
  supplierIds: Set<string>,
  clientIds: Set<string>,
): ActionItem[] {
  const claimedIds = new Set([...urgentIds, ...supplierIds, ...clientIds]);
  return tasks
    .filter(t => t.status === 'todo' && !DONE_STATUSES.includes(t.tradeStatus) && !claimedIds.has(t.id))
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      return {
        id: t.id,
        clientName: t.clientName,
        problem: od > 0
          ? `状态: ${t.tradeStatus}，跟进计划逾期 ${od} 天`
          : od === 0
          ? `状态: ${t.tradeStatus}，今日跟进`
          : `状态: ${t.tradeStatus}`,
        suggestion: t.suggestedAction || '按计划推进，记录最新跟进情况',
        matchReason: `状态: ${t.tradeStatus}${t.priority ? ` · ${t.priority}级` : ''}`,
        daysOverdue: Math.max(0, od),
        tradeStatus: t.tradeStatus,
        task: t,
        source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Expanded List Modal ───────────────────────────────────────────────────────

type BlockKey = 'urgent' | 'supplier' | 'client' | 'paused' | 'others' | 'ai';

interface ModalConfig {
  key: BlockKey;
  title: string;
  dot: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}

function ExpandedModal({
  config, onClose, children,
}: {
  config: ModalConfig;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.dot }} />
            <div style={{ color: config.dot }}>{config.icon}</div>
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: NAVY }}>
              {config.title}
            </span>
            {config.badge}
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Compact Summary Card (CEO dashboard view) ─────────────────────────────────

function SummaryCard({
  dot, icon, title, count, badge,
  previewLines, emptyText,
  onExpand,
}: {
  dot: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  badge?: React.ReactNode;
  previewLines: { id: string; label: string; meta: string; urgent?: boolean }[];
  emptyText: string;
  onExpand: () => void;
  accentBorder: string;
}) {
  const cardBg = count > 0
    ? dot === '#EF4444' ? '#FFF5F5'
    : dot === '#F97316' ? '#FFF8F1'
    : dot === '#EAB308' ? '#FFFBF0'
    : dot === '#10B981' ? '#F0FDF8'
    : '#FFFDF0'
    : '#FAFAFA';

  return (
    <div
      className="rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow"
      style={{ backgroundColor: cardBg, cursor: count > 0 ? 'pointer' : 'default' }}
      onClick={count > 0 ? onExpand : undefined}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: dot + '15' }}>
            <div style={{ color: dot }}>{icon}</div>
          </div>
          <span className="text-xs font-black" style={{ color: NAVY }}>{title}</span>
          {badge}
        </div>
        <span
          className="text-sm font-black px-2.5 py-0.5 rounded-lg"
          style={{ backgroundColor: count > 0 ? dot + '15' : '#F1F5F9', color: count > 0 ? dot : '#94A3B8' }}
        >
          {count}
        </span>
      </div>

      {/* Preview lines */}
      <div className="space-y-2 min-h-[44px]">
        {count === 0 ? (
          <p className="text-[11px] text-slate-300 italic">{emptyText}</p>
        ) : (
          previewLines.slice(0, 2).map(line => (
            <div key={line.id} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
              <span className="text-[12px] font-bold truncate flex-1" style={{ color: NAVY }}>{line.label}</span>
              <span className="text-[10px] font-bold flex-shrink-0"
                style={{ color: line.urgent ? '#EF4444' : '#94A3B8' }}>
                {line.meta}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {count > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onExpand(); }}
          className="flex items-center gap-1 text-[11px] font-bold transition-colors hover:opacity-70"
          style={{ color: dot }}>
          查看全部 {count} 条
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── AI Summary Card ───────────────────────────────────────────────────────────

function AISummaryCard({
  aiLoading, aiError, aiResult, ruleSuggestions, onExpand, onRefresh,
}: {
  aiLoading: boolean;
  aiError: string;
  aiResult: GPTResult | null;
  ruleSuggestions: string[];
  onExpand: () => void;
  onRefresh: () => void;
}) {
  const previewText = aiLoading
    ? null
    : aiResult?.overallInsight || (aiError ? ruleSuggestions[0] : null);

  return (
    <div className="rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow" style={{ backgroundColor: '#FFFDF0', borderColor: GOLD + '30' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: GOLD + '15' }}>
            <Bot className="w-3.5 h-3.5" style={{ color: GOLD }} />
          </div>
          <span className="text-xs font-black" style={{ color: NAVY }}>OpenAI 智能建议</span>
          {!aiLoading && !aiError && aiResult && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg"
              style={{ backgroundColor: '#10B98115', color: '#10B981' }}>GPT-4o</span>
          )}
          {aiError && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-400">规则引擎</span>
          )}
        </div>
        <button onClick={e => { e.stopPropagation(); onRefresh(); }} disabled={aiLoading}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
          {aiLoading ? '分析中' : '刷新'}
        </button>
      </div>

      {/* Preview */}
      <div className="min-h-[52px] mb-4">
        {aiLoading && (
          <div className="flex items-center gap-2 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-[12px] font-bold">GPT-4o 正在分析业务数据…</span>
          </div>
        )}
        {!aiLoading && previewText && (
          <p className="text-[12px] font-bold leading-relaxed line-clamp-2" style={{ color: NAVY }}>
            {previewText}
          </p>
        )}
        {!aiLoading && !previewText && (
          <p className="text-[12px] text-slate-300 italic">等待数据加载后自动分析…</p>
        )}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        {(aiResult || aiError) && !aiLoading ? (
          <button onClick={onExpand}
            className="flex items-center gap-1 text-[11px] font-bold hover:opacity-70 transition-opacity"
            style={{ color: GOLD }}>
            {aiResult ? `查看全部 ${(aiResult.actions || []).length} 条建议` : '查看规则分析'}
            <ChevronRight className="w-3 h-3" />
          </button>
        ) : <div />}
        <div className="text-[9px] font-bold text-slate-300 flex items-center gap-1">
          <Shield className="w-2.5 h-2.5" />
          AI辅助建议，请以实际业务判断为准
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  tasks: FollowUpTask[];
  projects: Project[];
  // Pre-filtered follow-up records (= dashboardStats.todayFollowups).
  // Excludes contact_only orphans, deduped by businessId, date <= today, status not excluded.
  followupTasks?: FollowUpTask[];
  // Pre-computed paused group (= dashboardStats.actionCenterGroups.paused).
  // Required when followupTasks is provided, since todayFollowups excludes 暂缓.
  pausedTasks?: FollowUpTask[];
  onSelectTask: (task: FollowUpTask) => void;
  onTabSwitch: (tab: string) => void;
}

export default function ActionCenter({ tasks, projects, followupTasks, pausedTasks, onSelectTask, onTabSwitch }: Props) {
  const [waItem, setWaItem]       = useState<ActionItem | null>(null);
  const [expanded, setExpanded]   = useState<BlockKey | null>(null);
  const [aiResult, setAiResult]   = useState<GPTResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState('');
  const [aiCalled, setAiCalled]   = useState(false);

  // Use pre-filtered followupTasks when available (= dashboardStats.todayFollowups).
  // Fall back to full task list filtered for active status only (standalone use).
  const baseActiveTasks = tasks.filter(t => t.status !== 'deleted' && t.status !== 'archived');
  const activeTasks = followupTasks
    ? followupTasks.filter(t => t.status !== 'deleted' && t.status !== 'archived')
    : baseActiveTasks.filter(t => (t as any).notionSource !== 'contact_only');

  const urgent          = buildUrgent(activeTasks);
  const urgentIds       = new Set(urgent.map(a => a.id));
  const waitingClient   = buildWaitingClient(activeTasks, urgentIds);
  const waitingSupplier = buildWaitingSupplier(activeTasks);
  const supplierIds     = new Set(waitingSupplier.map(a => a.id));
  const clientIds       = new Set(waitingClient.map(a => a.id));
  const others          = buildOthers(activeTasks, urgentIds, supplierIds, clientIds);

  // Paused: use pre-computed prop (when followupTasks excludes 暂缓), else build from baseActiveTasks
  const pausedItems     = pausedTasks ? buildPaused(pausedTasks) : buildPaused(baseActiveTasks);

  // Rule suggestions use all base tasks for context (projects etc.)
  const ruleSuggestions = buildRuleSuggestions(baseActiveTasks, projects, urgent, waitingClient, waitingSupplier);

  const callGPT = async () => {
    setAiLoading(true); setAiError('');
    try {
      const res = await fetch('/api/crm/ai-action-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGPTPayload(tasks, projects)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setAiResult(await res.json());
    } catch (e: any) {
      setAiError(e.message || 'AI 分析失败');
    } finally { setAiLoading(false); }
  };

  useEffect(() => {
    if (!aiCalled && activeTasks.length > 0) { setAiCalled(true); callGPT(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks.length]);

  const handleOpen = (item: ActionItem) => {
    if (item.task) { onSelectTask(item.task); return; }
    onTabSwitch('project');
  };

  // ── Compact preview data ──────────────────────────────────────────────────

  const urgentLines = urgent.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0 ? `逾期 ${a.daysOverdue} 天` : '今日到期',
    urgent: true,
  }));

  const clientLines = waitingClient.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0 ? `等 ${a.daysOverdue} 天` : a.tradeStatus,
    urgent: a.daysOverdue >= 5,
  }));

  const supplierLines = waitingSupplier.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0 ? `等 ${a.daysOverdue} 天` : '待报价',
    urgent: false,
  }));

  const pausedLines = pausedItems.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0 ? `暂缓 ${a.daysOverdue} 天` : '暂缓中',
    urgent: false,
  }));

  const othersLines = others.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0 ? `逾期 ${a.daysOverdue} 天` : a.tradeStatus,
    urgent: a.daysOverdue > 0,
  }));

  // ── Modal configs ────────────────────────────────────────────────────────

  const MODAL_CONFIGS: Record<BlockKey, ModalConfig> = {
    urgent:   { key: 'urgent',   dot: '#EF4444', icon: <AlertTriangle className="w-3.5 h-3.5" />, title: '今日必须推进',         badge: <RuleEngineBadge /> },
    supplier: { key: 'supplier', dot: '#EAB308', icon: <PackageSearch className="w-3.5 h-3.5" />, title: '待报价 · 等供应商回价', badge: <RuleEngineBadge /> },
    client:   { key: 'client',   dot: '#F97316', icon: <Clock className="w-3.5 h-3.5" />,         title: '已报价待确认',         badge: <RuleEngineBadge /> },
    paused:   { key: 'paused',   dot: '#94A3B8', icon: <PauseCircle className="w-3.5 h-3.5" />,   title: '暂缓中',               badge: <RuleEngineBadge /> },
    others:   { key: 'others',   dot: '#6366F1', icon: <Sparkles className="w-3.5 h-3.5" />,      title: '新询盘 · 其他',        badge: <RuleEngineBadge /> },
    ai:       { key: 'ai',       dot: GOLD,       icon: <Bot className="w-3.5 h-3.5" />,           title: 'OpenAI 智能建议' },
  };

  return (
    <>
      {waItem && <WAModal item={waItem} onClose={() => setWaItem(null)} />}

      {/* Expanded modal */}
      {expanded && (
        <ExpandedModal config={MODAL_CONFIGS[expanded]} onClose={() => setExpanded(null)}>
          {expanded === 'urgent' && (
            urgent.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">今日暂无必须推进事项</p>
              : urgent.map(item => (
                  <ActionCard key={item.id} item={item} accentColor="#EF4444" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'client' && (
            waitingClient.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">暂无等待客户回复的报价</p>
              : waitingClient.map(item => (
                  <ActionCard key={item.id} item={item} accentColor="#F97316" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'supplier' && (
            waitingSupplier.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">暂无等待供应商报价</p>
              : waitingSupplier.map(item => (
                  <ActionCard key={item.id} item={item} accentColor="#EAB308" onOpen={handleOpen} />
                ))
          )}
          {expanded === 'paused' && (
            pausedItems.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">暂无暂缓中记录</p>
              : pausedItems.map(item => (
                  <ActionCard key={item.id} item={item} accentColor="#94A3B8" onOpen={handleOpen} />
                ))
          )}
          {expanded === 'others' && (
            others.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">暂无其他待跟进记录</p>
              : others.map(item => (
                  <ActionCard key={item.id} item={item} accentColor="#6366F1" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'ai' && (
            aiLoading ? (
              <div className="flex items-center justify-center gap-3 py-12">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: GOLD }} />
                <span className="text-sm font-bold text-slate-400">GPT-4o 正在分析您的业务数据…</span>
              </div>
            ) : aiError ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-black text-red-700">GPT-4o 连接失败，显示规则引擎分析</p>
                    <p className="text-[10px] text-red-400 mt-0.5">{aiError}</p>
                  </div>
                </div>
                {ruleSuggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-amber-100">
                    <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
                    <p className="text-sm font-bold leading-relaxed" style={{ color: NAVY }}>{s}</p>
                  </div>
                ))}
              </div>
            ) : aiResult ? (
              <div className="space-y-3">
                {aiResult.overallInsight && (
                  <div className="rounded-xl p-4 border" style={{ borderColor: GOLD + '30', backgroundColor: GOLD + '08' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>整体洞察</span>
                      {aiResult.priorityFocus && (
                        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: NAVY + '10', color: NAVY }}>
                          重点: {aiResult.priorityFocus}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold leading-relaxed" style={{ color: NAVY }}>
                      {aiResult.overallInsight}
                    </p>
                  </div>
                )}
                {(aiResult.actions || []).map((action, i) => (
                  <GPTActionCard key={i} action={action} index={i} />
                ))}
                <div className="pt-2 text-[9px] font-bold text-slate-300 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  AI辅助建议，请以实际业务判断为准
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Bot className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-bold text-slate-400">等待数据加载后自动分析…</p>
              </div>
            )
          )}
        </ExpandedModal>
      )}

      {/* ── CEO Dashboard: 5 compact cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card 1 — 今日必须推进 */}
        <SummaryCard
          dot="#EF4444" icon={<AlertTriangle className="w-3.5 h-3.5" />}
          title="今日必须推进" count={urgent.length}
          badge={<RuleEngineBadge />}
          previewLines={urgentLines} emptyText="今日暂无必须推进事项"
          accentBorder="#EF444430"
          onExpand={() => setExpanded('urgent')}
        />

        {/* Card 2 — 待报价 */}
        <SummaryCard
          dot="#EAB308" icon={<PackageSearch className="w-3.5 h-3.5" />}
          title="待报价 · 等供应商回价" count={waitingSupplier.length}
          badge={<RuleEngineBadge />}
          previewLines={supplierLines} emptyText="暂无等待供应商报价"
          accentBorder="#EAB30830"
          onExpand={() => setExpanded('supplier')}
        />

        {/* Card 3 — 已报价待确认 */}
        <SummaryCard
          dot="#F97316" icon={<Clock className="w-3.5 h-3.5" />}
          title="已报价待确认" count={waitingClient.length}
          badge={<RuleEngineBadge />}
          previewLines={clientLines} emptyText="暂无等待客户确认的报价"
          accentBorder="#F9731630"
          onExpand={() => setExpanded('client')}
        />

        {/* Card 4 — 暂缓中 */}
        <SummaryCard
          dot="#94A3B8" icon={<PauseCircle className="w-3.5 h-3.5" />}
          title="暂缓中" count={pausedItems.length}
          badge={<RuleEngineBadge />}
          previewLines={pausedLines} emptyText="暂无暂缓记录"
          accentBorder="#94A3B830"
          onExpand={() => setExpanded('paused')}
        />

        {/* Card 5 — 新询盘 · 其他 */}
        <SummaryCard
          dot="#6366F1" icon={<Sparkles className="w-3.5 h-3.5" />}
          title="新询盘 · 其他" count={others.length}
          badge={<RuleEngineBadge />}
          previewLines={othersLines} emptyText="今日暂无其他待跟进"
          accentBorder="#6366F130"
          onExpand={() => setExpanded('others')}
        />

        {/* Card 6 — AI, spans full width */}
        <div className="md:col-span-2">
          <AISummaryCard
            aiLoading={aiLoading} aiError={aiError}
            aiResult={aiResult} ruleSuggestions={ruleSuggestions}
            onExpand={() => setExpanded('ai')}
            onRefresh={callGPT}
          />
        </div>

      </div>
    </>
  );
}
