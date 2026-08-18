// GCI Executive Desk — Task 7: Boss Action Center.
// Read-only aggregation across CRM / Gmail / Calendar / business data /
// Systems Registry / AI Agents Status. Discovers, sorts, and displays only —
// never writes to any of those systems and never fabricates an item that
// isn't backed by real underlying data.
import { getTodaysFollowups, getOverdueFollowups, getBossDecisions } from './crmSupabase';
import { getImportantEmails, getCalendarEvents } from './googleSearch';
import { getSystemRegistry } from './systemRegistry';
import { AGENTS } from '../components/AgentsStatus';
import { getDecisionFollowThroughActions } from './decisionInbox';
import { getOpenCommitmentActions } from './commitments';
import { getMiaStatus } from './mia';
import { getChanyaStatus } from './chanya';
import { getExecutiveTasks, taskUrgency } from './executiveTasks';

export type ActionPriority = 'P1' | 'P2' | 'P3';
export type ActionSource = 'crm' | 'email' | 'calendar' | 'business' | 'systems' | 'agents' | 'decisions' | 'commitments' | 'mia' | 'chanya' | 'tasks';

export interface BossAction {
  id: string;
  source: ActionSource;
  category: string;
  title: string;
  summary: string;
  priority: ActionPriority;
  due_at: string | null;
  related_customer: string | null;
  related_system: string | null;
  action_type: string;
  deep_link: string;
}

async function safeFetchJson<T = any>(url: string): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `Bad response (${res.status})` };
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export async function getBossActions(): Promise<
  { ok: true; actions: BossAction[] } | { ok: false; error: string }
