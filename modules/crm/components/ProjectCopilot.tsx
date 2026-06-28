import React, { useState } from 'react';
import {
  Brain, AlertTriangle, Zap, ChevronDown, ChevronUp,
  Clock, TrendingUp, CheckCircle, PauseCircle, Users
} from 'lucide-react';
import { Project } from '../types';

const GOLD = '#B8960C';
const NAVY = '#0F172A';

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = 'high' | 'medium' | 'low' | 'ok';

interface ProjectInsight {
  project: Project;
  tag: string;
  tagColor: string;
  tagBg: string;
  riskLevel: RiskLevel;
  suggestion: string;
  daysOverdue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Status tag config — maps tradeStatus to display label + color
const STATUS_TAG: Record<string, { tag: string; color: string; bg: string }> = {
  '新建':      { tag: '待首次接触', color: '#6366F1', bg: '#EEF2FF' },
  '新询盘':    { tag: '待首次接触', color: '#6366F1', bg: '#EEF2FF' },
  'New Inquiry': { tag: '待首次接触', color: '#6366F1', bg: '#EEF2FF' },
  '跟进中':   { tag: '推进中',     color: GOLD,      bg: '#FFFBEB' },
  'Following': { tag: '推进中',     color: GOLD,      bg: '#FFFBEB' },
  '寻价中':   { tag: '等供应商',   color: '#8B5CF6', bg: '#F5F3FF' },
  'Sourcing':  { tag: '等供应商',   color: '#8B5CF6', bg: '#F5F3FF' },
  '已报价':   { tag: '等客户回复', color: '#F59E0B', bg: '#FFFBEB' },
  'Quoted':    { tag: '等客户回复', color: '#F59E0B', bg: '#FFFBEB' },
  '已发客户':  { tag: '等客户回复', color: '#F59E0B', bg: '#FFFBEB' },
  'Sent':      { tag: '等客户回复', color: '#F59E0B', bg: '#FFFBEB' },
  '谈判中':   { tag: '谈判推进',   color: '#0EA5E9', bg: '#F0F9FF' },
  '已确认':   { tag: '待正式下单', color: '#10B981', bg: '#ECFDF5' },
  'Confirmed': { tag: '待正式下单', color: '#10B981', bg: '#ECFDF5' },
  '已成交':   { tag: '已成交',     color: '#10B981', bg: '#ECFDF5' },
  '已转订单':  { tag: '执行中',     color: '#10B981', bg: '#ECFDF5' },
  'Converted': { tag: '执行中',     color: '#10B981', bg: '#ECFDF5' },
  '已暂停':   { tag: '暂停中',     color: '#94A3B8', bg: '#F8FAFC' },
  '已关闭':   { tag: '已关闭',     color: '#CBD5E1', bg: '#F8FAFC' },
};

function getStatusTag(tradeStatus: string): { tag: string; color: string; bg: string } {
  return STATUS_TAG[tradeStatus] || { tag: '跟进中', color: GOLD, bg: '#FFFBEB' };
}

function buildSuggestion(p: Project, daysOverdue: number): string {
  const s = p.tradeStatus;
  const hasNoFollowUps = !p.projectFollowUps || p.projectFollowUps.length === 0;
  const daysSinceCreated = daysBetween(p.createdAt, new Date().toISOString().slice(0, 10));

  if (['已报价', 'Quoted', '已发客户', 'Sent'].includes(s) && daysOverdue > 5)
    return `报价已发 ${daysOverdue} 天未回复，今日发 WhatsApp 跟进确认`;
  if (['已报价', 'Quoted', '已发客户', 'Sent'].includes(s))
    return '温和跟进，确认客户是否收到报价并询问反馈';
  if (['寻价中', 'Sourcing'].includes(s) && daysOverdue > 5)
    return '供应商询价已超期，今日催促报价进度';
  if (['寻价中', 'Sourcing'].includes(s))
    return '确认供应商报价进度，预计何时可回';
  if (['谈判中'].includes(s))
    return '推进价格/条款谈判，准备最终确认方案';
  if (['已确认', 'Confirmed'].includes(s))
    return '跟进正式合同/下单，确认付款方式和时间';
  if (['新建', '新询盘', 'New Inquiry'].includes(s) && daysSinceCreated > 3)
    return '项目已建立 ' + daysSinceCreated + ' 天，尽快首次联系客户';
  if (['新建', '新询盘', 'New Inquiry'].includes(s))
    return '新建项目，安排首次联系客户，了解具体需求';
  if (hasNoFollowUps && daysSinceCreated > 7)
    return '项目建立超过 ' + daysSinceCreated + ' 天无跟进记录，今日必须推进';
  if (daysOverdue > 7)
    return '已逾期 ' + daysOverdue + ' 天，建议立即联系客户，防止流失';
  if (daysOverdue > 0)
    return '跟进日期已过，今日安排联系';

  return p.projectFollowUps?.length === 0
    ? '尚无跟进记录，尽快首次推进'
    : '按计划推进，记录最新进展';
}

function computeRisk(p: Project, daysOverdue: number): RiskLevel {
  if (['已成交', '已转订单', 'Converted', '已暂停', '已关闭'].includes(p.tradeStatus))
    return 'ok';
  if (['已报价', 'Quoted', '已发客户', 'Sent'].includes(p.tradeStatus) && daysOverdue > 7)
    return 'high';
  if (daysOverdue > 14)
    return 'high';
  if (daysOverdue > 5 || (['寻价中', 'Sourcing'].includes(p.tradeStatus) && daysOverdue > 3))
    return 'medium';
  if (daysOverdue > 0)
    return 'low';
  return 'ok';
}

function analyzeProjects(projects: Project[]): {
  priority: ProjectInsight[];
  stale: ProjectInsight[];
  waitingClient: ProjectInsight[];
  waitingSupplier: ProjectInsight[];
  active: ProjectInsight[];
} {
  const todayISO = new Date().toISOString().slice(0, 10);

  const insights: ProjectInsight[] = projects
    .filter(p => !p.deleted && !p.archivedAt)
    .map(p => {
      const nextDate = p.nextActionAt?.slice(0, 10);
      const daysOverdue = nextDate ? daysBetween(nextDate, todayISO) : 0;
      const { tag, color, bg } = getStatusTag(p.tradeStatus);
      const riskLevel = computeRisk(p, daysOverdue);
      const suggestion = buildSuggestion(p, daysOverdue);
      return { project: p, tag, tagColor: color, tagBg: bg, riskLevel, suggestion, daysOverdue };
    });

  const priority = insights
    .filter(i => i.daysOverdue > 0 && !['已成交', '已转订单', 'Converted', '已暂停', '已关闭'].includes(i.project.tradeStatus))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 5);

