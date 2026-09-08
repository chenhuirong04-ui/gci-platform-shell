import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronRight, TrendingUp, Users, MessageSquare
} from 'lucide-react';
import { PageHeader, StatCard } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { FollowUpTask, Project } from '../types';

import { getTaskBusinessId, getProjectBusinessId } from '../utils/businessId';
import { buildDashboardStats } from '../utils/dashboardStats';
// CRM Legacy cleanup (2026-09) — "最近更新的业务/最近新增客户/最近新增沟通" now
// read the real Supabase CRM (crm_customers/crm_followups) instead of the
// legacy Notion-sourced FollowUpTask[] used everywhere else on this page.
// Same cross-module import convention already used elsewhere (e.g.
// modules/suppliers/components/QuoteHistory.tsx).
import {
  getRecentlyUpdatedCustomers, getRecentNewCustomers, getRecentFollowupsWithNotes,
  type CrmRecentlyUpdatedRow, type CrmNewCustomerRow, type CrmFollowupWithCustomer,
} from '../../../apps/shell/src/lib/crmSupabase';

interface Props {
  tasks: FollowUpTask[];
  projects: Project[];
  // Authoritative today-follow-up count from API (computed before orphan merge).
  // When non-null, stat card 1 uses this directly. null = sync not yet run.
  todayFollowupCount?: number | null;
  onTabSwitch: (tab: 'dashboard' | 'project' | 'internal' | 'history') => void;
  // 最近新增客户 → 客户工作台
  onSelectTask: (task: FollowUpTask) => void;
  // 最近更新的业务 → 独立业务详情页
  onSelectBusiness: (task: FollowUpTask) => void;
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

// Real-CRM row for the three "recent activity" blocks — deliberately not
// reusing TaskRow (that one is shaped around legacy FollowUpTask fields:
// goal/nextFollowUpAt, neither of which crm_customers/crm_followups have).
// Clicking navigates to the real customer, same deep-link convention
// already used elsewhere for crm/business items (see actionCenter.ts's
// deepLinkFor: /business-assistant?customer=...).
function RealCrmRow({ name, sub, dateLabel, onClick }: { name: string; sub: string | null; dateLabel: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-colors mb-2"
      style={{ background: CARD2, border: `1px solid ${BORDER}` }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(184,150,12,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = CARD2)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GOLD }} />
        <div className="min-w-0">
          <div className="text-sm font-black truncate" style={{ color: T1 }}>{name}</div>
          {sub && <div className="text-xs truncate mt-0.5" style={{ color: T2 }}>{sub}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {dateLabel && <span className="text-[10px] font-bold" style={{ color: T2 }}>{dateLabel}</span>}
        <ChevronRight className="w-3.5 h-3.5" style={{ color: T2 }} />
      </div>
    </button>
  );
}

export default function ControlCenter({ tasks, projects, todayFollowupCount, onTabSwitch, onSelectTask, onSelectBusiness }: Props) {
  const { dict, lang } = useI18n();
  const ct = dict.crm.controlCenter;
  const navigate = useNavigate();

  // ── Real CRM data for the 3 "recent activity" blocks (CRM Legacy cleanup,
  // 2026-09) — fetched independently of the legacy tasks/projects props,
  // which still drive the stat cards above/below (out of this round's scope).
  const [recentUpdated, setRecentUpdated] = useState<CrmRecentlyUpdatedRow[] | null>(null);
  const [recentNewCustomers, setRecentNewCustomers] = useState<CrmNewCustomerRow[] | null>(null);
  const [recentFollowups, setRecentFollowups] = useState<CrmFollowupWithCustomer[] | null>(null);
  useEffect(() => {
    getRecentlyUpdatedCustomers(4).then(res => { if (res.ok) setRecentUpdated(res.rows); });
    getRecentNewCustomers(7).then(res => { if (res.ok) setRecentNewCustomers(res.rows.slice(0, 4)); });
    getRecentFollowupsWithNotes(30).then(res => { if (res.ok) setRecentFollowups(res.rows.slice(0, 4)); });
  }, []);
  const goToCustomer = (name: string) => navigate(`/business-assistant?customer=${encodeURIComponent(name)}`);

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
      // recentBusinesses/recentCustomers/recentComms (legacy-derived) removed
      // (CRM Legacy cleanup, 2026-09) — the three "recent activity" blocks
      // below now read real crm_customers/crm_followups via recentUpdated/
      // recentNewCustomers/recentFollowups state instead.
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
          {recentUpdated === null
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{(lang === 'zh' ? '加载中…' : 'Loading…')}</div>
            : recentUpdated.length === 0
              ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
              : recentUpdated.map(c => (
                  <RealCrmRow
                    key={c.id}
                    name={c.customer_name}
                    sub={c.status || c.business_type}
                    dateLabel={c.updated_at?.slice(0, 10) || null}
                    onClick={() => goToCustomer(c.customer_name)}
                  />
                ))}
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Users className="w-4 h-4" />} title={ct.recentCustomersTitle} />
          {recentNewCustomers === null
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{(lang === 'zh' ? '加载中…' : 'Loading…')}</div>
            : recentNewCustomers.length === 0
              ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
              : recentNewCustomers.map(c => (
                  <RealCrmRow
                    key={c.id}
                    name={c.customer_name}
                    sub={c.business_type || c.source}
                    dateLabel={c.created_at?.slice(0, 10) || null}
                    onClick={() => goToCustomer(c.customer_name)}
                  />
                ))}
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<MessageSquare className="w-4 h-4" />} title={ct.recentCommsTitle} />
          {recentFollowups === null
            ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{(lang === 'zh' ? '加载中…' : 'Loading…')}</div>
            : recentFollowups.length === 0
              ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
              : recentFollowups.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => f.customer_name && goToCustomer(f.customer_name)}
                    className="w-full text-left px-3 py-2.5 rounded-xl mb-2 transition-colors"
                    style={{ background: CARD2, border: `1px solid ${BORDER}` }}
                  >
                    <div className="text-xs font-black truncate" style={{ color: T1 }}>{f.customer_name || '—'}</div>
                    <div className="text-[11px] truncate mt-0.5" style={{ color: T2 }}>{f.notes || f.next_action || '—'}</div>
                  </button>
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
