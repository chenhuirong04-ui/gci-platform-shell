// AI Workspace — CRM sections of the Daily Brief and Customer 360 result panels.
// Data comes ONLY from the formal Supabase CRM (crm_customers / crm_followups) through crmSupabase.ts.
// Nothing is read from localStorage or any Notion cache. On an empty or failed read the section degrades
// to a short notice — it never throws and never blanks the parent panel.
import { useEffect, useState } from 'react';
import { getTodaysFollowups, getOverdueFollowups, findCustomerByName } from '../lib/crmSupabase';
import type { CrmCustomer, CrmFollowup } from '../lib/crmSupabase';

const MUTED = '#8A97B0';
const TEXT = '#E8F0FF';
const SUBTLE = '#5A6A84';
const RED = '#E0846A';
const BLUE = '#5BA3C9';
const PRIO_COLOR: Record<string, string> = { A: RED, B: '#D4A843', C: MUTED };

// Same "Asia/Dubai calendar date" rule as crmSupabase.ts (UTC+4).
export function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** crm_customers.priority is free text: 重点 / A count as the top ("A") tier, anything else is shown as written. */
export function priorityTier(p: string | null | undefined): string {
  const v = (p || '').trim();
  return v.includes('重点') || v.toUpperCase() === 'A' ? 'A' : v;
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((new Date(toDate.slice(0, 10)).getTime() - new Date(fromDate.slice(0, 10)).getTime()) / 86400000);
}

export interface CrmBriefItem {
  id: string;
  clientName: string;
  tradeStatus: string;
  nextFollowUpAt: string;
  priority: string;
  owner: string;
  daysOverdue: number;
  isOverdue: boolean;
}
export interface CrmBriefStats {
  todayCount: number;
  overdueCount: number;
  highPriorityCount: number;
  topItems: CrmBriefItem[];
}

/** Daily-brief numbers from the formal follow-up lists: due today + overdue, "overdue" = more than 3 days late. */
export function buildBriefStats(today: CrmCustomer[], overdue: Array<CrmCustomer & { overdueDays: number }>): CrmBriefStats {
  const t = dubaiToday();
  const seen = new Set<string>();
  const items: CrmBriefItem[] = [];
  for (const c of [...overdue, ...today]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const nextFollowUpAt = (c.next_follow_up_at || '').slice(0, 10);
    const daysOverdue = nextFollowUpAt ? Math.max(0, daysBetween(nextFollowUpAt, t)) : 0;
    items.push({
      id: c.id,
      clientName: c.customer_name || '—',
      tradeStatus: c.status || '—',
      nextFollowUpAt,
      priority: priorityTier(c.priority),
      owner: c.owner || '',
      daysOverdue,
      isOverdue: daysOverdue > 3,
    });
  }
  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const pa = a.priority === 'A' ? 0 : 1;
    const pb = b.priority === 'A' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.nextFollowUpAt < b.nextFollowUpAt ? -1 : a.nextFollowUpAt > b.nextFollowUpAt ? 1 : 0;
  });
  return {
    todayCount: items.length,
    overdueCount: items.filter((i) => i.isOverdue).length,
    highPriorityCount: items.filter((i) => i.priority === 'A').length,
    topItems: items.slice(0, 5),
  };
}

const NOTICE: React.CSSProperties = { padding: '8px 12px', background: 'rgba(143,166,212,0.06)', border: '1px solid rgba(143,166,212,0.2)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' };

