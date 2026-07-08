import React, { useState } from 'react';
import {
  Brain, AlertTriangle, Zap, Calendar, MessageSquare,
  Copy, Check, RefreshCw, ChevronDown, ChevronUp, ShieldAlert
} from 'lucide-react';
import { FollowUpTask } from '../types';
import { GoogleGenAI } from '@google/genai';

const GOLD = '#B8960C';
const NAVY = '#0F172A';

// ── Types ────────────────────────────────────────────────────────────────────

interface CopilotAnalysis {
  stage: string;
  stageDetail: string;
  blockage: string;
  risk: 'low' | 'medium' | 'high';
  riskReason: string;
  nextAction: string;
  suggestedDate: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getApiKey(): string {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ── Rule Engine ───────────────────────────────────────────────────────────────

function detectStage(status: string): { stage: string; detail: string } {
  const map: Record<string, { stage: string; detail: string }> = {
    '新询盘':    { stage: '新进入', detail: '待首次响应' },
    '新建':      { stage: '新进入', detail: '待首次响应' },
    'New Inquiry': { stage: '新进入', detail: '待首次响应' },
    '跟进中':   { stage: '跟进中', detail: '建立联系阶段' },
    'Following': { stage: '跟进中', detail: '建立联系阶段' },
    '寻价中':   { stage: '询价阶段', detail: '等待供应商报价中' },
    'Sourcing':  { stage: '询价阶段', detail: '等待供应商报价中' },
    '已报价':   { stage: '报价阶段', detail: '报价已就绪，待发送' },
    'Quoted':    { stage: '报价阶段', detail: '报价已发，待客户确认' },
    '已发客户':  { stage: '报价阶段', detail: '已发客户，等待回复' },
    'Sent':      { stage: '报价阶段', detail: '已发客户，等待回复' },
    '谈判中':   { stage: '谈判阶段', detail: '价格/条款协商中' },
    '已确认':   { stage: '确认阶段', detail: '等待正式下单或合同' },
    'Confirmed': { stage: '确认阶段', detail: '等待正式下单或合同' },
    '合同待签':  { stage: '合同阶段', detail: '客户确认合作，等待签署合同' },
    '已成交':   { stage: '执行阶段', detail: '项目/订单已成交' },
    '已转订单':  { stage: '执行阶段', detail: '已转入订单执行' },
    'Converted': { stage: '执行阶段', detail: '已转入订单执行' },
    '已暂停':   { stage: '暂停', detail: '业务暂时搁置' },
    '已关闭':   { stage: '已关闭', detail: '业务已关闭' },
  };
  return map[status] || { stage: '跟进中', detail: status || '状态未知' };
}

function detectBlockage(
  task: FollowUpTask,
  daysSinceUpdate: number,
  daysOverdue: number
): string {
  const s = task.tradeStatus;
  const context = ((task.lastContext || '') + ' ' + ((task as any).lastNote || '')).toLowerCase();

  if (['寻价中', 'Sourcing'].includes(s) && daysSinceUpdate > 5)
    return '供应商报价迟迟未到，跟进链条卡在询价环节';
  if (['已报价', 'Quoted', '已发客户', 'Sent'].includes(s) && daysOverdue > 5)
    return '报价已发出，客户长时间未回复';
  if (context.includes('aldar') || context.includes('approval') || context.includes('审批'))
    return '等待项目方/开发商内部审批';
  if (context.includes('sample') || context.includes('样品'))
    return '等待样品确认或样品寄送中';
  if (context.includes('travelling') || context.includes('travel') || context.includes('出差'))
    return '客户出差/外出，暂时无法响应';
  if (context.includes('holiday') || context.includes('假期') || context.includes('节日'))
    return '客户处于假期，暂停响应';
  if (context.includes('price') && context.includes('high'))
    return '价格争议，客户认为报价偏高';
  if (daysSinceUpdate > 14)
    return '超过 14 天无任何更新，进入静默状态';
  if (daysOverdue > 7)
    return '已逾期超过 7 天，尚未推进跟进';

  return '暂无明显卡点，按计划推进';
}

function computeRisk(
  task: FollowUpTask,
  daysSinceUpdate: number,
  daysOverdue: number
): { risk: 'low' | 'medium' | 'high'; reason: string } {
  if (task.tradeStatus === '合同待签' && daysOverdue > 5)
    return { risk: 'high', reason: '合同已等超过 5 天未签署，存在客户反悔或流失风险' };
  if (['已报价', 'Quoted', '已发客户', 'Sent'].includes(task.tradeStatus) && daysOverdue > 7)
    return { risk: 'high', reason: '报价发出后客户超过 7 天未回复，存在流失风险' };
  if (daysSinceUpdate > 14)
    return { risk: 'high', reason: '超过 14 天无任何动态，项目停滞风险高' };
  if (['寻价中', 'Sourcing'].includes(task.tradeStatus) && daysSinceUpdate > 10)
    return { risk: 'medium', reason: '供应商询价已超 10 天，可能影响报价时效' };
  if (daysOverdue > 3)
    return { risk: 'medium', reason: `跟进计划已逾期 ${daysOverdue} 天` };
  if (task.priority === 'A' && daysOverdue > 0)
    return { risk: 'medium', reason: 'A 级高优先客户出现逾期，需立即处理' };
  if (daysOverdue > 0)
    return { risk: 'low', reason: `跟进计划逾期 ${daysOverdue} 天，需尽快跟进` };

  return { risk: 'low', reason: '当前进展正常，按计划执行' };
}

function suggestNextAction(
  task: FollowUpTask,
  daysSinceUpdate: number,
  daysOverdue: number
): string {
  const s = task.tradeStatus;

  if (['新询盘', '新建', 'New Inquiry'].includes(s))
    return '尽快首次响应，发送产品介绍或确认需求';
  if (['已发客户', 'Sent', '已报价', 'Quoted'].includes(s) && daysOverdue > 5)
    return '发送报价跟进消息，询问客户对报价的反馈意见';
  if (['已发客户', 'Sent', 'Quoted'].includes(s))
    return '温和跟进，确认客户是否收到报价，询问是否有疑问';
  if (['寻价中', 'Sourcing'].includes(s))
    return '联系供应商催促报价进度，确认交期和价格';
  if (['谈判中'].includes(s))
    return '推进价格/条款谈判，准备最终确认文件';
  if (['已确认', 'Confirmed'].includes(s))
    return '催促客户正式下单或签署合同，确认付款方式';
  if (s === '合同待签')
    return daysOverdue > 3
      ? '合同迟迟未签，今日必须催促，确认是否有阻碍因素'
      : '跟进合同签署进度，询问是否需要任何补充文件';
  if (daysSinceUpdate > 14)
    return '超长时间未联系，建议电话或 WhatsApp 重新激活联系';
  if (task.priority === 'A')
    return task.aiInsights?.nextActionSuggestion || '高优先客户，今日必须完成跟进';

  return task.suggestedAction || '按计划发送跟进消息，确认进展';
}

function suggestFollowUpDate(
  risk: 'low' | 'medium' | 'high',
  daysOverdue: number,
  todayISO: string
): string {
  if (risk === 'high' || daysOverdue > 7) return todayISO;
  if (risk === 'medium' || daysOverdue > 3) return addDays(todayISO, 1);
  return addDays(todayISO, 3);
}

function analyzeTask(task: FollowUpTask): CopilotAnalysis {
  const todayISO = new Date().toISOString().slice(0, 10);
  const updatedDate = task.updatedAt?.slice(0, 10) || task.createdAt?.slice(0, 10) || todayISO;
  const nextDate = task.nextFollowUpAt?.slice(0, 10) || todayISO;

  const daysSinceUpdate = Math.max(0, daysBetween(updatedDate, todayISO));
  const daysOverdue = daysBetween(nextDate, todayISO);

  const { stage, detail: stageDetail } = detectStage(task.tradeStatus);
  const blockage = detectBlockage(task, daysSinceUpdate, daysOverdue);
  const { risk, reason: riskReason } = computeRisk(task, daysSinceUpdate, daysOverdue);
  const nextAction = suggestNextAction(task, daysSinceUpdate, daysOverdue);
  const suggestedDate = suggestFollowUpDate(risk, daysOverdue, todayISO);

  return { stage, stageDetail, blockage, risk, riskReason, nextAction, suggestedDate };
}

// ── WhatsApp Prompt ───────────────────────────────────────────────────────────

function buildWAPrompt(task: FollowUpTask, analysis: CopilotAnalysis): string {
  const isProject = task.businessType === 'PROJECT';
  return `
你是 GCI (Global Care Info) 的 Chris，正在给客户发 WhatsApp 跟进消息。

客户：${task.clientName}
当前阶段：${analysis.stage} · ${analysis.stageDetail}
当前状态：${task.tradeStatus}
卡点：${analysis.blockage}
跟进目标：${task.goal}
最近情况：${task.lastContext || (task as any).lastNote || '无'}
业务类型：${isProject ? '项目型（FF&E/室内/装修）' : '贸易型（产品采购）'}

写一条 WhatsApp 消息：
1. 英文，不超过 5 行
2. 开头直接称呼客户名字
3. 一句话点出当前进展/状态
4. 结尾用一个问句推动下一步
5. 简洁商务，不用套话（禁用 "I hope this finds you well"）
6. GCI 风格：直接、实用、专业

只输出消息正文，不加任何解释。
`.trim();
}

// ── Risk Config ───────────────────────────────────────────────────────────────

const riskCfg = {
  low:    { label: '风险低', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  medium: { label: '风险中', color: GOLD,      bg: '#FFFBEB', border: '#FDE68A' },
  high:   { label: '风险高', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  task: FollowUpTask;
}

export default function LeadCopilot({ task }: Props) {
  const analysis = analyzeTask(task);
  const risk = riskCfg[analysis.risk];

  const [expanded, setExpanded] = useState(true);
  const [waDraft, setWaDraft] = useState('');
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState('');
  const [waVisible, setWaVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateWA = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setWaError('未配置 GEMINI_API_KEY，无法生成草稿');
      return;
    }
    setWaLoading(true);
    setWaError('');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildWAPrompt(task, analysis) }] }],
        config: { maxOutputTokens: 300 },
      });
      setWaDraft((res.text ?? '').trim());
    } catch (e: any) {
      setWaError(e?.message || 'AI 生成失败，请重试');
    } finally {
      setWaLoading(false);
    }
  };

  const copyWA = async () => {
    if (!waDraft) return;
    await navigator.clipboard.writeText(waDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      className="rounded-[28px] overflow-hidden border shadow-sm"
      style={{ borderColor: GOLD + '50', backgroundColor: '#FFFDF5' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-6 py-4"
        style={{ backgroundColor: NAVY }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <Brain className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">
            AI Copilot · 跟进分析
          </span>
          {analysis.risk === 'high' && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
              高风险
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />
        }
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-4">

          {/* Stage + Risk row */}
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-2xl px-4 py-3 border"
              style={{ backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}
            >
              <div className="text-[9px] font-black text-sky-500 uppercase tracking-widest mb-1">
                当前阶段
              </div>
              <div className="text-sm font-black" style={{ color: NAVY }}>
                {analysis.stage}
              </div>
              <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                {analysis.stageDetail}
              </div>
            </div>

            <div
              className="flex-1 rounded-2xl px-4 py-3 border"
              style={{ backgroundColor: risk.bg, borderColor: risk.border }}
            >
              <div className="text-[9px] font-black uppercase tracking-widest mb-1"
                style={{ color: risk.color }}>
                风险等级
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" style={{ color: risk.color }} />
                <span className="text-sm font-black" style={{ color: risk.color }}>
                  {risk.label}
                </span>
              </div>
              <div className="text-[10px] font-medium text-slate-400 mt-0.5 leading-relaxed">
                {analysis.riskReason}
              </div>
            </div>
          </div>

          {/* Blockage */}
          <div
            className="rounded-2xl px-4 py-3 border flex items-start gap-3"
            style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}
          >
            <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5">
                当前卡点
              </div>
              <p className="text-xs font-bold text-slate-700">{analysis.blockage}</p>
            </div>
          </div>

          {/* Next action + date */}
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-2xl px-4 py-3 border"
              style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}
            >
              <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">
                建议下一步
              </div>
              <div className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-slate-700 leading-relaxed">
                  {analysis.nextAction}
                </p>
              </div>
            </div>

            <div
              className="rounded-2xl px-4 py-3 border text-center flex-shrink-0"
              style={{ backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}
            >
              <div className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-1">
                建议跟进日
              </div>
              <Calendar className="w-4 h-4 text-purple-400 mx-auto mb-1" />
              <div className="text-sm font-black text-purple-700">
                {analysis.suggestedDate}
              </div>
            </div>
          </div>

          {/* WhatsApp draft section */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: NAVY + '30' }}
          >
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: NAVY + '08' }}
              onClick={() => setWaVisible(v => !v)}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: NAVY }} />
                <span className="text-xs font-black" style={{ color: NAVY }}>
                  WhatsApp 跟进草稿
                </span>
              </div>
              {waVisible
                ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              }
            </button>

            {waVisible && (
              <div className="px-4 pb-4 pt-3 space-y-3">
                {waDraft ? (
                  <textarea
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                    style={{ minHeight: '100px' }}
                    value={waDraft}
                    onChange={e => setWaDraft(e.target.value)}
                  />
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400">
                    点击生成按钮，AI 将根据当前阶段起草 WhatsApp 消息
                  </div>
                )}

                {waError && (
                  <div className="rounded-lg p-2.5 bg-red-50 text-xs font-bold text-red-600">
                    {waError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={generateWA}
                    disabled={waLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: NAVY }}
                  >
                    {waLoading
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 生成中...</>
                      : <><Brain className="w-3.5 h-3.5" /> {waDraft ? '重新生成' : 'AI 生成草稿'}</>
                    }
                  </button>
                  {waDraft && (
                    <button
                      onClick={copyWA}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border-2 transition-colors hover:bg-amber-50"
                      style={{ borderColor: GOLD, color: GOLD }}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? '已复制' : '复制'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
