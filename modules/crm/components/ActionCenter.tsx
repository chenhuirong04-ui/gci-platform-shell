import React, { useState } from 'react';
import {
  Brain, AlertTriangle, Clock, MessageSquare,
  Copy, Check, RefreshCw, X, Zap, Sparkles,
  PackageSearch, Lightbulb, ChevronRight, Tag,
  Bot, Shield, Cpu, PauseCircle,
} from 'lucide-react';
import { colors, statusMap, type StatusKey, Card, Badge, SectionHeader } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { FollowUpTask, Project } from '../types';
import { getTaskBusinessId } from '../utils/businessId';
import { GoogleGenAI } from '@google/genai';

// All colors in this file now resolve through the design-system's centralized
// statusMap/colors — no raw hex for status semantics. The 5 action-priority
// categories below map to StatusKey entries added for ActionCenter specifically
// (see packages/design-system/src/tokens.ts).
const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

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

// Display-layer mapping for the raw tradeStatus enum value (Notion 行动状态).
// Never changes the stored/filtered value — only what's shown to the user.
// Unmapped/unknown statuses fall back to the raw stored value.
const TRADE_STATUS_LABEL_EN: Record<string, string> = {
  '新询盘': 'New Inquiry',
  '需求整理中': 'Requirements in Progress',
  '待报价': 'Pending Quotation',
  '已报价待确认': 'Quoted, Awaiting Confirmation',
  '合同待签': 'Contract Pending Signature',
  '执行中': 'In Progress',
  '已交付': 'Delivered',
  '暂缓': 'Paused',
  '已成交': 'Closed Won',
  '已归档': 'Archived',
};
function tradeStatusLabel(status: string, lang: 'zh' | 'en'): string {
  if (lang === 'zh') return status;
  return TRADE_STATUS_LABEL_EN[status] ?? status;
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

function buildUrgent(tasks: FollowUpTask[], lang: 'zh' | 'en'): ActionItem[] {
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

      const problem = lang === 'zh'
        ? (isInternal ? '需求整理中，内部方案/BOQ 尚未完成，阻碍报价进度'
          : isQuoteOverdue ? `报价已发 ${od} 天，客户尚未回复`
          : od > 0 ? `A 级客户，跟进计划逾期 ${od} 天`
          : 'A 级客户，今日到期')
        : (isInternal ? 'Requirements in progress — internal proposal/BOQ not yet finished, blocking the quotation'
          : isQuoteOverdue ? `Quote sent ${od} day${od !== 1 ? 's' : ''} ago, no client reply yet`
          : od > 0 ? `Grade A client, follow-up overdue by ${od} day${od !== 1 ? 's' : ''}`
          : 'Grade A client, due today');

      const suggestion = lang === 'zh'
        ? (isInternal ? '今日内完成需求整理，推进 BOQ/RFQ 生成'
          : isQuoteOverdue && od >= 5 ? '立即发 WhatsApp，询问客户决策进度'
          : isQuoteOverdue ? '主动跟进，确认客户是否收到并已阅报价'
          : t.suggestedAction || 'A 级客户，今日必须完成联系')
        : (isInternal ? 'Finish requirements today, move BOQ/RFQ generation forward'
          : isQuoteOverdue && od >= 5 ? 'Send a WhatsApp message immediately to ask about the client\'s decision progress'
          : isQuoteOverdue ? 'Follow up proactively — confirm the client received and reviewed the quote'
          : t.suggestedAction || 'Grade A client — must make contact today');

      const reasons = lang === 'zh'
        ? [tradeStatusLabel(t.tradeStatus, lang), t.priority === 'A' ? 'A级' : '', od > 0 ? `逾期${od}天` : '今日到期'].filter(Boolean)
        : [tradeStatusLabel(t.tradeStatus, lang), t.priority === 'A' ? 'Grade A' : '', od > 0 ? `${od} day${od !== 1 ? 's' : ''} overdue` : 'Due today'].filter(Boolean);

      return {
        id: t.id, clientName: t.clientName, problem, suggestion,
        matchReason: (lang === 'zh' ? '状态: ' : 'Status: ') + reasons.join(' · '),
        daysOverdue: od, tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    });
}

// ── Block 2: 等待客户审批/确认 + 合同待签 ───────────────────────────────────
// Rules: tradeStatus === '已报价待确认' (not yet escalated to urgent)
//        OR tradeStatus === '合同待签' — client confirmed, waiting for signed contract

