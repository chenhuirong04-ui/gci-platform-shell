// GCI Executive Desk — Task 7: Boss Action Center.
// Read-only aggregation across CRM / Gmail / Calendar / business data /
// Systems Registry / AI Agents Status. Discovers, sorts, and displays only —
// never writes to any of those systems and never fabricates an item that
// isn't backed by real underlying data.
import { getTodaysFollowups, getOverdueFollowups, getBossDecisions } from './crmSupabase';
import { getImportantEmails, getCalendarEvents } from './googleSearch';
import { getSystemRegistry } from './systemRegistry';
import { AGENTS } from '../components/AgentsStatus';

export type ActionPriority = 'P1' | 'P2' | 'P3';
export type ActionSource = 'crm' | 'email' | 'calendar' | 'business' | 'systems' | 'agents';

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

// GCI operates on Asia/Dubai (UTC+4) — same +4h-shift pattern used by
// calendar-events.ts's dubaiDateStr() and crmSupabase.ts's todayISO(). Never
// compare raw UTC dates/times, which would be wrong ~4 hours a day.
function dubaiNowMs(): number {
  return Date.now() + 4 * 3600 * 1000;
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
  ]);

  const actions: BossAction[] = [];
  const nowMs = dubaiNowMs();

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
};