  const stale = insights
    .filter(i => {
      if (['已成交', '已转订单', 'Converted', '已暂停', '已关闭'].includes(i.project.tradeStatus)) return false;
      const hasNoFollowUps = !i.project.projectFollowUps || i.project.projectFollowUps.length === 0;
      const daysSinceCreated = daysBetween(i.project.createdAt, todayISO);
      return (hasNoFollowUps && daysSinceCreated > 5) || i.daysOverdue > 10;
    })
    .slice(0, 4);

  const waitingClient = insights
    .filter(i => ['已报价', 'Quoted', '已发客户', 'Sent'].includes(i.project.tradeStatus))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 4);

  const waitingSupplier = insights
    .filter(i => ['寻价中', 'Sourcing'].includes(i.project.tradeStatus))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 4);

  const active = insights
    .filter(i => ['跟进中', '谈判中', '已确认', 'Following', 'Confirmed'].includes(i.project.tradeStatus))
    .slice(0, 4);

  return { priority, stale, waitingClient, waitingSupplier, active };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const riskDot: Record<RiskLevel, string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    GOLD,
  ok:     '#10B981',
};

function InsightRow({ insight, onSelect }: { insight: ProjectInsight; onSelect: (id: string) => void }) {
  const dot = riskDot[insight.riskLevel];
  return (
    <button
      onClick={() => onSelect(insight.project.id)}
      className="w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:bg-white transition-colors"
      style={{ backgroundColor: '#FAFAFA' }}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: dot }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-black truncate" style={{ color: NAVY }}>
            {insight.project.clientName}
          </span>
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ color: insight.tagColor, backgroundColor: insight.tagBg }}
          >
            {insight.tag}
          </span>
          {insight.daysOverdue > 0 && (
            <span className="text-[9px] font-black text-red-500 flex-shrink-0">
              逾期 {insight.daysOverdue}天
            </span>
          )}
        </div>
        <p className="text-[10px] font-medium text-slate-400 truncate">{insight.suggestion}</p>
      </div>
    </button>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  accentColor: string;
  items: ProjectInsight[];
  onSelect: (id: string) => void;
}

