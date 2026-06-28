import React, { useState } from 'react';
import { Brain, AlertTriangle, Zap, Clock, ChevronRight, MessageSquare, X, Copy, Check } from 'lucide-react';
import { FollowUpTask, Project } from '../types';
import { GoogleGenAI } from '@google/genai';

const GOLD = '#B8960C';
const NAVY = '#0F172A';

interface AIAdvisorProps {
  tasks: FollowUpTask[];
  projects: Project[];
  onSelectTask: (task: FollowUpTask) => void;
}

interface RiskItem {
  type: 'overdue' | 'stale_quote' | 'long_silence' | 'stuck_approval';
  task: FollowUpTask;
  label: string;
  detail: string;
  daysSince: number;
}

interface ActionSuggestion {
  task: FollowUpTask;
  action: string;
  urgency: 'high' | 'medium' | 'low';
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getApiKey(): string {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function computeRisks(tasks: FollowUpTask[], todayISO: string): RiskItem[] {
  const risks: RiskItem[] = [];

  for (const t of tasks) {
    if (t.status !== 'todo') continue;

    const nextDate = t.nextFollowUpAt?.slice(0, 10);
    const updatedDate = t.updatedAt?.slice(0, 10) || t.createdAt?.slice(0, 10);
    const daysSinceUpdate = updatedDate ? daysBetween(updatedDate, todayISO) : 0;
    const daysOverdue = nextDate ? daysBetween(nextDate, todayISO) : 0;

    // Already quoted but overdue > 5 days
    if (
      ['已报价', '已发客户', 'Quoted', 'Sent'].includes(t.tradeStatus) &&
      daysOverdue > 5
    ) {
      risks.push({
        type: 'stale_quote',
        task: t,
        label: '报价无回应',
        detail: `报价已发出，${daysOverdue} 天无回应`,
        daysSince: daysOverdue,
      });
      continue;
    }

    // Long silence > 14 days
    if (daysSinceUpdate > 14 && daysOverdue > 0) {
      risks.push({
        type: 'long_silence',
        task: t,
        label: '客户长时间无动静',
        detail: `${daysSinceUpdate} 天未有任何更新`,
        daysSince: daysSinceUpdate,
      });
      continue;
    }

    // Stuck in sourcing > 7 days
    if (
      ['寻价中', 'Sourcing'].includes(t.tradeStatus) &&
      daysSinceUpdate > 7
    ) {
      risks.push({
        type: 'stuck_approval',
        task: t,
        label: '供应商跟进停滞',
        detail: `寻价中已 ${daysSinceUpdate} 天无进展`,
        daysSince: daysSinceUpdate,
      });
      continue;
    }

    // Overdue > 3 days
    if (daysOverdue > 3) {
      risks.push({
        type: 'overdue',
        task: t,
        label: '跟进逾期',
        detail: `已逾期 ${daysOverdue} 天`,
        daysSince: daysOverdue,
      });
    }
  }

  return risks.sort((a, b) => b.daysSince - a.daysSince).slice(0, 5);
}

function computeActionSuggestions(tasks: FollowUpTask[], todayISO: string): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];

  for (const t of tasks) {
    if (t.status !== 'todo') continue;

    const nextDate = t.nextFollowUpAt?.slice(0, 10);
    if (!nextDate || nextDate > todayISO) continue;

    const daysOverdue = daysBetween(nextDate, todayISO);

    let action = '';
    let urgency: 'high' | 'medium' | 'low' = 'low';

    if (['已报价', '已发客户', 'Quoted', 'Sent'].includes(t.tradeStatus)) {
      action = '发送报价跟进消息，询问客户反馈';
      urgency = daysOverdue > 3 ? 'high' : 'medium';
    } else if (['寻价中', 'Sourcing'].includes(t.tradeStatus)) {
      action = '联系供应商确认报价进度';
      urgency = 'medium';
    } else if (['谈判中', '已确认', 'Confirmed'].includes(t.tradeStatus)) {
      action = '跟进合同/付款确认状态';
      urgency = 'high';
    } else if (t.priority === 'A') {
      action = t.aiInsights?.nextActionSuggestion || '高优先级客户，今日必须跟进';
      urgency = 'high';
    } else if (daysOverdue > 7) {
      action = '长时间未跟进，建议电话联系';
      urgency = 'high';
    } else {
      action = t.suggestedAction || '按计划发送跟进消息';
      urgency = t.priority === 'B' ? 'medium' : 'low';
    }

    suggestions.push({ task: t, action, urgency });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => order[a.urgency] - order[b.urgency]).slice(0, 6);
}

