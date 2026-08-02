import React, { useMemo, useState } from 'react';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronRight, TrendingUp, Activity, Users, MessageSquare, ChevronDown, ChevronUp
} from 'lucide-react';
import { PageHeader, StatCard } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { FollowUpTask, Project } from '../types';
import ActionCenter from './ActionCenter';

import { getTaskBusinessId, getProjectBusinessId } from '../utils/businessId';
import { buildDashboardStats } from '../utils/dashboardStats';

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
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
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
      recentComms: (() => {
        const flat: { task: FollowUpTask; timestamp: string; message: string }[] = [];
        for (const t of nonDeleted) {
          for (const h of (t.history || [])) {
            if (h?.timestamp && h?.message) flat.push({ task: t, timestamp: h.timestamp, message: h.message });
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewQuoting}</div>
          <div className="text-2xl font-black mt-1" style={{ color: '#D9B45A' }}>{overview.quoting}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewExecuting}</div>
          <div className="text-2xl font-black mt-1" style={{ color: '#6FBF8E' }}>{dashboardStats.executingBusinessesCount}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewArchived}</div>
          <div className="text-2xl font-black mt-1" style={{ color: T2 }}>{overview.archived}</div>
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

      {/* 数据概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 客户跟进状态 */}
        <div className="rounded-[18px] border p-6 shadow-sm lg:col-span-1" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title={ct.followupStatusTitle} />
          {(() => {
            const stages: { label: string; status: string; color: string }[] = [
              { label: ct.stageNewInquiry,                 status: '新询盘',       color: '#8FA6D4' },
              { label: ct.stageRequirementsInProgress,     status: '需求整理中',   color: '#A78BFA' },
              { label: ct.stagePendingQuotation,           status: '待报价',       color: GOLD },
              { label: ct.stageQuotedAwaitingConfirmation, status: '已报价待确认', color: '#D9B45A' },
              { label: ct.stageContractPending,            status: '合同待签',     color: '#B084C9' },
              { label: ct.stageInProgress,                 status: '执行中',       color: '#6FBF8E' },
              { label: ct.stageDelivered,                  status: '已交付',       color: '#34D399' },
            ];
            const allActive = tasks.filter(t =>
              t.status !== 'deleted' && t.status !== 'archived' &&
              (t as any).notionSource !== 'contact_only'
            );
            const counts = stages.map(s => allActive.filter(t => t.tradeStatus === s.status).length);
            const max = Math.max(...counts, 1);
            return (
              <div className="space-y-3 mt-2">
                {stages.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: T2 }}>{s.label}</span>
                      <span className="text-xs font-black" style={{ color: counts[i] > 0 ? s.color : T2 }}>{counts[i]}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(counts[i] / max) * 100}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* 优先级分布 */}
        <div className="rounded-[18px] border p-6 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title={ct.priorityDistributionTitle} />
          {(() => {
            // Source: 全部业务主档案 — A+B+C == totalBusinesses (invariant)
            const { A, B, C, total } = dashboardStats.priorityStats;
            const pTotal = total || 1;
            const grades = [
              { label: ct.gradeAHigh,   count: A, color: '#E0846A' },
              { label: ct.gradeBNormal, count: B, color: GOLD },
              { label: ct.gradeCLow,    count: C, color: '#94A3B8' },
            ];
            return (
              <div className="space-y-4 mt-2">
                {grades.map(g => {
                  const pct = Math.round((g.count / pTotal) * 100);
                  return (
                    <div key={g.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: T2 }}>{g.label}</span>
                        <span className="text-xs font-black" style={{ color: g.color }}>{ct.unitRecordsPct.replace('{n}', String(g.count)).replace('{pct}', String(pct))}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: g.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="mt-4 rounded-xl px-4 py-2 text-xs font-black text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: T1 }}>
                  {ct.totalBusinessRecords.replace('{n}', String(total))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 项目类型占比 */}
        <div className="rounded-[18px] border p-6 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} title={ct.projectTypeDistributionTitle} />
          {(() => {
            // Source: 全部业务主档案 (same source as totalBusinesses)
            const proj  = dashboardStats.totalProjects;
            const trade = dashboardStats.totalTrades;
            const total = proj + trade || 1;
            const projPct  = Math.round((proj  / total) * 100);
            const tradePct = 100 - projPct;
            return (
              <div className="space-y-5 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: T2 }}>{ct.projectBased}</span>
                    <span className="text-xs font-black" style={{ color: '#8FA6D4' }}>{ct.unitCountPct.replace('{n}', String(proj)).replace('{pct}', String(projPct))}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${projPct}%`, backgroundColor: '#8FA6D4' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: T2 }}>{ct.trading}</span>
                    <span className="text-xs font-black" style={{ color: GOLD }}>{ct.unitCountPct.replace('{n}', String(trade)).replace('{pct}', String(tradePct))}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${tradePct}%`, backgroundColor: GOLD }} />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: '#8FA6D4' }}>{proj}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>{ct.projectBased}</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: GOLD }}>{trade}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>{ct.trading}</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: T1 }}>{dashboardStats.totalBusinesses}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>{ct.total}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 今日行动中心 — secondary/optional, collapsed by default. Not the
          page's core focus anymore; AI suggestions inside stay manually
          triggered (unchanged from the earlier opt-in batch). */}
      <div>
        <button
          onClick={() => setActionCenterOpen(v => !v)}
          className="w-full flex items-center justify-between gap-2 mb-4 px-1 py-1"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: GOLD }} />
            <h2 className="font-mono-label text-sm font-black uppercase tracking-widest" style={{ color: T1 }}>
              {ct.todayActionCenterTitle} · AI Action Center
            </h2>
          </span>
          {actionCenterOpen ? <ChevronUp className="w-4 h-4" style={{ color: T2 }} /> : <ChevronDown className="w-4 h-4" style={{ color: T2 }} />}
        </button>
        {actionCenterOpen && (
          <ActionCenter
            tasks={tasks}
            projects={projects}
            followupTasks={dashboardStats.todayFollowups}
            pausedTasks={dashboardStats.actionCenterGroups.paused}
            onSelectTask={onSelectTask}
            onTabSwitch={onTabSwitch}
          />
        )}
      </div>

    </div>
  );
}