function buildWaitingClient(tasks: FollowUpTask[], urgentIds: Set<string>, lang: 'zh' | 'en'): ActionItem[] {
  const CONTRACT_PENDING = '合同待签';
  return tasks
    .filter(t =>
      t.status === 'todo' &&
      !urgentIds.has(t.id) &&
      (t.tradeStatus === QUOTED_WAITING || t.tradeStatus === CONTRACT_PENDING)
    )
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      const isContract = t.tradeStatus === CONTRACT_PENDING;
      const problem = lang === 'zh'
        ? (isContract
          ? (od > 0 ? `合同待签，已等 ${od} 天，需催促客户签约` : '客户确认合作，等待签署合同')
          : (od > 0 ? `等待客户/业主确认，已等 ${od} 天` : '等待客户/业主确认'))
        : (isContract
          ? (od > 0 ? `Contract pending signature, waiting ${od} day${od !== 1 ? 's' : ''} — needs a nudge` : 'Client confirmed the deal, waiting for signed contract')
          : (od > 0 ? `Waiting for client/owner confirmation, ${od} day${od !== 1 ? 's' : ''} so far` : 'Waiting for client/owner confirmation'));
      const suggestion = lang === 'zh'
        ? (isContract
          ? (od >= 5 ? '立即跟进，确认合同状态，必要时发提醒或推动签约会议'
            : od >= 2 ? '主动催促，询问合同审批进度，提供任何所需文件'
            : '保持跟进，确认客户是否已收到合同并开始审核')
          : (od >= 5 ? '立即跟进，询问审批进展，提供补充资料支持'
            : od >= 2 ? '主动催促，提供进一步支持或备选方案'
            : '保持跟进，等待客户内部决策'))
        : (isContract
          ? (od >= 5 ? 'Follow up immediately — confirm contract status, send a reminder or push for a signing call if needed'
            : od >= 2 ? 'Proactively nudge — ask about contract approval progress, provide any documents needed'
            : 'Keep following up — confirm the client received the contract and started reviewing it')
          : (od >= 5 ? 'Follow up immediately — ask about approval progress, provide supporting materials'
            : od >= 2 ? 'Proactively nudge — offer further support or alternatives'
            : 'Keep following up — waiting on the client\'s internal decision'));
      const matchReason = lang === 'zh'
        ? `状态: ${tradeStatusLabel(t.tradeStatus, lang)}${od > 0 ? ` · 已等${od}天` : ''}`
        : `Status: ${tradeStatusLabel(t.tradeStatus, lang)}${od > 0 ? ` · waiting ${od} day${od !== 1 ? 's' : ''}` : ''}`;
      return {
        id: t.id, clientName: t.clientName, problem, suggestion, matchReason,
        daysOverdue: Math.max(0, od), tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Block 3: 等供应商报价/确认 ────────────────────────────────────────────────
// Rule: tradeStatus === '待报价'

function buildWaitingSupplier(tasks: FollowUpTask[], lang: 'zh' | 'en'): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && t.tradeStatus === '待报价')
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      const problem = lang === 'zh'
        ? (od > 0 ? `正在寻价/等供应商报价，已等 ${od} 天` : '正在寻价/等供应商报价')
        : (od > 0 ? `Sourcing / waiting on supplier quote, ${od} day${od !== 1 ? 's' : ''} so far` : 'Sourcing / waiting on supplier quote');
      const suggestion = lang === 'zh'
        ? (od >= 3 ? '今日催促供应商，确认报价时间，同步反馈给客户' : '跟进供应商进度，预估报价到位时间')
        : (od >= 3 ? 'Nudge the supplier today, confirm the quote timing, and update the client' : 'Follow up on supplier progress, estimate when the quote will be ready');
      const matchReason = lang === 'zh'
        ? `状态: 待报价${od > 0 ? ` · 已等${od}天` : ''}`
        : `Status: Pending Quotation${od > 0 ? ` · waiting ${od} day${od !== 1 ? 's' : ''}` : ''}`;
      return {
        id: t.id, clientName: t.clientName, problem, suggestion, matchReason,
        daysOverdue: Math.max(0, od), tradeStatus: t.tradeStatus, task: t, source: 'task' as const,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8);
}

// ── Block 4: 暂缓中 ───────────────────────────────────────────────────────────
// Rule: tradeStatus === '暂缓'

