import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, AlertTriangle, Briefcase,
  ChevronLeft, ChevronRight, TrendingUp, Users, MessageSquare, X
} from 'lucide-react';
import { PageHeader, StatCard } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
// CRM Legacy cleanup (2026-09) — "最近更新的业务/最近新增客户/最近新增沟通" now
// read the real Supabase CRM (crm_customers/crm_followups) instead of the
// legacy Notion-sourced FollowUpTask[] used everywhere else on this page.
// Same cross-module import convention already used elsewhere (e.g.
// modules/suppliers/components/QuoteHistory.tsx).
import {
  getRecentlyUpdatedCustomers, getRecentNewCustomers, getRecentFollowupsWithNotes,
  getAllCustomerNames, getActiveCustomerCount, getTodaysFollowups, getOverdueFollowups,
  getHighPriorityCustomerCount, getAllRecentlyUpdatedCustomers,
  getAllPendingFollowups, getAllFollowupsWithNotes,
  type CrmCustomer, type CrmRecentlyUpdatedRow, type CrmFollowupWithCustomer,
} from '../../../apps/shell/src/lib/crmSupabase';
// Business Overview data-source cleanup (2026-09-16) — "项目总数" now reads
// the real crm_projects table instead of the legacy old-cache-derived
// businessType='PROJECT' count. Same cross-module import convention as the
// crmSupabase import above.
import { listAllProjects } from '../../../apps/shell/src/lib/crmProjects';

const GOLD = '#B8960C';
const NAVY = '#0F172A';
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const PAGE_SIZE = 20;

type AllListKey = 'businesses' | 'pending' | 'followups';
type AllListRow = CrmRecentlyUpdatedRow | CrmCustomer | CrmFollowupWithCustomer;

function sortPendingItems(rows: CrmCustomer[]): CrmCustomer[] {
  const today = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  const rank = (row: CrmCustomer) => {
    if (row.next_follow_up_at && row.next_follow_up_at.slice(0, 10) < today) return 0;
    const status = (row.status || '').toLowerCase();
    if (status.includes('待报价') || status.includes('quote')) return 1;
    if (status.includes('待确认') || status.includes('需求') || status.includes('confirm')) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (a.next_follow_up_at || '9999').localeCompare(b.next_follow_up_at || '9999'));
}

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