function CopilotSection({ icon, title, count, accentColor, items, onSelect }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div style={{ color: accentColor }}>{icon}</div>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
          {title}
        </span>
        <span
          className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: accentColor + '20', color: accentColor }}
        >
          {count}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map(i => (
          <InsightRow key={i.project.id} insight={i} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  projects: Project[];
  onSelectProject: (id: string) => void;
}

export default function ProjectCopilot({ projects, onSelectProject }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const activeProjects = projects.filter(
    p => !p.deleted && !p.archivedAt &&
    !['已成交', '已转订单', 'Converted', '已暂停', '已关闭'].includes(p.tradeStatus)
  );

  const { priority, stale, waitingClient, waitingSupplier, active } = analyzeProjects(projects);

  const highRiskCount = priority.filter(i => i.riskLevel === 'high').length +
    stale.filter(i => i.riskLevel === 'high').length;

  // Don't render if no active projects
  if (activeProjects.length === 0) return null;

  // Don't render if nothing to show
  const hasContent = priority.length > 0 || stale.length > 0 || waitingClient.length > 0 || waitingSupplier.length > 0 || active.length > 0;
  if (!hasContent) return null;

  return (
    <div
      className="rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: GOLD + '40', backgroundColor: '#FFFDF5' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-6 py-4"
        style={{ backgroundColor: NAVY }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <Brain className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">
            项目 AI 分析
          </span>
          {highRiskCount > 0 && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
              {highRiskCount} 高风险
            </span>
          )}
          <span className="text-[9px] font-bold text-slate-500">
            {activeProjects.length} 个活跃项目
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-slate-500">规则引擎 · 即时计算</span>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />
          }
        </div>
      </button>

      {!collapsed && (
        <div className="p-5 space-y-5">
          <CopilotSection
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            title="今日优先跟进"
            count={priority.length}
            accentColor="#EF4444"
            items={priority}
            onSelect={onSelectProject}
          />

          <CopilotSection
            icon={<PauseCircle className="w-3.5 h-3.5" />}
            title="停滞项目"
            count={stale.length}
            accentColor="#8B5CF6"
            items={stale}
            onSelect={onSelectProject}
          />

          <CopilotSection
            icon={<Users className="w-3.5 h-3.5" />}
            title="待客户回复"
            count={waitingClient.length}
            accentColor="#F59E0B"
            items={waitingClient}
            onSelect={onSelectProject}
          />

          <CopilotSection
            icon={<Clock className="w-3.5 h-3.5" />}
            title="等供应商推进"
            count={waitingSupplier.length}
            accentColor="#8B5CF6"
            items={waitingSupplier}
            onSelect={onSelectProject}
          />

          <CopilotSection
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            title="积极推进中"
            count={active.length}
            accentColor="#10B981"
            items={active}
            onSelect={onSelectProject}
          />

          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <CheckCircle className="w-3 h-3 text-slate-300" />
            <span className="text-[9px] font-bold text-slate-300">
              基于 nextActionAt · tradeStatus · projectFollowUps 规则计算 · 点击项目直接跳转
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