export function CrmBriefSection() {
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'error'; error: string } | { phase: 'ok'; stats: CrmBriefStats }>({ phase: 'loading' });
  useEffect(() => {
    let alive = true;
    Promise.all([getTodaysFollowups(), getOverdueFollowups()])
      .then(([t, o]) => {
        if (!alive) return;
        if (!t.ok) return setState({ phase: 'error', error: t.error });
        if (!o.ok) return setState({ phase: 'error', error: o.error });
        setState({ phase: 'ok', stats: buildBriefStats(t.rows, o.rows) });
      })
      .catch((e) => alive && setState({ phase: 'error', error: String(e?.message || e) }));
    return () => { alive = false; };
  }, []);

  if (state.phase === 'loading') return <div style={{ marginTop: 10, fontSize: 11, color: MUTED }}>正在读取 CRM 跟进数据…</div>;
  if (state.phase === 'error') {
    return (
      <div style={{ marginTop: 10, ...NOTICE }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8FA6D4', marginBottom: 2 }}>CRM 跟进数据暂时无法读取</div>
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>请稍后重试，或前往 CRM 客户页查看。</div>
        </div>
      </div>
    );
  }
  const s = state.stats;
  if (s.todayCount === 0) {
    return <div style={{ marginTop: 10, fontSize: 11, color: MUTED }}>CRM：今日没有到期或逾期的跟进。</div>;
  }
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(91,163,201,0.06)', border: '1px solid rgba(91,163,201,0.22)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>CRM 跟进（正式客户库）</span>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(91,163,201,0.12)', color: BLUE, fontFamily: 'monospace' }}>crm_customers</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(91,163,201,0.08)', border: '1px solid rgba(91,163,201,0.18)' }}>
          <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>今日应跟进</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>{s.todayCount} 个</div>
        </div>
        {s.overdueCount > 0 && (
          <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.2)' }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>已超期</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>{s.overdueCount} 个</div>
          </div>
        )}
        {s.highPriorityCount > 0 && (
          <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.15)' }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>重点客户</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>{s.highPriorityCount} 个</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {s.topItems.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: item.isOverdue ? 'rgba(224,132,106,0.07)' : 'rgba(255,255,255,0.025)' }}>
            {item.priority && <span style={{ fontSize: 9, fontWeight: 700, color: PRIO_COLOR[item.priority] || MUTED, minWidth: 12 }}>{item.priority}</span>}
            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.clientName}</span>
            <span style={{ fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>{item.tradeStatus}</span>
            {item.owner && <span style={{ fontSize: 10, color: SUBTLE, whiteSpace: 'nowrap' }}>{item.owner}</span>}
            {item.isOverdue && <span style={{ fontSize: 9, color: RED, fontWeight: 700, whiteSpace: 'nowrap' }}>超期 {item.daysOverdue}天</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

type CustomerState =
  | { phase: 'loading' }
  | { phase: 'error'; error: string }
  | { phase: 'none' }
  | { phase: 'multiple'; names: string[] }
  | { phase: 'found'; customer: CrmCustomer; followups: CrmFollowup[] };

export function CrmCustomerSection({ customerQuery, aliases }: { customerQuery: string; aliases: string[] }) {
  const [state, setState] = useState<CustomerState>({ phase: 'loading' });
  const key = [customerQuery, ...aliases].join('');
  useEffect(() => {
    let alive = true;
    setState({ phase: 'loading' });
    (async () => {
      const terms = [customerQuery, ...aliases].map((s) => (s || '').trim()).filter(Boolean);
      let multiple: string[] | null = null;
      for (const term of terms) {
        const r = await findCustomerByName(term);
        if (!r.ok) return alive && setState({ phase: 'error', error: r.error });
        if (r.found) return alive && setState({ phase: 'found', customer: r.customer, followups: r.followups });
        if (r.multiple && !multiple) multiple = r.candidates.map((c) => c.customer_name);
      }
      if (alive) setState(multiple ? { phase: 'multiple', names: multiple } : { phase: 'none' });
    })().catch((e) => alive && setState({ phase: 'error', error: String(e?.message || e) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.phase === 'loading') return <div style={{ marginTop: 8, fontSize: 11, color: MUTED }}>正在读取 CRM 客户记录…</div>;
  if (state.phase === 'error') {
    return (
      <div style={{ marginTop: 8, ...NOTICE }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>CRM 客户数据暂时无法读取，请稍后重试。</div>
      </div>
    );
  }
  if (state.phase === 'none') {
    return (
      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(143,166,212,0.04)', border: '1px solid rgba(143,166,212,0.15)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: MUTED }}>未在 CRM 客户库中找到「{customerQuery}」。如有拼写不同，请前往 CRM 客户页搜索。</div>
      </div>
    );
  }
  if (state.phase === 'multiple') {
    return (
      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(143,166,212,0.04)', border: '1px solid rgba(143,166,212,0.15)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: MUTED }}>CRM 中有多个相近客户：{state.names.slice(0, 8).join(' / ')}。请指定更完整的名称。</div>
      </div>
    );
  }
  const c = state.customer;
  const tier = priorityTier(c.priority);
  const next = (c.next_follow_up_at || '').slice(0, 10);
  const daysOverdue = next ? daysBetween(next, dubaiToday()) : 0;
  const isOverdue = daysOverdue > 3;
  const goal = c.next_action || '';
  const lastContext = c.follow_up_notes || state.followups[0]?.notes || '';
  return (
    <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(91,163,201,0.06)', border: '1px solid rgba(91,163,201,0.22)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>CRM 跟进（正式客户库）</span>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(91,163,201,0.12)', color: BLUE, fontFamily: 'monospace' }}>
          {state.followups.length} 条近期跟进
        </span>
      </div>
      <div style={{ padding: '8px 10px', borderRadius: 7, background: isOverdue ? 'rgba(224,132,106,0.07)' : 'rgba(255,255,255,0.025)', border: `1px solid ${isOverdue ? 'rgba(224,132,106,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {tier && <span style={{ fontSize: 9, fontWeight: 700, color: PRIO_COLOR[tier] || MUTED }}>{tier === 'A' ? 'A级' : tier}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{c.customer_name}</span>
          {c.status && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(91,163,201,0.1)', color: BLUE }}>{c.status}</span>}
          {isOverdue && <span style={{ fontSize: 9, color: RED, fontWeight: 700 }}>超期 {daysOverdue}天</span>}
        </div>
        {goal && <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>下一步：{goal}</div>}
        {lastContext && <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>上次：{lastContext}</div>}
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: SUBTLE }}>
          {next && <span>下次跟进：{next}</span>}
          {c.owner && <span>负责人：{c.owner}</span>}
        </div>
      </div>
    </div>
  );
}
