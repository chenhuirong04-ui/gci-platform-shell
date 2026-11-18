// GET /api/crm/followups-due   (GIA P5, read-only)
// CRM 客户跟进：due today + overdue, from the formal CRM (crm_customers) — the
// same lists and rules as the Home 工作台 (lib/crmSupabase getTodaysFollowups /
// getOverdueFollowups + DailyWorkbench buildWorkbenchCrmStats):
//   • active customers only (is_active = true)
//   • due today: next_follow_up_at = today (Dubai)
//   • overdue: next_follow_up_at < today, status not closed (已关闭 / 已完成 / closed / done)
//   • urgent: 需求整理中, or 已报价待确认 and ≥ 3 days late, or priority A / 重点
// Read as the caller (crm_customers RLS: authenticated only). Nothing is written.
import { requireModule } from '../_lib/auth';
import { json, userRows, clip } from '../company/_read';

export const config = { runtime: 'edge' };

const CLOSED = ['已关闭', '已完成', 'closed', 'done'];
const QUOTE_ESCALATE_DAYS = 3;

interface Customer {
  id: string; customer_name?: string | null; status?: string | null; priority?: string | null; owner?: string | null;
  next_follow_up_at?: string | null; last_follow_up_at?: string | null; next_action?: string | null; follow_up_notes?: string | null;
}

export const dubaiToday = (now = Date.now()) => new Date(now + 4 * 3600 * 1000).toISOString().slice(0, 10);
const priorityTier = (p: string | null | undefined) => {
  const v = (p || '').trim();
  return v.includes('重点') || v.toUpperCase() === 'A' ? 'A' : v;
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86400000);

export function buildFollowups(rows: Customer[], today: string) {
  const items = rows
    .filter((c) => c.next_follow_up_at)
    .filter((c) => !CLOSED.includes((c.status || '').trim().toLowerCase()))
    .map((c) => {
      const next = String(c.next_follow_up_at).slice(0, 10);
      const overdueDays = Math.max(0, daysBetween(next, today));
      const status = c.status || '';
      const priority = priorityTier(c.priority);
      const urgent = status === '需求整理中' || (status === '已报价待确认' && overdueDays >= QUOTE_ESCALATE_DAYS) || priority === 'A';
      return {
        customer: c.customer_name || '—',
        status: status || null,
        priority: priority || null,
        owner: c.owner || null,
        nextFollowUpAt: next,
        overdueDays,
        due: overdueDays > 0 ? `逾期 ${overdueDays} 天` : '今天',
        urgent,
        nextAction: c.next_action ? clip(c.next_action, 200) : null,
        lastFollowUpAt: c.last_follow_up_at ? String(c.last_follow_up_at).slice(0, 10) : null,
        lastNote: c.follow_up_notes ? clip(c.follow_up_notes, 200) : null,
      };
    })
    .filter((i) => i.nextFollowUpAt <= today)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.overdueDays - a.overdueDays || a.customer.localeCompare(b.customer));
  return {
    today,
    counts: {
      dueToday: items.filter((i) => i.overdueDays === 0).length,
      overdue: items.filter((i) => i.overdueDays > 0).length,
      overdueOver3Days: items.filter((i) => i.overdueDays > 3).length,
      urgent: items.filter((i) => i.urgent).length,
    },
    items,
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['crm']);
  if (!auth.ok) return auth.response;
  try {
    const today = dubaiToday();
    const rows = await userRows<Customer>(auth.ctx, 'crm_customers',
      `select=id,customer_name,status,priority,owner,next_follow_up_at,last_follow_up_at,next_action,follow_up_notes&is_active=eq.true&next_follow_up_at=lte.${today}&order=next_follow_up_at.asc&limit=500`);
    return json({
      ok: true,
      source: 'crm_customers（CRM 客户与项目 · 首页工作台跟进规则）',
      ...buildFollowups(rows, today),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
