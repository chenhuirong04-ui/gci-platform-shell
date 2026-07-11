import React, { useMemo } from 'react';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronRight, TrendingUp, Activity
} from 'lucide-react';
import { PageHeader, StatCard } from '@gci/design-system';
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

  const nowLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  return (
    <div className="space-y-8" style={{ color: T1 }}>

      {/* Header — shared PageHeader (GCI Design System V1 pilot) */}
      <PageHeader title="控制中心" eyebrow={nowLabel} />

      {/* Stats row — shared StatCard (GCI Design System V1 pilot) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Calendar className="w-5 h-5" />}      label="今日待跟进"     value={todayFollowupCount === null ? null : dashboardStats.todayFollowupCount} color="#8FA6D4" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />}    label="高优先客户 (A)" value={dashboardStats.highPriorityCount}       color={GOLD} />
        <StatCard icon={<Briefcase className="w-5 h-5" />}     label="执行中项目"     value={dashboardStats.executingProjectsCount}  color="#6FBF8E" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="逾期风险 (>3天)" value={dashboardStats.overdueCount}            color="#E0846A" />
      </div>

      {/* 数据概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 成交漏斗 */}
        <div className="rounded-[18px] border p-6 shadow-sm lg:col-span-1" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title="成交漏斗" />
          {(() => {
            const stages: { label: string; statuses: string[]; color: string }[] = [
              { label: '新进入',   statuses: ['新询盘','新建','New Inquiry'],                              color: '#8FA6D4' },
              { label: '跟进中',   statuses: ['跟进中','Following'],                                       color: GOLD },
              { label: '报价阶段', statuses: ['寻价中','已报价','Sourcing','Quoted','已发客户','Sent'],     color: '#B69BD0' },
              { label: '谈判确认', statuses: ['谈判中','已确认','Confirmed'],                              color: '#D9B45A' },
              { label: '合同待签', statuses: ['合同待签'],                                                 color: '#B084C9' },
              { label: '已成交',   statuses: ['已成交','已转订单','Converted'],                            color: '#6FBF8E' },
            ];
            const counts = stages.map(s => activeTasks.filter(t => s.statuses.includes(t.tradeStatus)).length);
            const max = Math.max(...counts, 1);
            return (
              <div className="space-y-3 mt-2">
                {stages.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: T2 }}>{s.label}</span>
                      <span className="text-xs font-black" style={{ color: s.color }}>{counts[i]}</span>
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
          <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="优先级分布" />
          {(() => {
            // Source: 全部业务主档案 — A+B+C == totalBusinesses (invariant)
            const { A, B, C, total } = dashboardStats.priorityStats;
            const pTotal = total || 1;
            const grades = [
              { label: 'A 级 · 高优先', count: A, color: '#E0846A' },
              { label: 'B 级 · 正常',   count: B, color: GOLD },
              { label: 'C 级 · 低优先', count: C, color: '#94A3B8' },
            ];
            return (
              <div className="space-y-4 mt-2">
                {grades.map(g => {
                  const pct = Math.round((g.count / pTotal) * 100);
                  return (
                    <div key={g.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: T2 }}>{g.label}</span>
                        <span className="text-xs font-black" style={{ color: g.color }}>{g.count} 条 · {pct}%</span>
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
                  共 {total} 条业务主档案
                </div>
              </div>
            );
          })()}
        </div>

        {/* 项目类型占比 */}
        <div className="rounded-[18px] border p-6 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} title="项目类型占比" />
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
                    <span className="text-xs font-bold" style={{ color: T2 }}>项目型</span>
                    <span className="text-xs font-black" style={{ color: '#8FA6D4' }}>{proj} 个 · {projPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${projPct}%`, backgroundColor: '#8FA6D4' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: T2 }}>贸易型</span>
                    <span className="text-xs font-black" style={{ color: GOLD }}>{trade} 个 · {tradePct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${tradePct}%`, backgroundColor: GOLD }} />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: '#8FA6D4' }}>{proj}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>项目型</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: GOLD }}>{trade}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>贸易型</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-lg font-black" style={{ color: T1 }}>{dashboardStats.totalBusinesses}</div>
                    <div className="text-[10px] font-bold" style={{ color: T2 }}>总计</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 今日行动中心 — 替换原"快捷操作" */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="font-mono-label text-sm font-black uppercase tracking-widest" style={{ color: T1 }}>
            今日行动中心 · AI Action Center
          </h2>
        </div>
        <ActionCenter
          tasks={tasks}
          projects={projects}
          followupTasks={dashboardStats.todayFollowups}
          pausedTasks={dashboardStats.actionCenterGroups.paused}
          onSelectTask={onSelectTask}
          onTabSwitch={onTabSwitch}
        />
      </div>

    </div>
  );
}
