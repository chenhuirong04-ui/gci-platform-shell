import React, { useMemo } from 'react';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronRight, TrendingUp, Activity
} from 'lucide-react';
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

function StatCard({ icon, label, count, color }: {
  icon: React.ReactNode; label: string; count: number | null; color: string; bg?: string;
}) {
  return (
    <div className="bg-white rounded-[18px] border p-5 flex items-center gap-4 shadow-sm relative overflow-hidden" style={{ borderColor: NAVY + '14' }}>
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[18px]" style={{ backgroundColor: color }} />
      <div className="p-2.5 rounded-xl bg-slate-50 ml-1">
        <div style={{ color }}>{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-black" style={{ color: NAVY, fontFamily: "'Space Grotesk',sans-serif" }}>
          {count === null ? <span className="text-slate-300">-</span> : count}
        </div>
        <div className="text-xs font-bold mt-0.5 text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, color = NAVY }: {
  icon: React.ReactNode; title: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div style={{ color }}>{icon}</div>
      <h2 className="font-mono-label text-sm font-black uppercase tracking-widest" style={{ color }}>{title}</h2>
    </div>
  );
}

function TaskRow({ task, onClick }: { task: FollowUpTask; onClick: () => void }) {
  const isOverdue = task.nextFollowUpAt &&
    task.nextFollowUpAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
  // Prefer task.businessId (Notion-synced) over derived ID
  const bizId = (task as any).businessId || getTaskBusinessId(task.id);
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100 mb-2"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: isOverdue ? '#EF4444' : GOLD }} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: NAVY + '10', color: NAVY }}>{bizId}</span>
            )}
            <div className="text-sm font-black text-slate-800 truncate">{task.clientName}</div>
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{task.goal}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {isOverdue && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">逾期</span>
        )}
        <span className="text-[10px] font-bold text-slate-400">{task.nextFollowUpAt?.slice(0, 10)}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
      </div>
    </button>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const typeColor = project.type === '项目型' ? '#6366F1' : GOLD;
  // Prefer project.businessId (from Notion-synced tasks) over derived ID
  const bizId = (project as any).businessId || getProjectBusinessId(project.id);
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 bg-white mb-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor }} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {bizId && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: NAVY + '10', color: NAVY }}>{bizId}</span>
            )}
            <div className="text-sm font-black truncate" style={{ color: NAVY }}>{project.clientName}</div>
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{project.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: typeColor + '15', color: typeColor }}>
          {project.type}
        </span>
        <span className="text-[10px] font-bold text-slate-400">{project.tradeStatus}</span>
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
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY, fontFamily: "'Space Grotesk',sans-serif" }}>业务控制中心</h1>
        <p className="font-mono-label text-xs font-bold mt-1" style={{ color: GOLD }}>{nowLabel}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Calendar className="w-5 h-5" />}      label="今日待跟进"           count={todayFollowupCount === null ? null : dashboardStats.todayFollowupCount} color="#8FA6D4" bg="#F8FAFC" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />}    label="高优先客户 (A)"        count={dashboardStats.highPriorityCount}       color={GOLD}    bg="#FFFBEB" />
        <StatCard icon={<Briefcase className="w-5 h-5" />}     label="执行中项目"            count={dashboardStats.executingProjectsCount}  color="#6FBF8E" bg="#F8FAFC" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="逾期风险 (>3天)"       count={dashboardStats.overdueCount}            color="#E0846A" bg="#F8FAFC" />
      </div>

      {/* 数据概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 成交漏斗 */}
        <div className="rounded-[18px] border p-6 shadow-sm lg:col-span-1" style={{ backgroundColor: '#F8FAFC', borderColor: NAVY + '14' }}>
          <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title="成交漏斗" color={NAVY} />
          {(() => {
            const stages: { label: string; statuses: string[]; color: string }[] = [
              { label: '新进入',   statuses: ['新询盘','新建','New Inquiry'],                              color: '#8FA6D4' },
              { label: '跟进中',   statuses: ['跟进中','Following'],                                       color: GOLD },
              { label: '报价阶段', statuses: ['寻价中','已报价','Sourcing','Quoted','已发客户','Sent'],     color: '#B69BD0' },
              { label: '谈判确认', statuses: ['谈判中','已确认','Confirmed'],                              color: '#D9B45A' },
              { label: '已成交',   statuses: ['已成交','已转订单','Converted'],                            color: '#6FBF8E' },
            ];
            const counts = stages.map(s => activeTasks.filter(t => s.statuses.includes(t.tradeStatus)).length);
            const max = Math.max(...counts, 1);
            return (
              <div className="space-y-3 mt-2">
                {stages.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-500">{s.label}</span>
                      <span className="text-xs font-black" style={{ color: s.color }}>{counts[i]}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
        <div className="rounded-[18px] border p-6 shadow-sm" style={{ backgroundColor: '#F8FAFC', borderColor: NAVY + '14' }}>
          <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="优先级分布" color={NAVY} />
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
                        <span className="text-xs font-bold text-slate-500">{g.label}</span>
                        <span className="text-xs font-black" style={{ color: g.color }}>{g.count} 条 · {pct}%</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: g.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="mt-4 rounded-xl px-4 py-2 text-xs font-black text-center"
                  style={{ backgroundColor: '#F1F5F9', color: NAVY }}>
                  共 {total} 条业务主档案
                </div>
              </div>
            );
          })()}
        </div>

        {/* 项目类型占比 */}
        <div className="rounded-[18px] border p-6 shadow-sm" style={{ backgroundColor: '#F8FAFC', borderColor: NAVY + '14' }}>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} title="项目类型占比" color={NAVY} />
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
                    <span className="text-xs font-bold text-slate-500">项目型</span>
                    <span className="text-xs font-black" style={{ color: NAVY }}>{proj} 个 · {projPct}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${projPct}%`, backgroundColor: NAVY }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-500">贸易型</span>
                    <span className="text-xs font-black" style={{ color: GOLD }}>{trade} 个 · {tradePct}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${tradePct}%`, backgroundColor: GOLD }} />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 rounded-xl p-3 text-center bg-slate-50">
                    <div className="text-lg font-black" style={{ color: NAVY }}>{proj}</div>
                    <div className="text-[10px] font-bold text-slate-400">项目型</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center bg-slate-50">
                    <div className="text-lg font-black" style={{ color: GOLD }}>{trade}</div>
                    <div className="text-[10px] font-bold text-slate-400">贸易型</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center bg-slate-50">
                    <div className="text-lg font-black text-slate-700">{dashboardStats.totalBusinesses}</div>
                    <div className="text-[10px] font-bold text-slate-400">总计</div>
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
          <h2 className="font-mono-label text-sm font-black uppercase tracking-widest" style={{ color: NAVY }}>
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
