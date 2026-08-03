import React, { useMemo } from 'react';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronRight, TrendingUp, Users, MessageSquare
} from 'lucide-react';
import { PageHeader, StatCard } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { FollowUpTask, Project } from '../types';

import { getTaskBusinessId, getProjectBusinessId } from '../utils/businessId';
import { buildDashboardStats } from '../utils/dashboardStats';
import { isRealCommLog } from '../utils/commLog';

interface Props {
  tasks: FollowUpTask[];
  projects: Project[];
  // Authoritative today-follow-up count from API (computed before orphan merge).
  // When non-null, stat card 1 uses this directly. null = sync not yet run.
  todayFollowupCount?: number | null;
  onTabSwitch: (tab: 'dashboard' | 'project' | 'internal' | 'history') => void;
  onSelectTask: (task: FollowUpTask) => void;
}

const GOLD = '#B8960C';
const NAVY = '#0F172A';
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';

function SectionHeader({ icon, title, color = T1 }: {
  icon: React.ReactNode; title: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div style={{ color: GOLD }}>{icon}</div>
      <h2 className="font-mono-label text-sm font-black uppercase tracking-widest" style={{ color }}>{title}</h2>
    </div>
  );
}

function TaskRow({ task, onClick }: { task: FollowUpTask; onClick: () => void }) {
  const isOverdue = task.nextFollowUpAt &&
    task.nextFollowUpAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
  const bizId = (task as any).businessId || getTaskBusinessId(task.id);
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-colors mb-2"
      style={{ background: CARD2, border: `1px solid ${BORDER}` }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(184,150,12,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = CARD2)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: isOverdue ? '#EF4444' : GOLD }} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: `${GOLD}22`, color: GOLD }}>{bizId}</span>
            )}
            <div className="text-sm font-black truncate" style={{ color: T1 }}>{task.clientName}</div>
          </div>
          <div className="text-xs truncate mt-0.5" style={{ color: T2 }}>{task.goal}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {isOverdue && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">逾期</span>
        )}
        <span className="text-[10px] font-bold" style={{ color: T2 }}>{task.nextFollowUpAt?.slice(0, 10)}</span>
        <ChevronRight className="w-3.5 h-3.5" style={{ color: T2 }} />
      </div>
    </button>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const typeColor = project.type === '项目型' ? '#8FA6D4' : GOLD;
  const bizId = (project as any).businessId || getProjectBusinessId(project.id);
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-2"
      style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor }} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: `${GOLD}22`, color: GOLD }}>{bizId}</span>
            )}
            <div className="text-sm font-black truncate" style={{ color: T1 }}>{project.clientName}</div>
          </div>
          <div className="text-xs truncate mt-0.5" style={{ color: T2 }}>{project.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: typeColor + '22', color: typeColor }}>
          {project.type}
        </span>
        <span className="text-[10px] font-bold" style={{ color: T2 }}>{project.tradeStatus}</span>
      </div>
    </div>
  );
}