export default function ControlCenter() {
  const { dict, lang } = useI18n();
  const ct = dict.crm.controlCenter;
  const navigate = useNavigate();

  // ── Real CRM data for the 3 "recent activity" blocks (CRM Legacy cleanup,
  // 2026-09) — fetched independently of the legacy tasks/projects props,
  // which still drive the stat cards above/below (out of this round's scope).
  const [recentUpdated, setRecentUpdated] = useState<CrmRecentlyUpdatedRow[] | null>(null);
  const [pendingFollowups, setPendingFollowups] = useState<CrmCustomer[] | null>(null);
  const [recentFollowups, setRecentFollowups] = useState<CrmFollowupWithCustomer[] | null>(null);
  const [allList, setAllList] = useState<AllListKey | null>(null);
  const [allRows, setAllRows] = useState<AllListRow[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState(false);
  const [allPage, setAllPage] = useState(1);

  // Business Overview data-source cleanup (2026-09-16) — real crm_customers/
  // crm_projects counts, replacing the legacy old-cache-derived
  // `overview` block below (which counted contactKey groups out of the old
  // Notion-sourced Follow-up Log, not the real CRM table at all — the
  // "28 vs actual 9" bug). null = not loaded yet, never coerced to 0.
  const [customerTotal, setCustomerTotal] = useState<number | null>(null);
  const [newCustomers7d, setNewCustomers7d] = useState<number | null>(null);
  const [activeCustomers30d, setActiveCustomers30d] = useState<number | null>(null);
  const [projectTotal, setProjectTotal] = useState<number | null>(null);

  // Business Overview data-source cleanup (2026-09-16, third revision) — the
  // bottom 4 task-oriented KPIs, same treatment: real crm_customers/
  // crm_followups/crm_projects queries, replacing buildDashboardStats()'s
  // old-cache-derived numbers (which this file no longer computes at
  // all — see the removed `dashboardStats` useMemo below). 高优先客户 reuses
  // the exact "isFocus" rule already established in getBossDecisions()
  // (priority contains 重点, or is exactly 'A') via
  // getHighPriorityCustomerCount() — not a new business rule.
  const [todayFollowupsReal, setTodayFollowupsReal] = useState<number | null>(null);
  const [highPriorityReal, setHighPriorityReal] = useState<number | null>(null);
  const [activeProjectsReal, setActiveProjectsReal] = useState<number | null>(null);
  const [overdueReal, setOverdueReal] = useState<number | null>(null);

  useEffect(() => {
    getRecentlyUpdatedCustomers(4).then(res => { if (res.ok) setRecentUpdated(res.rows); });
    getRecentNewCustomers(7).then(res => {
      if (res.ok) setNewCustomers7d(res.rows.length);
    });
    getRecentFollowupsWithNotes(30).then(res => { if (res.ok) setRecentFollowups(res.rows.slice(0, 4)); });
    getAllCustomerNames().then(res => { if (res.ok) setCustomerTotal(res.rows.length); });
    getActiveCustomerCount(30).then(res => { if (res.ok) setActiveCustomers30d(res.count); });
    listAllProjects().then(rows => {
      setProjectTotal(rows.length);
      setActiveProjectsReal(rows.filter(p => p.status === 'active').length);
    });
    Promise.all([getTodaysFollowups(), getOverdueFollowups()]).then(([today, overdue]) => {
      if (today.ok) setTodayFollowupsReal(today.rows.length);
      if (overdue.ok) setOverdueReal(overdue.rows.length);
      if (today.ok && overdue.ok) {
        const byId = new Map<string, CrmCustomer>();
        [...overdue.rows, ...today.rows].forEach(row => byId.set(row.id, row));
        setPendingFollowups([...byId.values()]);
      }
    });
    getHighPriorityCustomerCount().then(res => { if (res.ok) setHighPriorityReal(res.count); });
  }, []);
  const goToCustomer = (name: string) => navigate(`/business-assistant?customer=${encodeURIComponent(name)}`);
  const goToComms = () => navigate('/crm?tab=comms');
  const goToCustomerRecord = (id: string) => navigate(`/crm-customers?customer_id=${encodeURIComponent(id)}`);

  useEffect(() => {
    if (!allList) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAllList(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allList]);

  const openAll = async (key: AllListKey) => {
    setAllList(key);
    setAllRows([]);
    setAllPage(1);
    setAllError(false);
    setAllLoading(true);
    const result = key === 'businesses'
      ? await getAllRecentlyUpdatedCustomers()
      : key === 'pending'
        ? await getAllPendingFollowups()
        : await getAllFollowupsWithNotes();
    if (result.ok) {
      setAllRows(key === 'pending' ? sortPendingItems(result.rows as CrmCustomer[]) : result.rows);
    } else {
      setAllError(true);
    }
    setAllLoading(false);
  };

  const pendingItems = useMemo(() => {
    if (pendingFollowups === null) return null;
    return sortPendingItems(pendingFollowups).slice(0, 4);
  }, [pendingFollowups]);

  const allPageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const allPageRows = allRows.slice((allPage - 1) * PAGE_SIZE, allPage * PAGE_SIZE);
  const allTitle = allList === 'businesses'
    ? ct.recentBusinessesTitle
    : allList === 'pending'
      ? ct.recentCustomersTitle
      : ct.recentCommsTitle;

  // Legacy `dashboardStats` (buildDashboardStats(tasks, todayFollowupCount))
  // removed in the 2026-09-16 (third revision) cleanup — every number it
  // produced has now been replaced by a real query above; nothing in this
  // file reads it anymore, so it's gone rather than left computed-but-unused.

  // Legacy `overview` block (old-cache-derived customer/new7/active30
  // counts) removed in the 2026-09-16 data-source cleanup — see
  // customerTotal/newCustomers7d/activeCustomers30d state above, all real
  // crm_customers queries now. `quoting`/`archived` were computed here but
  // never actually rendered anywhere on this page — dead code, dropped
  // along with the rest of this block rather than carried forward unused.

  const nowLabel = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  return (
    <div className="space-y-8" style={{ color: T1 }}>

      {/* Header — shared PageHeader (GCI Design System V1 pilot) */}
      <PageHeader title={ct.pageTitle} eyebrow={nowLabel} />

      {/* Business Overview stats (V1) — asset-first framing: how many
          customers/projects exist and what changed recently.
          Data-source cleanup (2026-09-16, second revision): 项目型/贸易型/
          执行中 REMOVED — crm_projects has no businessType/tradeStatus-style
          classification field yet (only `status`:
          active/completed/on_hold/cancelled, no 项目型-vs-贸易型 concept at
          all), and Production's real crm_projects is currently empty (0
          rows) — showing the old legacy-tasks-derived numbers here would
          silently keep mixing a real table with legacy data, exactly what
          this cleanup removes. Hidden, not zeroed, until crm_projects (or a
          successor field) actually has a real classification to show. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewCustomers}</div>
          <div className="text-2xl font-black mt-1" style={{ color: T1 }}>{customerTotal === null ? '—' : customerTotal}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewBusinesses}</div>
          <div className="text-2xl font-black mt-1" style={{ color: T1 }}>{projectTotal === null ? '—' : projectTotal}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewNew7}</div>
          <div className="text-2xl font-black mt-1" style={{ color: GOLD }}>{newCustomers7d === null ? '—' : newCustomers7d}</div>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T2 }}>{ct.overviewActive30}</div>
          <div className="text-2xl font-black mt-1" style={{ color: GOLD }}>{activeCustomers30d === null ? '—' : activeCustomers30d}</div>
        </div>
      </div>

      {/* Recent activity — three compact lists so "最近有多少项目/客户/沟通"
          is answerable at a glance without opening another tab. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-[18px] border p-5 shadow-sm flex flex-col" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} title={ct.recentBusinessesTitle} />
          <div className="flex-1">
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
          <button onClick={() => void openAll('businesses')} className="mt-2 w-full border-t pt-3 text-right text-xs font-black transition-colors" style={{ borderColor: BORDER, color: GOLD }}>{ct.viewAll}</button>
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm flex flex-col" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<Users className="w-4 h-4" />} title={ct.recentCustomersTitle} />
          <div className="flex-1">
            {pendingItems === null
              ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{(lang === 'zh' ? '加载中…' : 'Loading…')}</div>
              : pendingItems.length === 0
                ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noPendingItems}</div>
                : pendingItems.map(c => (
                    <RealCrmRow
                      key={c.id}
                      name={c.customer_name}
                      sub={[c.status, c.next_action || c.follow_up_notes].filter(Boolean).join(' · ') || null}
                      dateLabel={c.next_follow_up_at?.slice(0, 10) || null}
                      onClick={() => goToCustomer(c.customer_name)}
                    />
                  ))}
          </div>
          <button onClick={() => void openAll('pending')} className="mt-2 w-full border-t pt-3 text-right text-xs font-black transition-colors" style={{ borderColor: BORDER, color: GOLD }}>{ct.viewAll}</button>
        </div>
        <div className="rounded-[18px] border p-5 shadow-sm flex flex-col" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <SectionHeader icon={<MessageSquare className="w-4 h-4" />} title={ct.recentCommsTitle} />
          <div className="flex-1">
            {recentFollowups === null
              ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{(lang === 'zh' ? '加载中…' : 'Loading…')}</div>
              : recentFollowups.length === 0
                ? <div className="text-xs font-medium py-3" style={{ color: T2 }}>{ct.noRecentItems}</div>
                : recentFollowups.map((f) => (
                    <RealCrmRow
                      key={f.id}
                      name={f.customer_name || '—'}
                      sub={f.notes || f.next_action || '—'}
                      dateLabel={f.follow_up_date?.slice(0, 10) || null}
                      onClick={() => f.customer_name ? goToCustomer(f.customer_name) : goToComms()}
                    />
                  ))}
          </div>
          <button onClick={() => void openAll('followups')} className="mt-2 w-full border-t pt-3 text-right text-xs font-black transition-colors" style={{ borderColor: BORDER, color: GOLD }}>{ct.viewAll}</button>
        </div>
      </div>

      {allList && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={allTitle}>
          <button className="absolute inset-0 bg-black/70" aria-label={ct.close} onClick={() => setAllList(null)} />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[20px] border shadow-2xl" style={{ background: NAVY, borderColor: 'rgba(203,168,92,0.35)' }}>
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div>
                <h2 className="text-base font-black" style={{ color: T1 }}>{allTitle}</h2>
                {!allLoading && !allError && <p className="mt-1 text-[11px] font-bold" style={{ color: T2 }}>{ct.totalRecords.replace('{count}', String(allRows.length))}</p>}
              </div>
              <button onClick={() => setAllList(null)} className="rounded-lg p-2" aria-label={ct.close} style={{ color: T2 }}><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {allLoading && <div className="py-10 text-center text-sm font-bold" style={{ color: T2 }}>{lang === 'zh' ? '加载中…' : 'Loading…'}</div>}
              {allError && <div className="py-10 text-center text-sm font-bold" style={{ color: '#E0846A' }}>{ct.loadError}</div>}
              {!allLoading && !allError && allPageRows.length === 0 && <div className="py-10 text-center text-sm font-bold" style={{ color: T2 }}>{allList === 'pending' ? ct.noPendingItems : ct.noRecentItems}</div>}
              {!allLoading && !allError && allPageRows.map(row => {
                if (allList === 'businesses') {
                  const c = row as CrmRecentlyUpdatedRow;
                  return <RealCrmRow key={c.id} name={c.customer_name} sub={c.status || c.business_type} dateLabel={c.updated_at?.slice(0, 10) || null} onClick={() => goToCustomerRecord(c.id)} />;
                }
                if (allList === 'pending') {
                  const c = row as CrmCustomer;
                  return <RealCrmRow key={c.id} name={c.customer_name} sub={[c.status, c.next_action || c.follow_up_notes].filter(Boolean).join(' · ') || null} dateLabel={c.next_follow_up_at?.slice(0, 10) || null} onClick={() => goToCustomerRecord(c.id)} />;
                }
                const f = row as CrmFollowupWithCustomer;
                return <RealCrmRow key={f.id} name={f.customer_name || '—'} sub={f.notes || f.next_action || '—'} dateLabel={f.follow_up_date?.slice(0, 10) || null} onClick={() => goToCustomerRecord(f.customer_id)} />;
              })}
            </div>

            {!allLoading && !allError && allRows.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: BORDER }}>
                <button disabled={allPage === 1} onClick={() => setAllPage(page => Math.max(1, page - 1))} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-30" style={{ color: GOLD, border: `1px solid ${BORDER}` }}><ChevronLeft className="h-3.5 w-3.5" />{ct.previousPage}</button>
                <span className="text-[11px] font-bold" style={{ color: T2 }}>{ct.pageOf.replace('{page}', String(allPage)).replace('{total}', String(allPageCount))}</span>
                <button disabled={allPage === allPageCount} onClick={() => setAllPage(page => Math.min(allPageCount, page + 1))} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-30" style={{ color: GOLD, border: `1px solid ${BORDER}` }}>{ct.nextPage}<ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task-oriented KPIs — kept, but now secondary to the overview above */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Calendar className="w-5 h-5" />}      label={ct.kpiFollowupsToday} value={todayFollowupsReal} color="#8FA6D4" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />}    label={ct.kpiHighPriority}   value={highPriorityReal}   color={GOLD} />
        <StatCard icon={<Briefcase className="w-5 h-5" />}     label={ct.kpiActiveProjects} value={activeProjectsReal} color="#6FBF8E" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label={ct.kpiOverdueRisk}    value={overdueReal}        color="#E0846A" />
      </div>

      {/* 优先级分布 / 项目类型占比 / 客户阶段大图表 / AI Action Center — removed
          from Business Overview rendering per 2026-08 simplification. Their
          underlying components/data (ActionCenter.tsx, dashboardStats stage
          counts) are untouched and still used elsewhere; this page just no
          longer renders them. */}

    </div>
  );
}