function buildPaused(tasks: FollowUpTask[], lang: 'zh' | 'en'): ActionItem[] {
  return tasks
    .filter(t => t.status === 'todo' && t.tradeStatus === '暂缓')
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      const problem = lang === 'zh'
        ? (od > 0 ? `已暂缓，跟进计划已过期 ${od} 天` : '当前处于暂缓状态')
        : (od > 0 ? `Paused — follow-up plan expired ${od} day${od !== 1 ? 's' : ''} ago` : 'Currently paused');
      const suggestion = lang === 'zh'
        ? (od > 7 ? '建议评估是否重新激活此客户' : '按既定计划维持暂缓，等待合适时机')
        : (od > 7 ? 'Consider re-evaluating whether to reactivate this client' : 'Keep paused as planned, wait for the right timing');
      const matchReason = lang === 'zh'
        ? `状态: 暂缓${od > 0 ? ` · 已过期${od}天` : ''}`
        : `Status: Paused${od > 0 ? ` · expired ${od} day${od !== 1 ? 's' : ''} ago` : ''}`;
      return {
        id: t.id, clientName: t.clientName, problem, suggestion, matchReason,
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
  lang: 'zh' | 'en',
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
    suggestions.push(lang === 'zh'
      ? `${internalCount} 条处于"需求整理中"—— 内部方案未完成，会直接阻碍报价进度`
      : `${internalCount} record${internalCount !== 1 ? 's' : ''} in "Requirements in Progress" — unfinished internal proposals will directly block quotations`);
  if (aCount > 0 && urgentA > 0)
    suggestions.push(lang === 'zh'
      ? `${aCount} 条 A 级客户中有 ${urgentA} 条已逾期 —— 建议今日优先处理`
      : `${urgentA} of ${aCount} Grade A clients are overdue — recommend prioritizing them today`);
  if (quotedOld > 0)
    suggestions.push(lang === 'zh'
      ? `${quotedOld} 条报价已发出 5 天以上无回复 —— 主动催促可显著提升成交率`
      : `${quotedOld} quotation${quotedOld !== 1 ? 's' : ''} sent 5+ days ago with no reply — a proactive nudge can meaningfully lift close rates`);
  if (waitingSupplier.length >= 2)
    suggestions.push(lang === 'zh'
      ? `${waitingSupplier.length} 条在等供应商报价 —— 建议集中催报价，再统一回复客户`
      : `${waitingSupplier.length} records waiting on supplier quotes — recommend batching supplier follow-ups, then responding to clients together`);
  if (waitingClient.length >= 3)
    suggestions.push(lang === 'zh'
      ? `${waitingClient.length} 条在等客户/业主确认 —— 可用 WhatsApp 模板批量催促`
      : `${waitingClient.length} records waiting on client/owner confirmation — a WhatsApp template can help batch-nudge them`);
  if (projCount > 3 && projCount > tradeCount)
    suggestions.push(lang === 'zh'
      ? `项目型（${projCount}）> 贸易型（${tradeCount}）—— 建议集中推进工程 BOQ 和 FF&E 报价`
      : `Project-Based (${projCount}) > Trading (${tradeCount}) — recommend focusing on engineering BOQ and FF&E quotations`);
  if (suggestions.length === 0)
    return [lang === 'zh' ? '当前暂无明显异常，建议按高优先级客户顺序跟进。' : 'No notable issues right now — recommend following up by client priority order.'];
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
              <div className="text-[13px] text-slate-400">{item.clientName} · {item.tradeStatus}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="rounded-xl p-3 bg-slate-50 text-[13px] font-bold text-slate-500 space-y-0.5">
          <div>问题：<span className="text-slate-700">{item.problem}</span></div>
          <div>建议：<span className="text-slate-700">{item.suggestion}</span></div>
        </div>
        {draft ? (
          <textarea
            className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#CBA85C]/40"
            style={{ minHeight: '110px' }}
            value={draft} onChange={e => setDraft(e.target.value)}
          />
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-[13px] font-bold text-slate-400">
            点击生成，AI 将根据当前卡点和阶段起草消息
          </div>
        )}
        {error && (
          <div className="rounded-lg p-2.5 text-[13px] font-bold" style={{ backgroundColor: statusMap.urgent.bg, color: statusMap.urgent.color }}>
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={generate} disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-black text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: NAVY }}>
            {loading
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 生成中...</>
              : <><Brain className="w-3.5 h-3.5" /> {draft ? '重新生成' : 'AI 生成草稿'}</>}
          </button>
          {draft && (
            <button onClick={copy}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-black border-2 hover:bg-[#CBA85C]/10"
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

// ── Rule Engine Badge — now a thin wrapper around the shared Badge, using
//    the neutral status color (purple is retired per the V2 UI baseline)
//    instead of a hardcoded #6366F1. ───────────────────────────────────────────

function RuleEngineBadge() {
  const { dict } = useI18n();
  return (
    <Badge
      color={colors.statusNeutral}
      bg="rgba(148,163,184,0.16)"
      icon={<Cpu className="w-2.5 h-2.5" />}
      label={dict.crm.actionCenter.ruleEngineBadge}
      className="rounded-lg"
    />
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ item, status, onWA, onOpen }: {
  item: ActionItem; status: StatusKey;
  onWA?: (item: ActionItem) => void;
  onOpen?: (item: ActionItem) => void;
}) {
  const { dict, lang } = useI18n();
  const at = dict.crm.actionCenter;
  const accentColor = statusMap[status].color;
  const bizId = item.task ? getTaskBusinessId(item.task.id) : '';
  const waitingLabel = lang === 'zh' ? `已等 ${item.daysOverdue} 天` : `Waiting ${item.daysOverdue} day${item.daysOverdue !== 1 ? 's' : ''}`;
  return (
    <Card tone="light" className="flex gap-3 p-3.5 hover:border-slate-200 transition-colors">
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && <Badge color={NAVY} bg={NAVY + '10'} label={bizId} className="rounded flex-shrink-0" />}
            <span className="text-sm font-black truncate" style={{ color: NAVY }}>{item.clientName}</span>
          </div>
          {item.daysOverdue > 0 && (
            <Badge color={accentColor} bg={statusMap[status].bg} label={waitingLabel} className="rounded-full flex-shrink-0" />
          )}
        </div>
        <p className="text-[13px] text-slate-500 leading-relaxed">{item.problem}</p>
        <p className="text-[13px] font-bold mt-1 flex items-start gap-1" style={{ color: NAVY }}>
          <Zap className="w-2.5 h-2.5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          {item.suggestion}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          <Tag className="w-2.5 h-2.5 flex-shrink-0 text-slate-300" />
          <span className="text-[12px] font-bold text-slate-400">{item.matchReason}</span>
        </div>
        {(onWA || onOpen) && (
          <div className="flex gap-1.5 mt-2">
            {onWA && item.source === 'task' && item.task && (
              <button onClick={() => onWA(item)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] font-black text-white"
                style={{ backgroundColor: NAVY }}>
                <MessageSquare className="w-2.5 h-2.5" /> {at.generateWaMessage}
              </button>
            )}
            {onOpen && (
              <button onClick={() => onOpen(item)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] font-black border"
                style={{ borderColor: NAVY + '30', color: NAVY }}>
                {at.openDetails} <ChevronRight className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp, onOpen }: { opp: NewOpportunity; onOpen: (t: FollowUpTask) => void }) {
  const typeColor = opp.suggestedType === '项目型' ? colors.statusInfo : opp.suggestedType === '贸易型' ? GOLD : colors.statusSuccess;
  const bizId = getTaskBusinessId(opp.task.id);
  return (
    <Card tone="light" className="flex gap-3 p-3.5">
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: colors.statusSuccess }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && <Badge color={NAVY} bg={NAVY + '10'} label={bizId} className="rounded flex-shrink-0" />}
            <span className="text-sm font-black truncate" style={{ color: NAVY }}>{opp.clientName}</span>
          </div>
          <Badge color={typeColor} bg={typeColor + '18'} label={`建议: ${opp.suggestedType}`} className="rounded-full flex-shrink-0" />
        </div>
        <p className="text-[13px] text-slate-500">状态: {opp.tradeStatus}  ·  今日录入</p>
        <div className="flex items-center gap-1 mt-1.5">
          <Tag className="w-2.5 h-2.5 flex-shrink-0 text-slate-300" />
          <span className="text-[12px] font-bold text-slate-400">{opp.matchReason}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => onOpen(opp.task)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] font-black border"
            style={{ borderColor: NAVY + '30', color: NAVY }}>
            打开详情 <ChevronRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── GPT Action Card ───────────────────────────────────────────────────────────

function GPTActionCard({ action, index }: { action: GPTAction; index: number }) {
  const { dict } = useI18n();
  const at = dict.crm.actionCenter;
  const [copied, setCopied] = useState(false);
  const [showWA, setShowWA] = useState(false);

  const copyWA = async () => {
    await navigator.clipboard.writeText(action.waTemplate);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const rankColor = index === 0 ? colors.statusDanger : index === 1 ? colors.statusWarning : GOLD;

  return (
    <Card tone="light" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-50"
        style={{ backgroundColor: rankColor + '08' }}>
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
          style={{ backgroundColor: rankColor }}>
          {index + 1}
        </div>
        <span className="text-sm font-black flex-1" style={{ color: NAVY }}>{action.title}</span>
        {!action.worthInvesting && (
          <Badge color="#64748B" bg="#F1F5F9" label={at.lowPriorityBadge} />
        )}
      </div>
      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{at.customerLabel} · </span>
          <span className="text-[13px] font-black" style={{ color: NAVY }}>{action.clientName}</span>
        </div>
        <div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{at.reasonAnalysisLabel}</div>
          <p className="text-[13px] text-slate-600 leading-relaxed">{action.reason}</p>
        </div>
        <div className="flex items-start gap-1.5 rounded-lg p-2.5" style={{ backgroundColor: statusMap.urgent.bg }}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: statusMap.urgent.color }} />
          <p className="text-[13px] font-bold leading-relaxed" style={{ color: statusMap.urgent.color }}>{action.risk}</p>
        </div>
        <div className="flex items-start gap-1.5">
          <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          <p className="text-[13px] font-bold leading-relaxed" style={{ color: NAVY }}>{action.commStyle}</p>
        </div>
        {/* WA Template */}
        {action.waTemplate && (
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-1">
                <MessageSquare className="w-2.5 h-2.5 text-slate-400" />
                <span className="text-[9px] font-black text-slate-400 uppercase">{at.whatsappTemplateLabel}</span>
              </div>
              <button onClick={() => setShowWA(v => !v)}
                className="text-[13px] font-black" style={{ color: GOLD }}>
                {showWA ? at.collapse : at.expand}
              </button>
            </div>
            {showWA && (
              <div className="px-3 py-2.5">
                <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">
                  {action.waTemplate}
                </p>
                <button onClick={copyWA}
                  className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] font-black border"
                  style={{ borderColor: GOLD + '60', color: GOLD }}>
                  {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                  {copied ? at.copied : at.copyText}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Block 4b: 新询盘 · 其他 (catch-all) ──────────────────────────────────────
// Rule: everything in todayFollowups not claimed by urgent / supplier / client

function buildOthers(
  tasks: FollowUpTask[],
  urgentIds: Set<string>,
  supplierIds: Set<string>,
  clientIds: Set<string>,
  lang: 'zh' | 'en',
): ActionItem[] {
  const claimedIds = new Set([...urgentIds, ...supplierIds, ...clientIds]);
  return tasks
    .filter(t => t.status === 'todo' && !DONE_STATUSES.includes(t.tradeStatus) && !claimedIds.has(t.id))
    .map(t => {
      const od = calcDaysOverdue(t.nextFollowUpAt);
      const statusLabel = tradeStatusLabel(t.tradeStatus, lang);
      const problem = lang === 'zh'
        ? (od > 0 ? `状态: ${statusLabel}，跟进计划逾期 ${od} 天` : od === 0 ? `状态: ${statusLabel}，今日跟进` : `状态: ${statusLabel}`)
        : (od > 0 ? `Status: ${statusLabel}, follow-up overdue by ${od} day${od !== 1 ? 's' : ''}` : od === 0 ? `Status: ${statusLabel}, due today` : `Status: ${statusLabel}`);
      const suggestion = lang === 'zh'
        ? (t.suggestedAction || '按计划推进，记录最新跟进情况')
        : (t.suggestedAction || 'Proceed as planned, log the latest follow-up status');
      const matchReason = lang === 'zh'
        ? `状态: ${statusLabel}${t.priority ? ` · ${t.priority}级` : ''}`
        : `Status: ${statusLabel}${t.priority ? ` · Grade ${t.priority}` : ''}`;
      return {
        id: t.id,
        clientName: t.clientName,
        problem, suggestion, matchReason,
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
  status: StatusKey;
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
          <SectionHeader status={config.status} icon={config.icon} title={config.title} trailing={config.badge} />
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

// ── Dark card tokens ──────────────────────────────────────────────────────────
const DARK_CARD_BG   = '#0E1A2E';
const DARK_BORDER    = 'rgba(255,255,255,0.08)';
const LIGHT_TEXT     = '#F7F1E3';
const MUTED_LIGHT    = '#9AA8BC';
const GOLD_ACCENT    = '#C7A24A';

// ── Compact Summary Card (CEO dashboard view) ─────────────────────────────────
// Returns null when count === 0 — empty cards do not render at all.

function SummaryCard({
  status, icon, title, count, badge,
  previewLines,
  onExpand,
}: {
  status: StatusKey;
  icon: React.ReactNode;
  title: string;
  count: number;
  badge?: React.ReactNode;
  previewLines: { id: string; label: string; meta: string; urgent?: boolean }[];
  emptyText: string;
  onExpand: () => void;
}) {
  const { lang } = useI18n();

  // Hide empty cards entirely — no large blank space
  if (count === 0) return null;

  const s = statusMap[status];
  const accentColor = status === 'urgent' ? '#E07A5F' : s.color;

  return (
    <div
      className="flex flex-col gap-2.5 relative overflow-hidden rounded-xl cursor-pointer select-none"
      style={{
        background: DARK_CARD_BG,
        border: `1px solid ${DARK_BORDER}`,
        padding: '14px 16px 12px 20px',
      }}
      onClick={onExpand}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 rounded-l-xl" style={{ width: 3, background: accentColor }} />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ color: accentColor }}>{icon}</div>
          <span className="text-[13px] font-black" style={{ color: LIGHT_TEXT }}>{title}</span>
          {badge}
        </div>
        <span
          className="text-[12px] font-black rounded-md px-2 py-0.5"
          style={{ background: accentColor + '22', color: accentColor }}>
          {count}
        </span>
      </div>

      {/* Preview lines — compact, no fixed min-height */}
      <div className="space-y-1.5">
        {previewLines.slice(0, 2).map(line => (
          <div key={line.id} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
            <span className="text-[13px] font-bold truncate flex-1" style={{ color: LIGHT_TEXT }}>{line.label}</span>
            <span className="text-[12px] font-bold flex-shrink-0"
              style={{ color: line.urgent ? '#E07A5F' : MUTED_LIGHT }}>
              {line.meta}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <button
        onClick={e => { e.stopPropagation(); onExpand(); }}
        className="flex items-center gap-1 text-[12px] font-bold transition-opacity hover:opacity-70 mt-0.5"
        style={{ color: accentColor }}>
        {lang === 'zh' ? `查看全部 ${count} 条` : `View all ${count}`}
        <ChevronRight className="w-3 h-3" />
      </button>
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
  const { dict, lang } = useI18n();
  const at = dict.crm.actionCenter;
  const hasRun = aiLoading || !!aiError || !!aiResult;
  const suggestions = aiResult
    ? (aiResult.actions || []).slice(0, 3).map(a => a.title || a.reason).filter(Boolean)
    : aiError
    ? ruleSuggestions.slice(0, 3)
    : [];

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        background: '#0D1B2E',
        border: `1px solid ${DARK_BORDER}`,
        padding: '14px 16px 14px 20px',
      }}
    >
      {/* Gold left bar */}
      <div className="absolute left-0 top-0 bottom-0 rounded-l-xl" style={{ width: 3, background: GOLD_ACCENT }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5" style={{ color: GOLD_ACCENT }} />
          <span className="text-[13px] font-black" style={{ color: LIGHT_TEXT }}>{at.openaiSuggestionsTitle}</span>
          {!aiLoading && !aiError && aiResult && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(212,168,67,0.15)', color: GOLD_ACCENT }}>{at.aiDraftBadge}</span>
          )}
          {aiError && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(148,163,184,0.15)', color: MUTED_LIGHT }}>{at.ruleEngineBadge}</span>
          )}
        </div>
        <button onClick={e => { e.stopPropagation(); onRefresh(); }} disabled={aiLoading}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-bold disabled:opacity-40 transition-colors"
          style={{ border: `1px solid ${hasRun ? DARK_BORDER : GOLD_ACCENT + '60'}`, color: hasRun ? MUTED_LIGHT : GOLD_ACCENT }}>
          <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
          {aiLoading ? at.analyzing : hasRun ? at.refreshSuggestions : at.generateSuggestions}
        </button>
      </div>

      {/* Content */}
      {aiLoading && (
        <div className="flex items-center gap-2 py-1">
          <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: GOLD_ACCENT }} />
          <span className="text-[13px] font-bold" style={{ color: MUTED_LIGHT }}>{at.gptAnalyzing}</span>
        </div>
      )}

      {!aiLoading && suggestions.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: GOLD_ACCENT }} />
              <p className="text-[13px] leading-relaxed line-clamp-1" style={{ color: LIGHT_TEXT }}>{s}</p>
            </div>
          ))}
        </div>
      )}

      {!aiLoading && suggestions.length === 0 && (
        <p className="text-[13px] py-1" style={{ color: MUTED_LIGHT }}>{hasRun ? at.noMoreSuggestions : at.notGeneratedHint}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        {(aiResult || aiError) && !aiLoading ? (
          <button onClick={onExpand}
            className="flex items-center gap-1 text-[12px] font-bold hover:opacity-70 transition-opacity"
            style={{ color: GOLD_ACCENT }}>
            {aiResult
              ? (lang === 'zh' ? `查看全部 ${(aiResult.actions || []).length} 条建议` : `View all ${(aiResult.actions || []).length} suggestions`)
              : (lang === 'zh' ? '查看规则分析' : 'View rule-based analysis')}
            <ChevronRight className="w-3 h-3" />
          </button>
        ) : <div />}
        <div className="text-[11px] font-bold flex items-center gap-1" style={{ color: MUTED_LIGHT }}>
          <Shield className="w-2.5 h-2.5" />
          {at.aiDisclaimer}
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
  const { dict, lang } = useI18n();
  const at = dict.crm.actionCenter;
  const [waItem, setWaItem]       = useState<ActionItem | null>(null);
  const [expanded, setExpanded]   = useState<BlockKey | null>(null);
  const [aiResult, setAiResult]   = useState<GPTResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState('');

  // Use pre-filtered followupTasks when available (= dashboardStats.todayFollowups).
  // Fall back to full task list filtered for active status only (standalone use).
  const baseActiveTasks = tasks.filter(t => t.status !== 'deleted' && t.status !== 'archived');
  const activeTasks = followupTasks
    ? followupTasks.filter(t => t.status !== 'deleted' && t.status !== 'archived')
    : baseActiveTasks.filter(t => (t as any).notionSource !== 'contact_only');

  const urgent          = buildUrgent(activeTasks, lang);
  const urgentIds       = new Set(urgent.map(a => a.id));
  const waitingClient   = buildWaitingClient(activeTasks, urgentIds, lang);
  const waitingSupplier = buildWaitingSupplier(activeTasks, lang);
  const supplierIds     = new Set(waitingSupplier.map(a => a.id));
  const clientIds       = new Set(waitingClient.map(a => a.id));
  const others          = buildOthers(activeTasks, urgentIds, supplierIds, clientIds, lang);

  // Paused: use pre-computed prop (when followupTasks excludes 暂缓), else build from baseActiveTasks
  const pausedItems     = pausedTasks ? buildPaused(pausedTasks, lang) : buildPaused(baseActiveTasks, lang);

  // Rule suggestions use all base tasks for context (projects etc.)
  const ruleSuggestions = buildRuleSuggestions(baseActiveTasks, projects, urgent, waitingClient, waitingSupplier, lang);

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
      setAiError(e.message || (lang === 'zh' ? 'AI 分析失败' : 'AI analysis failed'));
    } finally { setAiLoading(false); }
  };

  // AI suggestions are opt-in only — no auto-call on mount. User must click
  // "Generate AI Suggestions" (AISummaryCard) to trigger callGPT().

  const handleOpen = (item: ActionItem) => {
    if (item.task) { onSelectTask(item.task); return; }
    onTabSwitch('project');
  };

  // ── Compact preview data ──────────────────────────────────────────────────

  const urgentLines = urgent.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0
      ? (lang === 'zh' ? `逾期 ${a.daysOverdue} 天` : `${a.daysOverdue} day${a.daysOverdue !== 1 ? 's' : ''} overdue`)
      : (lang === 'zh' ? '今日到期' : 'Due today'),
    urgent: true,
  }));

  const clientLines = waitingClient.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0
      ? (lang === 'zh' ? `等 ${a.daysOverdue} 天` : `Waiting ${a.daysOverdue} day${a.daysOverdue !== 1 ? 's' : ''}`)
      : tradeStatusLabel(a.tradeStatus, lang),
    urgent: a.daysOverdue >= 5,
  }));

  const supplierLines = waitingSupplier.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0
      ? (lang === 'zh' ? `等 ${a.daysOverdue} 天` : `Waiting ${a.daysOverdue} day${a.daysOverdue !== 1 ? 's' : ''}`)
      : tradeStatusLabel(a.tradeStatus, lang),
    urgent: false,
  }));

  const pausedLines = pausedItems.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0
      ? (lang === 'zh' ? `暂缓 ${a.daysOverdue} 天` : `Paused ${a.daysOverdue} day${a.daysOverdue !== 1 ? 's' : ''}`)
      : at.blockPausedTitle,
    urgent: false,
  }));

  const othersLines = others.map(a => ({
    id: a.id,
    label: `${(a.task as any)?.businessId || getTaskBusinessId(a.task?.id || '')} ${a.clientName}`.trim(),
    meta: a.daysOverdue > 0
      ? (lang === 'zh' ? `逾期 ${a.daysOverdue} 天` : `${a.daysOverdue} day${a.daysOverdue !== 1 ? 's' : ''} overdue`)
      : tradeStatusLabel(a.tradeStatus, lang),
    urgent: a.daysOverdue > 0,
  }));

  // ── Modal configs ────────────────────────────────────────────────────────

  const MODAL_CONFIGS: Record<BlockKey, ModalConfig> = {
    urgent:   { key: 'urgent',   status: 'urgent',          icon: <AlertTriangle className="w-3.5 h-3.5" />, title: at.blockUrgentTitle,   badge: <RuleEngineBadge /> },
    supplier: { key: 'supplier', status: 'waitingSupplier', icon: <PackageSearch className="w-3.5 h-3.5" />, title: at.blockSupplierTitle, badge: <RuleEngineBadge /> },
    client:   { key: 'client',   status: 'waitingClient',   icon: <Clock className="w-3.5 h-3.5" />,         title: at.blockClientTitle,   badge: <RuleEngineBadge /> },
    paused:   { key: 'paused',   status: 'paused',          icon: <PauseCircle className="w-3.5 h-3.5" />,   title: at.blockPausedTitle,   badge: <RuleEngineBadge /> },
    others:   { key: 'others',   status: 'otherInquiry',    icon: <Sparkles className="w-3.5 h-3.5" />,      title: at.blockOthersTitle,   badge: <RuleEngineBadge /> },
    ai:       { key: 'ai',       status: 'ai',              icon: <Bot className="w-3.5 h-3.5" />,           title: at.openaiSuggestionsTitle },
  };

  return (
    <>
      {waItem && <WAModal item={waItem} onClose={() => setWaItem(null)} />}

      {/* Expanded modal */}
      {expanded && (
        <ExpandedModal config={MODAL_CONFIGS[expanded]} onClose={() => setExpanded(null)}>
          {expanded === 'urgent' && (
            urgent.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">{at.emptyUrgent}</p>
              : urgent.map(item => (
                  <ActionCard key={item.id} item={item} status="urgent" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'client' && (
            waitingClient.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">{at.emptyClient}</p>
              : waitingClient.map(item => (
                  <ActionCard key={item.id} item={item} status="waitingClient" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'supplier' && (
            waitingSupplier.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">{at.emptySupplier}</p>
              : waitingSupplier.map(item => (
                  <ActionCard key={item.id} item={item} status="waitingSupplier" onOpen={handleOpen} />
                ))
          )}
          {expanded === 'paused' && (
            pausedItems.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">{at.emptyPaused}</p>
              : pausedItems.map(item => (
                  <ActionCard key={item.id} item={item} status="paused" onOpen={handleOpen} />
                ))
          )}
          {expanded === 'others' && (
            others.length === 0
              ? <p className="text-sm text-slate-400 font-bold text-center py-8">{at.emptyOthers}</p>
              : others.map(item => (
                  <ActionCard key={item.id} item={item} status="otherInquiry" onWA={setWaItem} onOpen={handleOpen} />
                ))
          )}
          {expanded === 'ai' && (
            aiLoading ? (
              <div className="flex items-center justify-center gap-3 py-12">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: GOLD }} />
                <span className="text-sm font-bold text-slate-400">{at.gptAnalyzing}</span>
              </div>
            ) : aiError ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: statusMap.urgent.bg, border: `1px solid ${statusMap.urgent.color}30` }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: statusMap.urgent.color }} />
                  <div>
                    <p className="text-[13px] font-black" style={{ color: statusMap.urgent.color }}>{at.gptConnectionFailed}</p>
                    <p className="text-[13px] mt-0.5" style={{ color: statusMap.urgent.color }}>{aiError}</p>
                  </div>
                </div>
                {ruleSuggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border" style={{ borderColor: GOLD + '30' }}>
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
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>{at.overallInsightLabel}</span>
                      {aiResult.priorityFocus && (
                        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: NAVY + '10', color: NAVY }}>
                          {at.focusLabel}: {aiResult.priorityFocus}
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
                  {at.aiDisclaimer}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Bot className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-bold text-slate-400">{at.notGeneratedHint}</p>
              </div>
            )
          )}
        </ExpandedModal>
      )}

      {/* ── CEO Dashboard: 5 compact cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card 1 — 今日必须推进 */}
        <SummaryCard
          status="urgent" icon={<AlertTriangle className="w-3.5 h-3.5" />}
          title={at.blockUrgentTitle} count={urgent.length}
          badge={<RuleEngineBadge />}
          previewLines={urgentLines} emptyText={at.emptyUrgent}
          onExpand={() => setExpanded('urgent')}
        />

        {/* Card 2 — 待报价 */}
        <SummaryCard
          status="waitingSupplier" icon={<PackageSearch className="w-3.5 h-3.5" />}
          title={at.blockSupplierTitle} count={waitingSupplier.length}
          badge={<RuleEngineBadge />}
          previewLines={supplierLines} emptyText={at.emptySupplier}
          onExpand={() => setExpanded('supplier')}
        />

        {/* Card 3 — 已报价待确认 / 合同待签 */}
        <SummaryCard
          status="waitingClient" icon={<Clock className="w-3.5 h-3.5" />}
          title={at.blockClientTitle} count={waitingClient.length}
          badge={<RuleEngineBadge />}
          previewLines={clientLines} emptyText={at.emptyClient}
          onExpand={() => setExpanded('client')}
        />

        {/* Card 4 — 新询盘 · 其他 */}
        <SummaryCard
          status="otherInquiry" icon={<Sparkles className="w-3.5 h-3.5" />}
          title={at.blockOthersTitle} count={others.length}
          badge={<RuleEngineBadge />}
          previewLines={othersLines} emptyText={at.emptyOthers}
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