function buildWhatsAppPrompt(task: FollowUpTask, project?: Project): string {
  const isProjectType = task.businessType === 'PROJECT' || project?.type === '项目型';
  const typeLabel = isProjectType ? '项目型' : '贸易型';

  return `
你是 GCI (Global Care Info) 的 Chris，正在给客户发 WhatsApp 跟进消息。

客户信息：
- 姓名：${task.clientName}
- 跟进目标：${task.goal}
- 当前阶段：${task.tradeStatus}
- 客户类型：${typeLabel}
- 最近情况：${task.lastContext || '无'}
- 备注：${task.lastNote || task.notes || '无'}

请写一条 WhatsApp 消息，要求：
1. 英文，简洁直接，不超过5行
2. 开头称呼客户名字
3. 点出当前进展/状态
4. 结尾用一个问句推进下一步
5. GCI 风格：专业、简短、实用
6. 不要用"I hope this message finds you well"等套话
7. 只输出消息正文，不要任何解释或标签

参考风格：
"Hi [Name], just checking whether there is any update from [Party] regarding the [topic]? Let me know if you need anything from our side."
`.trim();
}

interface WhatsAppDraftModalProps {
  task: FollowUpTask;
  project?: Project;
  onClose: () => void;
}

function WhatsAppDraftModal({ task, project, onClose }: WhatsAppDraftModalProps) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('未配置 GEMINI API KEY，无法生成草稿');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = buildWhatsAppPrompt(task, project);
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 300 },
      });
      setDraft((res.text ?? '').trim());
    } catch (e: any) {
      setError(e?.message || 'AI 生成失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl" style={{ backgroundColor: NAVY }}>
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-black" style={{ color: NAVY }}>WhatsApp 跟进草稿</div>
              <div className="text-[10px] font-bold text-slate-400">{task.clientName} · {task.tradeStatus}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Context summary */}
        <div className="rounded-xl p-3 text-xs font-bold space-y-1" style={{ backgroundColor: '#F8FAFC' }}>
          <div className="text-slate-500">目标：<span className="text-slate-700">{task.goal}</span></div>
          {task.lastContext && (
            <div className="text-slate-500">近况：<span className="text-slate-700">{task.lastContext.slice(0, 80)}{task.lastContext.length > 80 ? '...' : ''}</span></div>
          )}
        </div>

        {/* Draft area */}
        <div className="space-y-2">
          {draft ? (
            <textarea
              className="w-full rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-800 resize-none focus:outline-none focus:ring-2"
              style={{ minHeight: '120px' }}
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-400">
              点击「生成草稿」让 AI 起草 WhatsApp 消息
            </div>
          )}

          {error && (
            <div className="rounded-lg p-3 bg-red-50 text-xs font-bold text-red-600">{error}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={generate}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: NAVY }}
          >
            <Brain className="w-4 h-4" />
            {loading ? 'AI 生成中...' : draft ? '重新生成' : '生成草稿'}
          </button>
          {draft && (
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black border-2 transition-colors hover:bg-slate-50"
              style={{ borderColor: GOLD, color: GOLD }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const urgencyConfig = {
  high:   { color: '#EF4444', bg: '#FEF2F2', label: '紧急' },
  medium: { color: GOLD,      bg: '#FFFBEB', label: '今日' },
  low:    { color: '#6366F1', bg: '#EEF2FF', label: '建议' },
};

const riskConfig = {
  overdue:          { color: '#EF4444', bg: '#FEF2F2' },
  stale_quote:      { color: '#F59E0B', bg: '#FFFBEB' },
  long_silence:     { color: '#8B5CF6', bg: '#F5F3FF' },
  stuck_approval:   { color: '#6366F1', bg: '#EEF2FF' },
};

export default function AIAdvisor({ tasks, projects, onSelectTask }: AIAdvisorProps) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [whatsAppTask, setWhatsAppTask] = useState<FollowUpTask | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const activeTasks = tasks.filter(t => t.status === 'todo');
  const risks = computeRisks(activeTasks, todayISO);
  const suggestions = computeActionSuggestions(activeTasks, todayISO);

  const highUrgencyCount = suggestions.filter(s => s.urgency === 'high').length;

  const whatsAppProject = whatsAppTask
    ? projects.find(p => p.id === whatsAppTask.relatedProjectId)
    : undefined;

  if (suggestions.length === 0 && risks.length === 0) return null;

  return (
    <>
      {/* WhatsApp modal */}
      {whatsAppTask && (
        <WhatsAppDraftModal
          task={whatsAppTask}
          project={whatsAppProject}
          onClose={() => setWhatsAppTask(null)}
        />
      )}

      <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: GOLD + '40', backgroundColor: '#FFFDF5' }}>
        {/* Section header */}
        <div
          className="flex items-center justify-between px-6 py-4 cursor-pointer"
          style={{ backgroundColor: NAVY }}
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color: GOLD }} />
            <span className="text-sm font-black text-white tracking-widest uppercase">AI 今日建议</span>
            {highUrgencyCount > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
                {highUrgencyCount} 紧急
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400">规则引擎 · 无需等待</span>
            <ChevronRight
              className="w-4 h-4 text-slate-400 transition-transform"
              style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
            />
          </div>
        </div>

        {!collapsed && (
          <div className="p-6 space-y-6">
            {/* Action suggestions */}
            {suggestions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>
                    行动建议
                  </span>
                </div>
                <div className="space-y-2">
                  {suggestions.map(s => {
                    const cfg = urgencyConfig[s.urgency];
                    return (
                      <div
                        key={s.task.id}
                        className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border"
                        style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '30' }}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: cfg.color, color: '#fff' }}
                          >
                            {cfg.label}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-black truncate" style={{ color: NAVY }}>
                              {s.task.clientName}
                            </div>
                            <div className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                              {s.action}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => setWhatsAppTask(s.task)}
                            className="text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-1 transition-opacity hover:opacity-80"
                            style={{ backgroundColor: NAVY, color: '#fff' }}
                            title="生成 WhatsApp 草稿"
                          >
                            <MessageSquare className="w-3 h-3" /> WA
                          </button>
                          <button
                            onClick={() => onSelectTask(s.task)}
                            className="text-[10px] font-black px-2 py-1 rounded-lg border transition-colors hover:bg-white"
                            style={{ borderColor: NAVY + '40', color: NAVY }}
                          >
                            打开
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risk detection */}
            {risks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>
                    风险识别
                  </span>
                </div>
                <div className="space-y-2">
                  {risks.map(r => {
                    const cfg = riskConfig[r.type];
                    return (
                      <div
                        key={r.task.id + r.type}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border"
                        style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '30' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                          <div className="min-w-0">
                            <div className="text-xs font-black truncate" style={{ color: NAVY }}>
                              {r.task.clientName}
                              <span className="ml-2 font-bold text-slate-400">·</span>
                              <span className="ml-1 font-bold" style={{ color: cfg.color }}>{r.label}</span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-400 mt-0.5">{r.detail}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => setWhatsAppTask(r.task)}
                            className="text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-1 transition-opacity hover:opacity-80"
                            style={{ backgroundColor: NAVY, color: '#fff' }}
                          >
                            <MessageSquare className="w-3 h-3" /> WA
                          </button>
                          <button
                            onClick={() => onSelectTask(r.task)}
                            className="text-[10px] font-black px-2 py-1 rounded-lg border transition-colors hover:bg-white"
                            style={{ borderColor: NAVY + '40', color: NAVY }}
                          >
                            打开
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer note */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <Clock className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-[10px] font-bold text-slate-300">
                基于本地规则引擎计算 · 每次打开控制中心自动刷新
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
