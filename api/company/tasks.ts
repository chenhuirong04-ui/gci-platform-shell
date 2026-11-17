// GET /api/company/tasks?status=&query=&area=&owner=   (GIA P4, read-only)
// 内部事项 (executive_tasks — the same table InternalTasksView / Tasks page and
// the Home 我的事项 tile read): every task with its full description,
// owner, blocker, due / reminder dates, completion and the complete follow-up
// log, plus status counts. status: open | in_progress | completed | cancelled |
// active (= open + in_progress, default) | all. Overdue = active and due_at < now.
// Auth: requireModule(any GCI module) — executive_tasks is readable by every
// signed-in user (RLS); read as the caller.
import { requireModule } from '../_lib/auth';
import { json, userRows, norm } from './_read';

export const config = { runtime: 'edge' };

interface Task {
  id: string; title?: string; description?: string | null; business_area?: string; status?: string; priority?: string;
  due_at?: string | null; reminder_at?: string | null; related_customer_id?: string | null; source?: string;
  created_at?: string; updated_at?: string; completed_at?: string | null; owner?: string | null; blocker?: string | null; logs?: unknown[] | null;
}

const STATUS_ZH: Record<string, string> = { open: '待办', in_progress: '进行中', completed: '已完成', cancelled: '已取消' };
const AREA_ZH: Record<string, string> = { '25H_AI': '25H / AI', TRADE: '贸易', WORKFORCE: '劳务', ECOMMERCE: '电商', COMPANY_ADMIN: '公司事务', OTHER: '其他' };
const ACTIVE = new Set(['open', 'in_progress']);

export function buildTasks(tasks: Task[], customers: Map<string, string>, now: Date, opts: { status?: string; query?: string; area?: string; owner?: string } = {}) {
  const nowIso = now.toISOString();
  const isOverdue = (t: Task) => ACTIVE.has(String(t.status)) && !!t.due_at && t.due_at < nowIso;
  const st = (opts.status || 'active').toLowerCase();
  const q = norm(opts.query);
  const area = norm(opts.area);
  const owner = norm(opts.owner);
  const logsText = (t: Task) => (Array.isArray(t.logs) ? JSON.stringify(t.logs) : '');
  const matched = tasks.filter((t) =>
    (st === 'all' || (st === 'active' ? ACTIVE.has(String(t.status)) : st === 'overdue' ? isOverdue(t) : t.status === st)) &&
    (!q || norm([t.title, t.description, t.blocker, t.owner, logsText(t)].join(' ')).includes(q)) &&
    (!area || norm(t.business_area).includes(area) || norm(AREA_ZH[String(t.business_area)]).includes(area)) &&
    (!owner || norm(t.owner).includes(owner)))
    .sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const count = (f: (t: Task) => boolean) => tasks.filter(f).length;
  return {
    counts: {
      total: tasks.length,
      open: count((t) => t.status === 'open'),
      inProgress: count((t) => t.status === 'in_progress'),
      completed: count((t) => t.status === 'completed'),
      cancelled: count((t) => t.status === 'cancelled'),
      overdue: count(isOverdue),
      activeWithoutDueDate: count((t) => ACTIVE.has(String(t.status)) && !t.due_at),
      activeWithoutOwner: count((t) => ACTIVE.has(String(t.status)) && !t.owner),
    },
    filters: { status: st, query: opts.query || null, area: opts.area || null, owner: opts.owner || null },
    matchedCount: matched.length,
    tasks: matched.slice(0, 50).map((t) => ({
      title: t.title || '—',
      status: STATUS_ZH[String(t.status)] || t.status,
      priority: t.priority || null,
      area: AREA_ZH[String(t.business_area)] || t.business_area || null,
      owner: t.owner || null,
      dueAt: t.due_at || null,
      overdue: isOverdue(t),
      reminderAt: t.reminder_at || null,
      description: t.description || null,
      blocker: t.blocker || null,
      relatedCustomer: t.related_customer_id ? customers.get(t.related_customer_id) || null : null,
      followUpLog: Array.isArray(t.logs) ? t.logs : [],
      source: t.source || null,
      createdAt: t.created_at || null,
      completedAt: t.completed_at || null,
    })),
    note: matched.length > 50 ? `仅显示前 50 条，共 ${matched.length} 条` : undefined,
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['crm', 'trade', 'quotation', 'finance', 'warehouse', 'knowledge_public', 'knowledge', 'knowledge_confidential']);
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  try {
    const tasks = await userRows<Task>(auth.ctx, 'executive_tasks', 'select=*&order=due_at.asc.nullslast,created_at.desc&limit=2000');
    const ids = Array.from(new Set(tasks.map((t) => t.related_customer_id).filter(Boolean))) as string[];
    const customers = ids.length
      ? await userRows<{ id: string; customer_name: string }>(auth.ctx, 'crm_customers', `select=id,customer_name&id=in.(${ids.join(',')})`).catch(() => [])
      : [];
    return json({
      ok: true,
      source: 'executive_tasks（内部事项）',
      ...buildTasks(tasks, new Map(customers.map((c) => [c.id, c.customer_name])), new Date(), {
        status: p.get('status') || '', query: p.get('query') || '', area: p.get('area') || '', owner: p.get('owner') || '',
      }),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