> {
  const [
    todaysFollowups,
    overdue,
    bossDecisions,
    importantEmails,
    calendarToday,
    systemRegistry,
    quotationFollowups,
    invoiceSummary,
    inventoryAlerts,
    decisionFollowThrough,
    commitmentActions,
    miaStatus,
    executiveTasks,
    chanyaStatus,
  ] = await Promise.all([
    getTodaysFollowups(),
    getOverdueFollowups(),
    getBossDecisions(),
    getImportantEmails(),
    getCalendarEvents('today'),
    getSystemRegistry(),
    safeFetchJson<any>(`${base()}/api/trade/check-quotation-followups`),
    safeFetchJson<any>(`${base()}/api/invoice/pending-summary`),
    safeFetchJson<any>(`${base()}/api/trade/check-inventory`),
    getDecisionFollowThroughActions(),
    getOpenCommitmentActions(),
    getMiaStatus(),
    getExecutiveTasks(),
    getChanyaStatus(),
  ]);

  // A Decision that already has an open Commitment tracking its next step
  // must not also generate a separate Decision Follow-through action for the
  // same decision — Commitment wins, per Task 10 §8.
  const commitmentDecisionIds = new Set(commitmentActions.map((c) => c.relatedDecisionId).filter((id): id is string => !!id));

  const actions: BossAction[] = [];
  // Real epoch, not the Dubai-shifted "date-string" epoch — hoursUntilStart
  // below compares against a real, already timezone-correct meeting start
  // time, so nowMs must be the real current instant (Date.now()). Using the
  // +4h-shifted epoch here double-counts the offset and makes meetings look
  // ~4h closer than they are (same bug class fixed in decisionInbox.ts).
  const nowMs = Date.now();

  // ── 1. CRM ───────────────────────────────────────────────────────────
  if (overdue.ok) {
    for (const c of overdue.rows) {
      actions.push({
        id: `crm-overdue-${c.id}`,
        source: 'crm',
        category: 'CRM',
        title: `${c.customer_name} — 跟进已逾期 ${c.overdueDays} 天`,
        summary: c.next_action || c.follow_up_notes || '需要跟进',
        priority: 'P1',
        due_at: c.next_follow_up_at,
        related_customer: c.customer_name,
        related_system: null,
        action_type: 'crm_followup',
        deep_link: '/crm?tab=dashboard',
      });
    }
  }

  if (todaysFollowups.ok) {
    for (const c of todaysFollowups.rows) {
      actions.push({
        id: `crm-today-${c.id}`,
        source: 'crm',
        category: 'CRM',
        title: `${c.customer_name} — 今天需要跟进`,
        summary: c.next_action || c.follow_up_notes || '今日待跟进',
        priority: 'P1',
        due_at: c.next_follow_up_at,
        related_customer: c.customer_name,
        related_system: null,
        action_type: 'crm_followup',
        deep_link: '/crm?tab=dashboard',
      });
    }
  }

  if (bossDecisions.ok) {
    for (const it of bossDecisions.items) {
      // "已逾期跟进" duplicates the overdue block above (same underlying rule) — skip.
      if (it.reason === '已逾期跟进') continue;
      actions.push({
        id: `crm-decision-${it.id}-${it.reason}`,
        source: 'crm',
        category: 'CRM',
        title: `${it.customerName} — ${it.reason}`,
        summary: it.detail,
        priority: 'P2',
        due_at: null,
        related_customer: it.customerName,
        related_system: null,
        action_type: 'crm_decision',
        deep_link: '/crm?tab=dashboard',
      });
    }
  }

  // ── 2. Gmail — reuses Task 5.2's explainable rule (unread, last 7 days,
  // excl. promotions/social). This rule has no signal for whether a message
  // is actually customer-related (it also matches notifications/newsletters
  // like Vercel/Zoom/bank alerts) — per §3 "if uncertain, downgrade — never
  // inflate to P1", every result here is P2, never P1. Escalating requires
  // a real customer-relevance signal, which is out of this round's scope. ──
  if (importantEmails.ok) {
    for (const m of importantEmails.results) {
      const dateMs = new Date(m.date).getTime();
      const priority: ActionPriority = 'P2';
      actions.push({
        id: `email-${m.id}`,
        source: 'email',
        category: 'Email',
        title: `${m.sender} — ${m.subject}`,
        summary: m.snippet,
        priority,
        due_at: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null,
        related_customer: null,
        related_system: null,
        action_type: 'email_review',
        deep_link: m.link,
      });
    }
  }

  // ── 3. Calendar (today) — starting within 2h → P1, later today → P2.
  // Meetings more than 1h in the past are dropped (nothing left to do). ──
  if (calendarToday.ok) {
    for (const e of calendarToday.results) {
      const startMs = new Date(e.start).getTime();
      if (!Number.isFinite(startMs)) continue;
      const hoursUntilStart = (startMs - nowMs) / 3600000;
      if (hoursUntilStart < -1) continue;
      const priority: ActionPriority = hoursUntilStart <= 2 ? 'P1' : 'P2';
      actions.push({
        id: `cal-${e.title}-${e.start}`,
        source: 'calendar',
        category: 'Calendar',
        title: e.title,
        summary: [e.location, e.attendees.join(', ')].filter(Boolean).join(' · '),
        priority,
        due_at: new Date(startMs).toISOString(),
        related_customer: null,
        related_system: null,
        action_type: 'calendar_meeting',
        deep_link: e.meetingLink || '',
      });
    }
  }

  // ── 4. Business data — reuses existing endpoints as-is, no source changes. ─
  if (quotationFollowups && quotationFollowups.ok) {
    for (const q of quotationFollowups.quotes ?? []) {
      if (!q.overdue) continue;
      actions.push({
        id: `quote-${q.id}`,
        source: 'business',
        category: 'Quotation',
        title: `${q.customerName} — 报价 ${q.daysAgo} 天未回复`,
        summary: q.projectName || q.quoteNo,
        priority: 'P1',
        due_at: null,
        related_customer: q.customerName,
        related_system: null,
        action_type: 'quotation_followup',
        deep_link: '/trade?tab=history',
      });
    }
  }

  if (invoiceSummary && invoiceSummary.ok) {
    const waiting = (invoiceSummary.items ?? []).filter((i: any) => i.status === 'waiting_approval');
    if (waiting.length > 0) {
      actions.push({
        id: 'invoice-waiting-approval',
        source: 'business',
        category: 'Invoice',
        title: `${waiting.length} 份发票待审批`,
        summary: waiting.slice(0, 3).map((i: any) => i.customerName).join('、'),
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: null,
        action_type: 'invoice_review',
        deep_link: '/trade?tab=finance',
      });
    }
  }

  if (inventoryAlerts && inventoryAlerts.ok && (inventoryAlerts.alertCount ?? 0) > 0) {
    actions.push({
      id: 'inventory-alerts',
      source: 'business',
      category: 'Inventory',
      title: `${inventoryAlerts.alertCount} 项库存异常`,
      summary: `缺货 ${inventoryAlerts.outOfStockCount ?? 0} · 低库存 ${inventoryAlerts.lowStockCount ?? 0} · 异常 ${inventoryAlerts.anomalyCount ?? 0}`,
      priority: (inventoryAlerts.outOfStockCount ?? 0) > 0 ? 'P1' : 'P2',
      due_at: null,
      related_customer: null,
      related_system: null,
      action_type: 'inventory_alert',
      deep_link: '/trade?tab=inventory',
    });
  }

  // ── 5. Systems Registry ──────────────────────────────────────────────
  if (systemRegistry.ok) {
    for (const r of systemRegistry.rows) {
      if (r.deletion_status === 'review') {
        actions.push({
          id: `sys-review-${r.id}`,
          source: 'systems',
          category: 'Systems',
          title: `${r.system_name} — 待复核（删除状态: review）`,
          summary: r.notes || '需要确认是否仍在使用',
          priority: 'P2',
          due_at: null,
          related_customer: null,
          related_system: r.system_name,
          action_type: 'systems_review',
          deep_link: '/systems',
        });
      } else if (!r.lifecycle_status || r.lifecycle_status === 'unknown' || r.lifecycle_status === 'legacy') {
        actions.push({
          id: `sys-legacy-${r.id}`,
          source: 'systems',
          category: 'Systems',
          title: `${r.system_name} — 生命周期状态待确认`,
          summary: r.notes || `当前状态: ${r.lifecycle_status ?? 'unknown'}`,
          priority: 'P3',
          due_at: null,
          related_customer: null,
          related_system: r.system_name,
          action_type: 'systems_audit',
          deep_link: '/systems',
        });
      }
    }
  }

  // ── 6. AI Agents Status — only real error/needsChris/warning states
  // generate an action; no_data / deferred / healthy agents never do. ─────
  for (const a of AGENTS) {
    if (a.status === 'error' || a.needsChris > 0) {
      actions.push({
        id: `agent-${a.name}`,
        source: 'agents',
        category: 'Agents',
        title: `${a.name} — 需要你决定`,
        summary: a.todaySummary,
        priority: 'P1',
        due_at: null,
        related_customer: null,
        related_system: a.name,
        action_type: 'agent_decision',
        deep_link: '/',
      });
    } else if (a.status === 'warning') {
      actions.push({
        id: `agent-warn-${a.name}`,
        source: 'agents',
        category: 'Agents',
        title: `${a.name} — 状态异常`,
        summary: a.todaySummary,
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: a.name,
        action_type: 'agent_warning',
        deep_link: '/',
      });
    }
  }

  // ── 6.4 Business To-Do (Task 16) — priority derived purely from due_at,
  // same taskUrgency() rule used by /tasks and the Home KPI. Only open/
  // in_progress tasks ever generate an action; completed/cancelled never do.
  if (executiveTasks.ok) {
    for (const t of executiveTasks.rows) {
      if (t.status !== 'open' && t.status !== 'in_progress') continue;
      actions.push({
        id: `task-${t.id}`,
        source: 'tasks',
        category: 'Business To-Do',
        title: t.title,
        summary: t.description || t.business_area,
        priority: taskUrgency(t, nowMs),
        due_at: t.due_at,
        related_customer: null,
        related_system: null,
        action_type: 'business_todo',
        deep_link: '/tasks',
      });
    }
  }

  // ── 6.5 MIA (Task 14.1) — only real blocking errors or a genuine "needs
  // Chris" backlog generate an action. Plain leads_found_today never does —
  // discovering leads is MIA's normal, expected daily output, not a
  // boss-level event. Deliberately at most one P1 + one P2 so a bad day
  // doesn't spam the Action Center with one row per lead. ─────────────────
  if (miaStatus.ok) {
    const d = miaStatus.data;
    if (d.status === 'error') {
      actions.push({
        id: 'mia-error',
        source: 'mia',
        category: 'MIA',
        title: 'MIA｜客户开发 AI — 运行异常',
        summary: `今日异常 ${d.errors} 次，可能阻塞正常运行`,
        priority: 'P1',
        due_at: null,
        related_customer: null,
        related_system: 'MIA',
        action_type: 'mia_error',
        deep_link: '/',
      });
    }
    if (d.needs_chris > 0) {
      actions.push({
        id: 'mia-needs-chris',
        source: 'mia',
        category: 'MIA',
        title: `MIA｜客户开发 AI — ${d.needs_chris} 件需要你处理`,
        summary: `今日回复 ${d.replies_today} 条，其中 ${d.needs_chris} 件等待人工判断`,
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: 'MIA',
        action_type: 'mia_needs_chris',
        deep_link: '/',
      });
    } else if (d.status === 'warning') {
      actions.push({
        id: 'mia-warning',
        source: 'mia',
        category: 'MIA',
        title: 'MIA｜客户开发 AI — 状态异常',
        summary: `今日异常 ${d.errors} 次，未阻塞运行但需留意`,
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: 'MIA',
        action_type: 'mia_warning',
        deep_link: '/',
      });
    }
  }

  // ── 6.6 Chanya (Task 18.1) — same discipline as MIA: normal operation
  // (new signups, routine paid conversions) never generates an action, only
  // real payment failures, system errors, subscription anomalies, or an
  // actual needs_chris backlog. Safe no-op today since getChanyaStatus()
  // returns ok:false until Chanya deploys its own /api/executive-status. ──
  if (chanyaStatus.ok) {
    const c = chanyaStatus.data;
    if (c.status === 'error') {
      actions.push({
        id: 'chanya-error',
        source: 'chanya',
        category: 'Chanya',
        title: 'Chanya｜运营监控 — 系统异常',
        summary: c.issues.length > 0 ? c.issues.join('；') : '系统状态异常，可能阻塞正常运行',
        priority: 'P1',
        due_at: null,
        related_customer: null,
        related_system: 'Chanya',
        action_type: 'chanya_error',
        deep_link: '/',
      });
    }
    if (c.payment_failures_today > 0) {
      actions.push({
        id: 'chanya-payment-failures',
        source: 'chanya',
        category: 'Chanya',
        title: `Chanya｜运营监控 — ${c.payment_failures_today} 笔支付失败`,
        summary: `今日 ${c.payment_failures_today} 笔支付失败，可能导致订阅中断`,
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: 'Chanya',
        action_type: 'chanya_payment_failure',
        deep_link: '/',
      });
    }
    if (c.needs_chris > 0) {
      actions.push({
        id: 'chanya-needs-chris',
        source: 'chanya',
        category: 'Chanya',
        title: `Chanya｜运营监控 — ${c.needs_chris} 件需要你处理`,
        summary: `今日有 ${c.needs_chris} 件需要人工判断（订阅/账户异常等）`,
        priority: 'P2',
        due_at: null,
        related_customer: null,
        related_system: 'Chanya',
        action_type: 'chanya_needs_chris',
        deep_link: '/',
      });
    }
  }

  // ── 7. Decision Follow-through (Task 9) — execution gaps + due follow-ups
  // on already-decided items. Never the raw Decision itself (that lives in
  // Decision Inbox); these are distinct "still needs a next step" entries. ──
  for (const it of decisionFollowThrough) {
    if (commitmentDecisionIds.has(it.decisionId)) continue;
    actions.push({
      id: it.id,
      source: 'decisions',
      category: 'Decision Follow-through',
      title: it.title,
      summary: it.reason,
      priority: it.priority,
      due_at: it.dueAt,
      related_customer: null,
      related_system: null,
      action_type: it.kind === 'execution' ? 'decision_execution' : 'decision_follow_up',
      deep_link: '/decisions',
    });
  }

  // ── 8. Commitments (Task 10) — explicit promises Chris confirmed. ───────
  for (const c of commitmentActions) {
    actions.push({
      id: c.id,
      source: 'commitments',
      category: 'Commitments',
      title: c.title,
      summary: c.reason,
      priority: c.priority,
      due_at: c.dueAt,
      related_customer: null,
      related_system: null,
      action_type: 'commitment',
      deep_link: c.sourceLink || '/commitments',
    });
  }

  const order: Record<ActionPriority, number> = { P1: 0, P2: 1, P3: 2 };
  actions.sort((a, b) => {
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    return 0;
  });

  return { ok: true, actions };
}

export interface ActionCounts {
  p1: number;
  p2: number;
  p3: number;
}

export function summarizeActions(actions: BossAction[]): ActionCounts {
  return {
    p1: actions.filter((a) => a.priority === 'P1').length,
    p2: actions.filter((a) => a.priority === 'P2').length,
    p3: actions.filter((a) => a.priority === 'P3').length,
  };
}

export const SOURCE_LABEL: Record<ActionSource, string> = {
  crm: 'CRM',
  email: 'Email',
  calendar: 'Calendar',
  business: 'Business',
  systems: 'Systems',
  agents: 'Agents',
  decisions: 'Decisions',
  commitments: 'Commitments',
  mia: 'MIA',
  chanya: 'Chanya',
  tasks: 'To-Do',
};