export default function ControlCenter({ tasks, projects, todayFollowupCount, onTabSwitch, onSelectTask }: Props) {
  const { dict, lang } = useI18n();
  const ct = dict.crm.controlCenter;

  // ── Single source of truth for all dashboard numbers ────────────────────────
  const dashboardStats = useMemo(
    () => buildDashboardStats(tasks, todayFollowupCount),
    [tasks, todayFollowupCount],
  );

  // activeTasks: used only for 成交漏斗 (analytics pipeline funnel).
  // Uses notionSource filter to exclude orphan records.
  const EXCLUDED_FROM_FUNNEL = ['暂缓', '执行中', '已成交', '已归档', '已转订单'];
  const activeTasks = tasks.filter(t =>
    t.status === 'todo' &&
    !EXCLUDED_FROM_FUNNEL.includes(t.tradeStatus) &&
    (t as any).notionSource !== 'contact_only'
  );

  // ── Business Overview stats (V1) — reuses the same non-deleted task set;
  // "客户总数" groups by contactKey (falling back to clientName), matching
  // the exact identity logic CustomerDirectory.tsx uses, so the two numbers
  // stay consistent with each other.
  const overview = useMemo(() => {
    const nonDeleted = tasks.filter(t => t.status !== 'deleted');
    const daysAgo = (iso: string) => {
      if (!iso) return Infinity;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return Infinity;
      return Math.round((Date.now() - d.getTime()) / 86400000);
    };
    const customerGroups = new Map<string, string>();
    for (const t of nonDeleted) {
      const key = (t.contactKey || '').trim().toLowerCase() || (t.clientName || '').trim().toLowerCase() || t.id;
      if (!customerGroups.has(key)) customerGroups.set(key, key);
    }
    return {
      customers: customerGroups.size,
      new7: nonDeleted.filter(t => daysAgo(t.createdAt) <= 7).length,
      active30: nonDeleted.filter(t => daysAgo(t.updatedAt || t.createdAt) <= 30 && t.status !== 'archived').length,
      quoting: nonDeleted.filter(t => t.tradeStatus === '待报价' && t.status !== 'archived').length,
      archived: nonDeleted.filter(t => t.status === 'archived').length,
      // Most recently updated businesses / customers / communications, for
      // the three "recent activity" lists below.
      recentBusinesses: [...nonDeleted]
        .filter(t => t.status !== 'archived')
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
        .slice(0, 4),
      recentCustomers: (() => {
        const firstSeen = new Map<string, FollowUpTask>();
        for (const t of nonDeleted) {
          const key = (t.contactKey || '').trim().toLowerCase() || (t.clientName || '').trim().toLowerCase() || t.id;
          const existing = firstSeen.get(key);
          if (!existing || (t.createdAt || '') < (existing.createdAt || '')) firstSeen.set(key, t);
        }
        return [...firstSeen.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4);
      })(),
      // Real human/customer communications only — excludes system audit
      // entries like "已记录（AI分析中）" / "AI 分析完成" / status-change logs.
      recentComms: (() => {
        const flat: { task: FollowUpTask; timestamp: string; message: string }[] = [];
        for (const t of nonDeleted) {
          for (const h of (t.history || [])) {
            if (h?.timestamp && h?.message && isRealCommLog(h)) flat.push({ task: t, timestamp: h.timestamp, message: h.message });
          }
        }
        return flat.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 4);
      })(),
    };
  }, [tasks]);

  const nowLabel = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  return (
    <div className="space-y-8" style={{ color: T1 }}>

      {/* Header — shared PageHeader (GCI Design System V1 pilot) */}
      <PageHeader title={ct.pageTitle} eyebrow={nowLabel} />

      {/* Business Overview stats (V1) — asset-first framing: how many
          customers/businesses exist and what changed recently, ahead of the
          task-oriented KPIs below. */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewCustomers}</div>
          <div className="text-2xl font-black mt-1" style={{ color: T1 }}>{overview.customers}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewBusinesses}</div>
          <div className="text-2xl font-black mt-1" style={{ color: T1 }}>{dashboardStats.totalBusinesses}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewNew7}</div>
          <div className="text-2xl font-black mt-1" style={{ color: GOLD }}>{overview.new7}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewActive30}</div>
          <div className="text-2xl font-black mt-1" style={{ color: GOLD }}>{overview.active30}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.projectBased}</div>
          <div className="text-2xl font-black mt-1" style={{ color: '#8FA6D4' }}>{dashboardStats.totalProjects}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.trading}</div>
          <div className="text-2xl font-black mt-1" style={{ color: GOLD }}>{dashboardStats.totalTrades}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewExecuting}</div>
          <div className="text-2xl font-black mt-1" style={{ color: '#6FBF8E' }}>{dashboardStats.executingBusinessesCount}</div>
        </div>
      </div>

      {/* Recent activity — three compact lists so "最近有多少项目/客户/沟通"
          is answerable at a glance without opening another tab. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-[18px] border p-5 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} title={ct.recentBusinessesTitle} />
          {overview.recentBusinesses.length === 0
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
            : overview.recentBusinesses.map(t => <TaskRow key={t.id} task={t} onClick={() => onSelectTask(t)} />)}
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Users className="w-4 h-4" />} title={ct.recentCustomersTitle} />
          {overview.recentCustomers.length === 0
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
            : overview.recentCustomers.map(t => <TaskRow key={t.id} task={t} onClick={() => onSelectTask(t)} />)}
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<MessageSquare className="w-4 h-4" />} title={ct.recentCommsTitle} />
          {overview.recentComms.length === 0
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
            : overview.recentComms.map((c, i) => (
                <div key={i} className="px-3 py-2.5 rounded-xl mb-2" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                  <div className="text-xs font-black truncate" style={{ color: T1 }}>{c.task.clientName}</div>
                  <div className="text-[11px] truncate mt-0.5" style={{ color: T2 }}>{c.message}</div>
                </div>
              ))}
        </div>
      </div>

      {/* Task-oriented KPIs — kept, but now secondary to the overview above */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Calendar className="w-5 h-5" />}      label={ct.kpiFollowupsToday} value={todayFollowupCount === null ? null : dashboardStats.todayFollowupCount} color="#8FA6D4" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />}    label={ct.kpiHighPriority}   value={dashboardStats.highPriorityCount}       color={GOLD} />
        <StatCard icon={<Briefcase className="w-5 h-5" />}     label={ct.kpiActiveProjects} value={dashboardStats.executingProjectsCount}  color="#6FBF8E" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label={ct.kpiOverdueRisk}    value={dashboardStats.overdueCount}            color="#E0846A" />
      </div>

      {/* 优先级分布 / 项目类型占比 / 客户阶段大图表 / AI Action Center — removed
          from Business Overview rendering per 2026-08 simplification. Their
          underlying components/data (ActionCenter.tsx, dashboardStats stage
          counts) are untouched and still used elsewhere; this page just no
          longer renders them. */}

    </div>
  );
}
